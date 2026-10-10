import { loggedHandle } from './logged-ipc'
import { modelConfigurationSchema } from '../shared/model-capabilities'
import { randomUUID } from 'node:crypto'

import { BrowserWindow, ipcMain, net, screen } from 'electron'

import type { EngineEvent, EngineProcessState, PrewarmConfig, SessionConfig } from '../shared/contracts'
import { DEFAULT_SETTINGS, NO_TRANSLATION_LANGUAGE, type AppSettings, type CredentialProvider } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { MeetingStore } from './meeting-store'
import { computeOverlayBounds } from './windows'
import { readHubModelCard } from './hub-model-card'
import { SessionController } from './session-controller'
import { openDefaultBrowser as launchDefaultBrowser } from './open-default-browser'

export const IPC_CHANNELS = {
  listComputeDevices: 'engine:list-compute-devices',
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  searchHuggingFace: 'hub:search',
  inspectHuggingFace: 'hub:inspect',
  getHuggingFaceModelCard: 'hub:model-card',
  installHuggingFaceModel: 'hub:install', configureModel: 'model:configure',
  startSession: 'engine:start-session',
  prewarmModels: 'engine:prewarm-models',
  ensureEngineReady: 'engine:ensure-ready',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  event: 'engine:event',
  getEngineState: 'engine:get-state',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
  openDefaultBrowser: 'app:open-default-browser',
} as const

/**
 * The prewarm payload, read from settings rather than taken from the caller. `compute` is the
 * whole point: the engine's loaded-runtime cache is keyed on it, and `SessionController.start`
 * overwrites a session's `compute` from the same settings, so both sides of a prewarm-then-start
 * sequence read one source. The credential is left out — a cloud provider keeps no local weights,
 * so there is nothing to load and no key to hand over.
 */
function prewarmConfigFrom(settings: AppSettings): PrewarmConfig {
  const translation = settings.translation
  return {
    compute: { ...settings.compute },
    recognitionModelId: settings.recognition.modelId,
    sourceLanguage: settings.recognition.sourceLanguage,
    targetLanguages: translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? [] : [translation.targetLanguage],
    allowIntermediateTranslation: translation.translateIntermediate,
    translationProvider: translation.provider,
    translationModelId: translation.localModelId,
    ...(translation.provider === 'cloud' ? { translationOptions: { endpoint: translation.cloudEndpoint, model: translation.cloudModel, apiFormat: translation.cloudApiFormat, contextWindow: translation.cloudContextWindow, maxOutputTokens: translation.cloudMaxOutputTokens } } : {}),
    ...(translation.provider === 'microsoft' ? { translationOptions: { endpoint: translation.microsoftEndpoint, region: translation.microsoftRegion } } : {}),
  }
}

