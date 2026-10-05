import { randomUUID } from 'node:crypto'

import { BrowserWindow, ipcMain, net, screen } from 'electron'

import type { EngineEvent, EngineProcessState, SessionConfig } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import { DEFAULT_SETTINGS, type AppSettings, type CredentialProvider } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { MeetingStore } from './meeting-store'
import { computeOverlayBounds } from './windows'
import { readHubModelCard } from './hub-model-card'

export const IPC_CHANNELS = {
  listComputeDevices: 'engine:list-compute-devices',
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  searchHuggingFace: 'hub:search',
  inspectHuggingFace: 'hub:inspect',
  getHuggingFaceModelCard: 'hub:model-card',
  installHuggingFaceModel: 'hub:install',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  event: 'engine:event',
  getEngineState: 'engine:get-state',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
} as const

export function registerEngineIpc(
  engine: EngineProcess,
  getOverlayWindow: () => BrowserWindow | null,
  getTranslationCredential: (provider: CredentialProvider) => Promise<string> = async () => '',
  meetings: MeetingStore | null = null,
  getSettings: () => AppSettings = () => DEFAULT_SETTINGS,
  prepareEnvironment: (config: SessionConfig) => Promise<void> = async () => {},
  onStartingChanged: (starting: boolean) => void = () => {},
  whenRuntimeReady: () => Promise<void> = async () => {}
): () => void {
  let activeSessionId: string | null = null
  let stoppingSession: { sessionId: string; request: Promise<void> } | null = null
  let closingOverlay: Promise<void> | null = null
  let startingSession = false

  const ensureReady = async (): Promise<void> => {
    await whenRuntimeReady()
    if (engine.currentState !== 'ready') await engine.start()
  }

  // Shared by the explicit stopSession channel and the caption window's close button, so a
  // teardown already in flight is joined instead of repeated. Unloading several GB of weights
  // can outlast the engine's 10 s default request timeout, hence the wider deadline.
  const stopActiveSession = (sessionId: string): Promise<void> => {
    if (stoppingSession?.sessionId === sessionId) return stoppingSession.request
    const request = (async () => {
      try {
        await ensureReady()
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
    })()
    stoppingSession = { sessionId, request }
    void request.finally(() => {
      if (stoppingSession?.request === request) stoppingSession = null
    }).catch(() => undefined)
    return request
  }

  /*
   * A dead engine sends no `sessionStopped`, so `forwardEvent` never gets its chance to close
   * the session out: the id stays set and the meeting record stays in progress. Settle the main
   * process's own ledger here instead.
   *
   * `recovering` counts too. A reconnect is a new process — no session, no recording, and the
   * weights are unloaded after every session — so the engine coming back never means this
   * session came back with it.
   */
  const releaseSessionOnEngineLoss = (): void => {
    const sessionId = activeSessionId
    if (sessionId === null) return
    activeSessionId = null
    void meetings?.finish(sessionId).catch((error) => console.error('meeting finalize failed', error))
    getOverlayWindow()?.hide()
  }

  ipcMain.handle(IPC_CHANNELS.listDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listDevices', requestId: `devices-${randomUUID()}` },
      'devices'
    )
    return response.devices
  })

  ipcMain.handle(IPC_CHANNELS.listComputeDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listComputeDevices', requestId: `compute-${randomUUID()}` },
      'computeDevices', 30_000,
    )
    const { protocolVersion: _version, type: _type, requestId: _request, ...snapshot } = response
    return snapshot
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
    async (_event, query: unknown, kind: unknown, cursor: unknown) => {
      /*
       * An empty query is legal: `search=` returns Hugging Face's most-downloaded list, so
       * "nothing typed" is "browse the hub". Overlength is a different fault — pasted text, a
       * scripted call — and keeps its own message so the two are not diagnosed as one.
       */
      if (typeof query !== 'string') {
        throw new Error('搜索关键词无效')
      }
      if (query.length > 256) {
        throw new Error('搜索关键词过长：超过 256 个字符')
      }
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 2048)) {
        throw new Error('分页游标无效')
      }
      // 'asr'/'mt' are the renderer's category names; the engine keys on a slot instead, and
      // 'quant' is the same filter expressed as a weight format.
      if (kind !== 'all' && kind !== 'asr' && kind !== 'mt' && kind !== 'quant') throw new Error('模型类别无效')
      const slot = kind === 'asr' ? 'recognition' : kind === 'mt' ? 'translation' : undefined
      await ensureReady()
      const response = await engine.request(
        {
          protocolVersion: 1,
          type: 'searchHubModels',
          requestId: `hub-search-${randomUUID()}`,
          query,
          ...(slot ? { slot } : {}),
          ...(kind === 'quant' ? { weightFormat: 'gguf' as const } : {}),
          ...(typeof cursor === 'string' ? { cursor } : {}),
          limit: 20,
        },
        'hubModels',
        // Search reads metadata once; model cards and install checks use separate requests.
        35 * 1000
      )
      return {
        query: response.query,
        models: response.models,
        candidates: response.candidates,
        rateLimited: response.rateLimited,
        nextCursor: response.nextCursor,
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.getHuggingFaceModelCard, (_event, repo: unknown, revision: unknown) =>
    readHubModelCard(repo, revision, net.fetch))

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
        // An install rewrites files a live session has already loaded, and forcing a
        // mid-meeting weight unload to swap models is not this channel's call to make.
        throw new Error('字幕会话运行中，不能更换模型')
      }
      await ensureReady()
      // Returns once the download is under way; progress arrives as `resourceChanged` events.
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
    if (activeSessionId || startingSession) throw new Error('已有字幕会话正在运行或启动')
    const parsed = sessionConfigSchema.parse(rawConfig) as SessionConfig
    parsed.compute = { ...getSettings().compute }
    startingSession = true
    onStartingChanged(true)
    try {
      await prepareEnvironment(parsed)
      await ensureReady()
      const provider = parsed.translationProvider ?? 'local'
      // Only the two keyed providers fetch a credential. Ollama sits under `cloud`, so an empty
      // key is a legitimate state for the OpenAI-shaped and ollama endpoints, which omit the
      // header; the anthropic and microsoft shapes require one and raise without it.
      const apiKey = provider === 'cloud' || provider === 'microsoft'
        ? await getTranslationCredential(provider)
        : ''
      // The engine's `local` branch never reads `translationOptions`, so the field is dropped
      // there. Destructuring also keeps it absent rather than `{}`: the engine's `resolved()`
      // substitutes defaults only when the field is missing outright.
      const { translationOptions, ...withoutOptions } = parsed
      const config: SessionConfig = provider === 'local'
        ? withoutOptions
        : apiKey
          ? { ...parsed, translationOptions: { ...translationOptions, apiKey } }
          : parsed
      // The meeting is opened before the engine is told where to write audio, so the directory
      // exists first; a start that fails is abandoned a few lines below. `keepAudio` is read
      // from settings rather than assumed, or the setting would look saved while the engine
      // wrote audio nobody can play back.
      const keepAudio = getSettings().recording.keepAudio
      config.compute = parsed.compute
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
    } finally {
      startingSession = false
      onStartingChanged(false)
    }
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
    // The engine shifts its own caption timeline across the pause, so the SRT stays
    // continuous; the 30 s ceiling keeps a wedged engine from freezing the UI.
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

  ipcMain.handle(IPC_CHANNELS.getEngineState, () => engine.currentState)

  ipcMain.handle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.show())
  ipcMain.handle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())
  // Closing the caption window ends the session, so recognition stops first and recordAudio
  // stops writing a file nobody can see. hideOverlay stays a pure hide for a caller that only
  // wants it out of the way.
  ipcMain.handle(IPC_CHANNELS.closeOverlay, () => {
    if (closingOverlay) return closingOverlay
    const request = (async () => {
      const sessionId = activeSessionId ?? stoppingSession?.sessionId
      if (sessionId) {
        try {
          // A dead engine cannot own a live session; don't restart it just to stop a stale id.
          if (engine.currentState !== 'ready') throw new Error('Engine is unavailable during overlay close')
          await stopActiveSession(sessionId)
        } catch (error) {
          console.error('[overlay] session stop failed; stopping engine process', error)
          // Release audio capture even if teardown or transport failed, then notify both windows.
          await engine.stop()
          forwardEvent({ protocolVersion: 1, type: 'sessionStopped', requestId: `close-${randomUUID()}`, sessionId })
        }
      }
      getOverlayWindow()?.hide()
    })()
    closingOverlay = request
    void request.finally(() => {
      if (closingOverlay === request) closingOverlay = null
    }).catch(() => undefined)
    return request
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

  const broadcast = (event: EngineEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, event)
    }
  }

  // Settle the ledger before broadcasting. The renderer re-reads the meeting list on this edge,
  // and would otherwise cache the record as still in progress with a 00:00:00 duration.
  const forwardEvent = (event: EngineEvent): void => {
    if (event.type !== 'sessionStopped') {
      broadcast(event)
      return
    }
    activeSessionId = null
    getOverlayWindow()?.hide()
    // `Promise.resolve()`, not `meetings?.finish(x).finally(broadcast)`: the optional chain
    // short-circuits to `undefined`, so the broadcast would never happen at all.
    const finalized = meetings
      ? meetings.finish(event.sessionId).catch((error) => console.error('meeting finalize failed', error))
      : Promise.resolve()
    void finalized.finally(() => broadcast(event))
  }
  engine.on('event', forwardEvent)

  /*
   * The engine's state rides the same `engine:event` channel as protocol events, which is what
   * keeps "handshake done" and "process ready" strictly ordered in the renderer.
   *
   * `recovering` vs `failed` is `EngineProcess`'s to decide alone, since only it holds the
   * backoff table, and the renderer maps it one-to-one rather than counting retries. Forwarding
   * `state` alone still covers a crash: both `connectWithRetries` and `handleTermination`
   * `setState` before emitting `fatalError` / `crash`.
   */
  const forwardState = (state: EngineProcessState): void => {
    if (state === 'recovering' || state === 'failed') releaseSessionOnEngineLoss()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, { type: 'engineStateChanged', state })
    }
  }
  engine.on('state', forwardState)

  return () => {
    engine.off('event', forwardEvent)
    // A listener left on the long-lived EngineProcess is a real leak: every later state change
    // would still broadcast into windows whose IPC has already been torn down.
    engine.off('state', forwardState)
    for (const channel of [
      IPC_CHANNELS.listDevices,
      IPC_CHANNELS.getEngineState,
      IPC_CHANNELS.listResources,
      IPC_CHANNELS.manageResource,
      IPC_CHANNELS.searchHuggingFace,
      IPC_CHANNELS.inspectHuggingFace,
      IPC_CHANNELS.getHuggingFaceModelCard,
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
