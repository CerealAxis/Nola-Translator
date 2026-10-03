import { randomUUID } from 'node:crypto'

import { BrowserWindow, ipcMain, screen } from 'electron'

import type { EngineEvent, SessionConfig } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { MeetingStore } from './meeting-store'
import { computeOverlayBounds } from './windows'

export const IPC_CHANNELS = {
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  searchHuggingFace: 'hub:search',
  inspectHuggingFace: 'hub:inspect',
  installHuggingFaceModel: 'hub:install',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  event: 'engine:event',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
} as const

export function registerEngineIpc(
  engine: EngineProcess,
  getOverlayWindow: () => BrowserWindow | null,
  getTranslationCredential: (provider: 'microsoft' | 'openai') => Promise<string> = async () => '',
  meetings: MeetingStore | null = null,
  getSettings: () => AppSettings = () => DEFAULT_SETTINGS
): () => void {
  let activeSessionId: string | null = null

  const ensureReady = async (): Promise<void> => {
    if (engine.currentState !== 'ready') await engine.start()
  }

  // Shared by the explicit stopSession channel and the caption window's close button.
  // Teardown unloads several GB of weights and can outlive the 10 s default; a timeout here
  // used to leave activeSessionId set, which wedged the app into "a session is already running".
  const stopActiveSession = async (sessionId: string): Promise<void> => {
    await ensureReady()
    try {
      await engine.request(
        {
          protocolVersion: 1,
          type: 'stopSession',
          requestId: `stop-${randomUUID()}`,
          sessionId,
        },
        'sessionStopped',
        60 * 1000
      )
    } finally {
      activeSessionId = null
      // finish() is keyed on the open set, so the sessionStopped event that usually arrives first wins.
      void meetings?.finish(sessionId).catch((error) => console.error('meeting finalize failed', error))
    }
  }

  ipcMain.handle(IPC_CHANNELS.listDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listDevices', requestId: `devices-${randomUUID()}` },
      'devices'
    )
    return response.devices
  })

  ipcMain.handle(IPC_CHANNELS.listResources, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listResources', requestId: `resources-${randomUUID()}` },
      'resources'
    )
    return { storagePath: response.storagePath, resources: response.resources }
  })

  ipcMain.handle(
    IPC_CHANNELS.manageResource,
    async (_event, resourceId: unknown, action: unknown) => {
      if (typeof resourceId !== 'string' || !['install', 'remove', 'cancel'].includes(String(action))) {
        throw new Error('资源操作参数无效')
      }
      await ensureReady()
      const response = await engine.request(
        {
          protocolVersion: 1,
          type: 'manageResource',
          requestId: `resource-action-${randomUUID()}`,
          resourceId,
          action: action as 'install' | 'remove' | 'cancel',
        },
        'resourceActionResult'
      )
      return response.resource
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.searchHuggingFace,
    async (_event, query: unknown, kind: unknown) => {
      /*
       * 空关键词**不是**非法输入：`search=` 传空时 Hugging Face 返回的是按下载量排的热门榜，
       * 所以"什么都没输入"就是"浏览热门"，界面靠这一点给出默认内容。拦掉它等于逼用户
       * 先编一个关键词才能看到 hub 上有什么。
       * 超长仍然是错，但那是一条不同的诊断（粘贴了整段文本 / 脚本误调），不能和
       * "类型不对"混成同一句，否则排查时分不清是哪一种。
       */
      if (typeof query !== 'string') {
        throw new Error('搜索关键词无效')
      }
      if (query.length > 256) {
        throw new Error('搜索关键词过长：超过 256 个字符')
      }
      // 'asr'/'mt' is the renderer's vocabulary; the engine keys on the slot. Kept as a mapping
      // here so the protocol keeps naming loaders and the UI keeps naming categories.
      const slot = kind === 'asr' ? 'recognition' : kind === 'mt' ? 'translation' : undefined
      await ensureReady()
      const response = await engine.request(
        {
          protocolVersion: 1,
          type: 'searchHubModels',
          requestId: `hub-search-${randomUUID()}`,
          query,
          ...(slot ? { slot } : {}),
          limit: 20,
        },
        'hubModels',
        // A search deep-inspects up to ten candidates against the hub, each an HTTPS round trip.
        // The 10 s default used by the other channels is shorter than a slow-but-working search.
        60 * 1000
      )
      return {
        query: response.query,
        models: response.models,
        candidates: response.candidates,
        rateLimited: response.rateLimited,
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.inspectHuggingFace, async (_event, repo: unknown) => {
    if (typeof repo !== 'string' || repo.length < 3 || repo.length > 256) {
      throw new Error('仓库名无效')
    }
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'inspectHubRepo', requestId: `hub-inspect-${randomUUID()}`, repo },
      'hubInspect',
      30 * 1000
    )
    return {
      repo: response.repo,
      revision: response.revision,
      fileCount: response.fileCount,
      downloadBytes: response.downloadBytes,
      compatibility: response.compatibility,
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.installHuggingFaceModel,
    async (_event, repo: unknown, slot: unknown) => {
      if (typeof repo !== 'string' || repo.length < 3 || repo.length > 256) {
        throw new Error('仓库名无效')
      }
      if (slot !== undefined && slot !== 'recognition' && slot !== 'translation') {
        throw new Error('模型类别无效')
      }
      if (slot !== undefined && activeSessionId) {
        // A model install rewrites files a running session has already loaded, and unloading
        // several GB mid-meeting to install a different model is not a decision this channel
        // makes for the user.
        throw new Error('字幕会话运行中，不能更换模型')
      }
      await ensureReady()
      // Returns as soon as the download is under way; progress and completion arrive as
      // `resourceChanged` events, exactly as they do for a built-in model.
      const response = await engine.request(
        {
          protocolVersion: 1,
          type: 'installHubRepo',
          requestId: `hub-install-${randomUUID()}`,
          repo,
          ...(slot ? { slot } : {}),
        },
        'resourceActionResult',
        60 * 1000
      )
      return response.resource
    }
  )

  ipcMain.handle(IPC_CHANNELS.startSession, async (_event, rawConfig: unknown) => {
    await ensureReady()
    if (activeSessionId) throw new Error('已有字幕会话正在运行')
    const parsed = sessionConfigSchema.parse(rawConfig) as SessionConfig
    const provider = parsed.translationProvider ?? 'hymt2'
    const apiKey = provider === 'microsoft' || provider === 'openai'
      ? await getTranslationCredential(provider)
      : ''
    const config: SessionConfig = apiKey
      ? { ...parsed, translationOptions: { ...parsed.translationOptions, apiKey } }
      : parsed
    // Starting captions opens a meeting: the directory has to exist before the engine is told
    // where to put the audio, and a start that fails is thrown away a few lines below.
    // keepAudio is read here rather than hardcoded, otherwise the setting would only ever
    // look saved while the engine kept writing audio nobody can play back.
    const keepAudio = getSettings().recording.keepAudio
    const meeting = meetings
      ? await meetings.begin({
        sourceLanguage: parsed.sourceLanguage,
        targetLanguage: parsed.targetLanguages[0] ?? 'zh',
        recordAudio: keepAudio,
      })
      : null
    let response: { sessionId: string }
    try {
      response = await engine.request(
        {
          protocolVersion: 1,
          type: 'startSession',
          requestId: `start-${randomUUID()}`,
          // No recordingPath means the engine opens no recorder, so no WAV is produced at all.
          config: meeting && keepAudio
            ? { ...config, recordingPath: meetings?.recordingPathFor(meeting.meetingId) }
            : config,
        },
        'sessionStarted',
        30 * 60 * 1000
      )
    } catch (error) {
      if (meeting) await meetings?.abandon(meeting.meetingId).catch(() => undefined)
      throw error
    }
    if (meeting) meetings?.attach(meeting.meetingId, response.sessionId)
    activeSessionId = response.sessionId
    getOverlayWindow()?.showInactive()
    return { sessionId: response.sessionId, meetingId: meeting?.meetingId ?? null }
  })

  ipcMain.handle(IPC_CHANNELS.stopSession, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId !== activeSessionId) {
      throw new Error('字幕会话 ID 无效')
    }
    await stopActiveSession(sessionId)
    getOverlayWindow()?.hide()
  })

  ipcMain.handle(IPC_CHANNELS.setSessionPaused, async (_event, sessionId: unknown, paused: unknown) => {
    if (typeof sessionId !== 'string' || sessionId !== activeSessionId) {
      throw new Error('字幕会话 ID 无效')
    }
    if (typeof paused !== 'boolean') throw new Error('暂停参数无效')
    await ensureReady()
    // The engine shifts its own caption timeline across the pause, so the SRT timeline stays
    // continuous; here we only relay. A 30 s ceiling keeps a wedged engine from freezing the UI.
    await engine.request(
      {
        protocolVersion: 1,
        type: 'setSessionPaused',
        requestId: `pause-${randomUUID()}`,
        sessionId,
        paused,
      },
      'status',
      30 * 1000
    )
  })

  ipcMain.handle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.show())
  ipcMain.handle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())
  // Closing the caption window means "this session is over", not "stop showing it to me".
  // It therefore stops recognition first — otherwise recordAudio would keep writing a file
  // nobody can see. hideOverlay stays a pure hide for callers that only want it out of the way.
  ipcMain.handle(IPC_CHANNELS.closeOverlay, async () => {
    if (activeSessionId) await stopActiveSession(activeSessionId)
    getOverlayWindow()?.hide()
  })
  ipcMain.handle(IPC_CHANNELS.minimizeOverlay, () => {
    const window = getOverlayWindow()
    // skipTaskbar must be false for this to be recoverable; see windows.ts.
    if (window && !window.isDestroyed()) window.minimize()
  })
  ipcMain.handle(IPC_CHANNELS.resizeOverlay, (event, width: unknown, height: unknown) => {
    const window = getOverlayWindow()
    if (!window || event.sender !== window.webContents) return
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    const bounds = window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    window.setBounds(computeOverlayBounds('free', workArea, { ...bounds,
      width: Math.min(workArea.width, Math.max(420, Math.round(width as number))),
      height: Math.min(workArea.height, Math.max(52, Math.round(height as number))),
    }))
  })

  const forwardEvent = (event: EngineEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, event)
    }
    if (event.type === 'sessionStopped') {
      activeSessionId = null
      getOverlayWindow()?.hide()
      void meetings?.finish(event.sessionId).catch((error) => console.error('meeting finalize failed', error))
    }
  }
  engine.on('event', forwardEvent)

  return () => {
    engine.off('event', forwardEvent)
    for (const channel of [
      IPC_CHANNELS.listDevices,
      IPC_CHANNELS.listResources,
      IPC_CHANNELS.manageResource,
      IPC_CHANNELS.searchHuggingFace,
      IPC_CHANNELS.inspectHuggingFace,
      IPC_CHANNELS.installHuggingFaceModel,
      IPC_CHANNELS.startSession,
      IPC_CHANNELS.stopSession,
      IPC_CHANNELS.setSessionPaused,
      IPC_CHANNELS.showOverlay,
      IPC_CHANNELS.hideOverlay,
      IPC_CHANNELS.closeOverlay,
      IPC_CHANNELS.minimizeOverlay,
      IPC_CHANNELS.resizeOverlay,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