export function registerEngineIpc(
  engine: EngineProcess,
  getOverlayWindow: () => BrowserWindow | null,
  getTranslationCredential: (provider: CredentialProvider) => Promise<string> = async () => '',
  meetings: MeetingStore | null = null,
  getSettings: () => AppSettings = () => DEFAULT_SETTINGS,
  prepareEnvironment: (config: SessionConfig) => Promise<void> = async () => {},
  onStartingChanged: (starting: boolean) => void = () => {},
  whenRuntimeReady: () => Promise<void> = async () => {},
  sharedController?: SessionController
): () => void {
  const controller = sharedController ?? new SessionController({ engine, meetings, getSettings, getCredential: getTranslationCredential, prepare: prepareEnvironment, whenReady: whenRuntimeReady, startingChanged: onStartingChanged, showOverlay: () => getOverlayWindow()?.showInactive(), hideOverlay: () => getOverlayWindow()?.hide() })
  let closingOverlay: Promise<void> | null = null
  const ensureReady = () => controller.ensureReady()
  const stopActiveSession = (id: string) => controller.stop(id)
  const releaseSessionOnEngineLoss = () => controller.releaseOnLoss()
  loggedHandle(IPC_CHANNELS.listDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listDevices', requestId: `devices-${randomUUID()}` },
      'devices'
    )
    return response.devices
  })

  loggedHandle(IPC_CHANNELS.listComputeDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listComputeDevices', requestId: `compute-${randomUUID()}` },
      'computeDevices', 30_000,
    )
    const { protocolVersion: _version, type: _type, requestId: _request, ...snapshot } = response
    return snapshot
  })

  loggedHandle(IPC_CHANNELS.listResources, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listResources', requestId: `resources-${randomUUID()}` },
      'resources'
    )
    return { storagePath: response.storagePath, resources: response.resources }
  })

  loggedHandle(
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
          network: getSettings().network,
        },
        'resourceActionResult'
      )
      return response.resource
    }
  )

  loggedHandle(
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
          network: getSettings().network,
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

  loggedHandle(IPC_CHANNELS.getHuggingFaceModelCard, (_event, repo: unknown, revision: unknown) =>
    readHubModelCard(repo, revision, net.fetch, () => getSettings().network))

  loggedHandle(IPC_CHANNELS.configureModel, async (_event, resourceId: unknown, configuration: unknown) => {
    if (controller.busy) throw new Error('字幕会话运行中，不能修改模型配置')
    if (typeof resourceId !== 'string' || resourceId.length > 256) throw new Error('模型 ID 无效')
    const validated = modelConfigurationSchema.parse(configuration)
    await ensureReady()
    const response = await engine.request({ protocolVersion: 1, type: 'configureModel', requestId: `configure-${randomUUID()}`, resourceId, configuration: validated }, 'resourceActionResult')
    return response.resource
  })

  loggedHandle(IPC_CHANNELS.inspectHuggingFace, async (_event, repo: unknown) => {
    if (typeof repo !== 'string' || repo.length < 3 || repo.length > 256) {
      throw new Error('仓库名无效')
    }
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'inspectHubRepo', requestId: `hub-inspect-${randomUUID()}`, repo, network: getSettings().network },
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

  loggedHandle(
    IPC_CHANNELS.installHuggingFaceModel,
    async (_event, repo: unknown, slot: unknown) => {
      if (typeof repo !== 'string' || repo.length < 3 || repo.length > 256) {
        throw new Error('仓库名无效')
      }
      if (slot !== undefined && slot !== 'recognition' && slot !== 'translation') {
        throw new Error('模型类别无效')
      }
      if (slot !== undefined && controller.busy) {
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
          network: getSettings().network,
        },
        'resourceActionResult',
        60 * 1000
      )
      return response.resource
    }
  )

  loggedHandle(IPC_CHANNELS.startSession, (_event, config: unknown) => controller.start(config, 'desktop'))
  loggedHandle(IPC_CHANNELS.stopSession, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('字幕会话 ID 无效')
    controller.assertOwner(sessionId, 'desktop')
    await controller.stop(sessionId)
    getOverlayWindow()?.hide()
  })
  loggedHandle(IPC_CHANNELS.setSessionPaused, async (_event, sessionId: unknown, paused: unknown) => {
    if (typeof sessionId !== 'string' || typeof paused !== 'boolean') throw new Error('暂停参数无效')
    controller.assertOwner(sessionId, 'desktop')
    await controller.pause(sessionId, paused)
  })
  loggedHandle(IPC_CHANNELS.getEngineState, () => engine.currentState)

  // Starting the engine process is not loading weights: it is here for a caller that needs the
  // pipe and the device list, and it takes no session reservation.
  loggedHandle(IPC_CHANNELS.ensureEngineReady, async () => {
    await ensureReady()
    return engine.currentState
  })

  // What "enable captions" means: the models are resident, so the browser side starts a session
  // against weights that are already in memory.
  loggedHandle(IPC_CHANNELS.prewarmModels, async () => {
    const config = prewarmConfigFrom(getSettings())
    const session = { ...config, audioSource: { kind: 'defaultOutput' as const }, recognitionMode: 'realtime' as const }
    await prepareEnvironment(session)
    config.compute = session.compute
    await ensureReady()
    return engine.prewarmModels(config)
  })

  loggedHandle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.show())
  loggedHandle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())
  // Closing the caption window ends the session, so recognition stops first and recordAudio
  // stops writing a file nobody can see. hideOverlay stays a pure hide for a caller that only
  // wants it out of the way.
  loggedHandle(IPC_CHANNELS.closeOverlay, () => {
    if (closingOverlay) return closingOverlay
    const request = (async () => {
      const sessionId = controller.browserActive ? null : controller.activeSessionId
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
  loggedHandle(IPC_CHANNELS.minimizeOverlay, () => {
    const window = getOverlayWindow()
    // skipTaskbar must be false for this to be recoverable; see windows.ts.
    if (window && !window.isDestroyed()) window.minimize()
  })
  loggedHandle(IPC_CHANNELS.resizeOverlay, (event, width: unknown, height: unknown) => {
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
  // "Open the browser", with no URL. `shell.openExternal` cannot express it, so the main process
  // resolves the user's own handler instead; see open-default-browser.ts for why.
  loggedHandle(IPC_CHANNELS.openDefaultBrowser, () => launchDefaultBrowser())

  const broadcast = (event: EngineEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, event)
    }
  }

  // Settle the ledger before broadcasting. The renderer re-reads the meeting list on this edge,
  // and would otherwise cache the record as still in progress with a 00:00:00 duration.
  const forwardEvent = (event: EngineEvent): void => {
    const browser = controller.isBrowserEvent(event)
    controller.handleEvent(event)
    if (browser) return
    if (event.type !== 'sessionStopped') {
      broadcast(event)
      return
    }
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
      IPC_CHANNELS.configureModel,
      IPC_CHANNELS.startSession,
      IPC_CHANNELS.prewarmModels,
      IPC_CHANNELS.ensureEngineReady,
      IPC_CHANNELS.stopSession,
      IPC_CHANNELS.setSessionPaused,
      IPC_CHANNELS.showOverlay,
      IPC_CHANNELS.hideOverlay,
      IPC_CHANNELS.closeOverlay,
      IPC_CHANNELS.minimizeOverlay,
      IPC_CHANNELS.resizeOverlay,
      IPC_CHANNELS.openDefaultBrowser,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
