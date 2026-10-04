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

  // Shared by the explicit stopSession channel and the caption window's close button.
  // Teardown unloads several GB of weights and can outlive the 10 s default; a timeout here
  // used to leave activeSessionId set, which wedged the app into "a session is already running".
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
   * **引擎进程没了，而主进程还记着一个活跃会话：这一场到此为止。**
   *
   * 进程消失时不会有 `sessionStopped`（协议那一侧什么都没发生，进程就没了），
   * 所以光靠 `forwardEvent` 那个分支收不了尾：`activeSessionId` 会一直留着。等引擎自愈之后
   * 用户开新会话只会拿到「已有字幕会话正在运行」，而实际上什么都没在跑；那条会议记录也永远
   * 停在进行中。这里收的是**主进程自己的账本**，与 `forwardEvent` 收到 `sessionStopped`
   * 时做的三件事完全一致（释放 id、给会议落结束时间、关掉字幕窗），只是没有报文可等。
   *
   * **`recovering` 也要走这条路，不能只等 `failed`。** 引擎会自己重连，但重连出来的是一个
   * **新进程**：没有这场会话、没有录音、也没有已加载的权重（权重每场结束就卸），
   * 所以「引擎回来了」从来不等于「这场会回来了」。留着 id 等的是一个永远不会来的
   * `sessionStopped`。
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
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 2048)) {
        throw new Error('分页游标无效')
      }
      // 'asr'/'mt' is the renderer's vocabulary; the engine keys on the slot. Kept as a mapping
      if (kind !== 'all' && kind !== 'asr' && kind !== 'mt' && kind !== 'quant') throw new Error('模型类别无效')
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
    if (activeSessionId || startingSession) throw new Error('已有字幕会话正在运行或启动')
    const parsed = sessionConfigSchema.parse(rawConfig) as SessionConfig
    parsed.compute = { ...getSettings().compute }
    startingSession = true
    onStartingChanged(true)
    try {
      await prepareEnvironment(parsed)
      await ensureReady()
      const provider = parsed.translationProvider ?? 'local'
      // 只有需要密钥的两个 provider 才去取。Ollama 现在也归在 `cloud` 下面，所以这里取到空串
      // 是合法状态：引擎在 key 为空时不发 Authorization 头，而不是报错。
      const apiKey = provider === 'cloud' || provider === 'microsoft'
        ? await getTranslationCredential(provider)
        : ''
      // 硬规则：provider==='local' 时 `translationOptions` 必须整个键不存在。zod 解析出来的对象
      // 里键可能带着 `undefined` 值，所以这里把字段解构掉，而不是留一个 `{}` 发出去 ——
      // 引擎会把 `{}` 判成配置非法，而"`translationOptions: undefined`"与"不给它"在 JSON 上
      // 才是同一件事。
      const { translationOptions, ...withoutOptions } = parsed
      const config: SessionConfig = provider === 'local'
        ? withoutOptions
        : apiKey
          ? { ...parsed, translationOptions: { ...translationOptions, apiKey } }
          : parsed
      // Starting captions opens a meeting: the directory has to exist before the engine is told
      // where to put the audio, and a start that fails is thrown away a few lines below.
      // keepAudio is read here rather than hardcoded, otherwise the setting would only ever
      // look saved while the engine kept writing audio nobody can play back.
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

  /*
   * 引擎进程状态的**按需读取**，与下面 `forwardState` 的边沿转发是一对。
   *
   * **这里绝对不能调 `ensureReady()`。** 这个通道的全部意义就是回答「引擎现在怎么样」；
   * 一旦它自己会启动引擎，界面就永远问不出「从没启动过」这个答案，冷启动与引擎起不来
   * 又被叠回同一个取值 —— 正是 `EngineStatus` 这个类型当初被造出来要分开的那两件事。
   *
   * 只读，不排队、不重试、不抛错：引擎没起来时 `currentState` 就是 `stopped`，
   * 那是一个合法答案，不是失败。
   */
  ipcMain.handle(IPC_CHANNELS.getEngineState, () => engine.currentState)

  ipcMain.handle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.show())
  ipcMain.handle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())
  // Closing the caption window means "this session is over", not "stop showing it to me".
  // It therefore stops recognition first — otherwise recordAudio would keep writing a file
  // nobody can see. hideOverlay stays a pure hide for callers that only want it out of the way.
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

  /*
   * 引擎子进程状态 → 渲染进程。**这是 `forwardEvent` 之外唯一一条进 `engine:event` 的消息，
   * 而它的产生者不是引擎。**
   *
   * 代价是这条通道的载荷类型（`EngineChannelEvent`）名不副实：它名义上是「引擎协议事件」，
   * 现在多了一支主进程自己写的 `engineStateChanged`。之所以接受这个代价而不另开一条通道：
   * 生命周期事件与协议事件走同一条管道、同一个发送顺序，于是「引擎握手完成」与「引擎进程
   * 就绪」在渲染进程看来仍然严格有序 —— 而 `startSession` 过去那套推断依赖的正是这个顺序。
   * 另开一条通道会拿到更诚实的名字，代价是多一处 preload 转发、桥接签名与 dispose 清单；
   * 当时的判断是本仓更偏好能自我解释的最小改动。**这是一个决定，不是忘了收尾。**
   *
   * 只转发 `state` 就够了，不必再转发 `crash` / `fatalError`：`engine-process.ts` 里
   * `connectWithRetries`（重试耗尽）与 `handleTermination`（进程退出）都是**先**
   * `setState('failed')`、**再** `emit('fatalError' / 'crash')`，所以崩溃在状态上已经可见。
   *
   * **这条边沿还带着"引擎打算重试"这件事**，因为定这件事的只有 `EngineProcess`
   * （它手里有退避表）：`recovering` 表示进程没了但还有重试次数，`failed` 表示退避耗尽。
   * 界面只做一对一映射（`sessionStore` 的 `ENGINE_PROCESS_STATE_TO_UI`），
   * 不自己数重试、不从时序里猜 —— 那样每加一次重试就要在渲染层同步一份节奏。
   *
   * 顺带在这里收主进程的会话账本，见 `releaseSessionOnEngineLoss`：**先收账本再广播**，
   * 界面收到这条边沿、开始说"这场会没了"时，主进程这边已经不再有活跃会话了。
   *
   * 与 `forwardEvent` 用同一个广播方式：主窗与浮窗都要知道自己这条会话的引擎还在不在。
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
    // 长驻的 EngineProcess 上留一个监听器就是一次真泄漏：dispose 之后每次状态变化
    // 还会往一个已经拆掉 IPC 的窗口广播。on / off 必须成对，和上面那条同理。
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
