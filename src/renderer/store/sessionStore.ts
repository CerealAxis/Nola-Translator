/**
 * 同传会话状态机：`idle | starting | running | paused | stopping | error`。
 *
 * 这个文件里有四条从主仓继承来的教训，写的时候不要"简化"掉：
 *
 * 1. `stop()` 的 `finally` **必须**清掉 sessionId。停失败时如果把 id 留着，下一次
 *    `stopSession(id)` 会打在一个已经死掉的会话上，引擎会回 sessionNotRunning，然后
 *    用户再也开不了新会话（应用卡在 error 且无路可走）。id 是"引擎认不认这一会话"的唯一凭据，
 *    它的生命周期必须由 UI 状态机独占，不许跨失败残留。
 * 2. 缺模型要在 `startSession` **之前**拦住。让用户点完按钮、等引擎起动、再报错，
 *    是把"配置没做完"伪装成"引擎坏了"。
 * 3. 暂停必须停表。计时器在暂停时继续走，用户会以为同传还在录音。
 * 4. `sessionStarted` 事件里**要认领会话**。浮窗是独立文档，不调 `startSession()`，
 *    它的 sessionId 只能从这条事件里来；少了这条分支，浮窗每一条字幕都会被丢掉。
 */

import type { NolaBridge } from '@/bridge'
import type { CaptionSegment, EngineEvent, ResourceSnapshot, SessionConfig, SessionStatus } from '@/bridge'
import { createStore } from './createStore'

/** 已 finalize 的句段上限。长会议两三个小时，2048 句足够读完且内存有界。 */
export const MAX_FINALIZED_SEGMENTS = 2048
/** interim 修订的合并窗口。引擎 100 到 200ms 修订一次，60ms 足够把一串修订压成一次渲染。 */
const INTERIM_BATCH_MS = 60
const TICK_MS = 1000

export interface MissingResource {
  resourceId: string
  name: string
  kind: 'recognition' | 'translation'
}

export interface SessionState {
  status: SessionStatus
  sessionId: string | null
  meetingId: string | null
  startedAtMs: number | null
  /** 计时器读数。暂停时冻结，resume 时从冻结点继续。 */
  elapsedMs: number
  /**
   * 诊断串（引擎抛的原文，可能是中文）。
   * **不要直接渲染它**：桥接层与 mock 的错误文本不受 i18n 管，界面必须走
   * `errorCode` + `t('errors.*')`。这个字段只用来写 console 与"复制诊断"。
   */
  error: string | null
  /** 大写下划线错误码，可复制，界面的文案与它一一对应。 */
  errorCode: string | null
  /** 预检拦下的缺失模型，UI 据此给出"现在安装"入口。 */
  missing: MissingResource | null
  /** 引擎是否握上了手：`ready` 事件到达后为 true。 */
  engineReady: boolean
  engineVersion: string | null
  /** 已确认句段，按 startedAtMs 升序，上限 MAX_FINALIZED_SEGMENTS。 */
  segments: readonly CaptionSegment[]
  /** 当前未确认句段。同一时刻最多一条，因为引擎总是先改写最后一句。 */
  interim: CaptionSegment | null
}

const initialState: SessionState = {
  status: 'idle',
  sessionId: null,
  meetingId: null,
  startedAtMs: null,
  elapsedMs: 0,
  error: null,
  errorCode: null,
  missing: null,
  engineReady: false,
  engineVersion: null,
  segments: [],
  interim: null,
}

export const sessionStore = createStore<SessionState>(initialState)

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null

let tickTimer: ReturnType<typeof setInterval> | null = null
let interimTimer: ReturnType<typeof setTimeout> | null = null
/** 计时器的暂停账本。不进 state，因为每秒只写一次 elapsedMs 就够了。 */
let pausedAtMs: number | null = null
let pausedTotalMs = 0

/**
 * 协议里**有** pause / resume 通道（`EngineCommand` 的 `setSessionPaused`，
 * preload 的 `setSessionPaused`），所以暂停不需要能力探测。
 *
 * 原型那版探测的是 demo mock 私有的 `session` 组，迁回主仓后那条路不存在了。
 * 桥接上是同步 void：按下那一刻就停表，引擎拒绝的话走 `error` 事件如实报错。
 */
function pauseControl(): { pause: () => void; resume: () => void } | undefined {
  if (!bridge) return undefined
  const { sessionId } = sessionStore.getState()
  if (sessionId === null) return undefined
  return {
    pause: () => bridge?.engine.setPaused(sessionId, true),
    resume: () => bridge?.engine.setPaused(sessionId, false),
  }
}


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): string {
  const message = errorMessage(error)
  const match = /([a-zA-Z]+):/.exec(message)
  return match ? match[1].toUpperCase() : 'SESSION_ERROR'
}

/**
 * 引擎 `status` 事件码 → UI 会话状态。**`sessionStore` 是唯一做这个映射的地方**
 * （`ipcBridge` 原样透传 `EngineEvent`，它不碰状态机）。
 *
 * `'ready'` 刻意映射成 `undefined`，也就是**不进这台状态机**：它是**引擎级**握手
 * （进程起来了），不是某一场会话的状态。会话级的握手由 `ready` **事件**
 * （`engineReady` / `engineVersion`）负责。把两者混在一起会让"引擎好了"被读成
 * "这场会开始了"。
 *
 * 引擎实际会发的码目前只有三个（`service.py` 在 `sessionStarted` / `sessionStopped`
 * 之后各发一条，`runtime.py` 的 `_listening_status` 发 `paused` / `listening`），
 * 但协议里写死了六个，另外三个照样映射好，省得引擎补发时界面无反应。
 */
const ENGINE_STATUS_TO_UI: Record<Extract<EngineEvent, { type: 'status' }>['code'], SessionStatus | undefined> = {
  idle: 'idle',
  starting: 'starting',
  ready: undefined,
  listening: 'running',
  paused: 'paused',
  stopping: 'stopping',
}

// -- 预检 ---------------------------------------------------------------------

/**
 * 按 `SessionConfig` 在资源快照里找缺的那一个。返回 null 表示可以开。
 *
 * **这里是主仓那版，不是原型那版。** 原型只看 `translationModelId`，于是：
 *   · m2m100 用户永远不被拦住 —— 它的资源 id 是硬编码的 `'m2m100-418m'`，
 *     跟 `translationModelId`（只对 hymt2 有值）根本不是一回事；
 *   · 资源 id 不在快照里时原型直接跳过，主仓判**缺失**。放行到引擎再报错，
 *     只是把「配置没做完」伪装成「引擎坏了」。
 *
 * 云端服务商（microsoft / openai / ollama）靠 `translationResourceId` 为 null 排除，
 * 不是靠上面那条「不在快照里就算缺失」—— 本地模型 id 不在快照里意味着用户选的模型
 * 我们根本没有渠道拿，那本来就该拦。
 */
export function findMissingResource(
  snapshot: { readonly resources: readonly { resourceId: string; name: string; installed: boolean; kind?: string }[]; storagePath?: string },
  config: SessionConfig,
): MissingResource | null {
  const translationResourceId = config.targetLanguages.length === 0 || !config.translationProvider
    ? null
    : config.translationProvider === 'hymt2'
      ? config.translationModelId ?? null
      : config.translationProvider === 'm2m100' ? 'm2m100-418m' : null
  const requiredIds = [config.recognitionModelId, ...(translationResourceId ? [translationResourceId] : [])]

  for (const id of requiredIds) {
    const record = id ? snapshot.resources.find((item) => item.resourceId === id) : undefined
    if (!record?.installed) {
      return { resourceId: record?.resourceId ?? id ?? '', name: record?.name ?? '所选识别', kind: record?.kind === 'translationModel' || translationResourceId === id ? 'translation' : 'recognition' }
    }
  }
  return null
}

// -- 计时器 -------------------------------------------------------------------

function elapsedNow(): number {
  const { startedAtMs, elapsedMs } = sessionStore.getState()
  if (startedAtMs === null) return elapsedMs
  if (pausedAtMs !== null) return pausedAtMs - startedAtMs - pausedTotalMs
  return Date.now() - startedAtMs - pausedTotalMs
}

function startTicker(): void {
  stopTicker()
  tickTimer = setInterval(() => {
    // 只在 running 时走。暂停/停止时定时器被摘掉，数字是冻结的。
    if (sessionStore.getState().status !== 'running') return
    sessionStore.setState({ elapsedMs: elapsedNow() })
  }, TICK_MS)
}

function stopTicker(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// -- 字幕合并 -----------------------------------------------------------------

/** interim 批处理：60ms 内的连续修订只渲染最后一次。interim 会被后面的修订覆盖，丢中间态不丢信息。 */
function scheduleInterim(segment: CaptionSegment): void {
  if (interimTimer !== null) clearTimeout(interimTimer)
  interimTimer = setTimeout(() => {
    interimTimer = null
    sessionStore.setState({ interim: segment })
  }, INTERIM_BATCH_MS)
}

function appendFinal(segment: CaptionSegment): void {
  sessionStore.setState((state) => {
    const previous = state.segments.find((item) => item.segmentId === segment.segmentId)
    // 引擎偶尔把同一条重发一遍，revision 低的不能让已确认的版本倒退。
    if (previous && previous.revision > segment.revision) return state

    const next = [...state.segments.filter((item) => item.segmentId !== segment.segmentId), segment]
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
    // 超上限时丢最旧的。已 finalize 的句段永不被覆盖，只在超出内存预算时从头部裁掉。
    const capped = next.length > MAX_FINALIZED_SEGMENTS
      ? next.slice(next.length - MAX_FINALIZED_SEGMENTS)
      : next

    return {
      segments: capped,
      interim: state.interim?.segmentId === segment.segmentId ? null : state.interim,
    }
  })
}

// -- 公开动作 -----------------------------------------------------------------

/**
 * 开始同传。预检在 `startSession` 之前，缺模型直接拒绝并把 `missing` 暴露给 UI。
 * `starting` 期间重复调用会被拒绝，防止引擎收到两个 start。
 */
export async function startSession(config: SessionConfig): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const status = sessionStore.getState().status
  if (status === 'starting' || status === 'stopping') {
    throw new Error('上一次会话还没收尾')
  }
  if (status === 'running' || status === 'paused') {
    throw new Error('已有会话在运行')
  }

  sessionStore.setState({ status: 'starting', error: null, errorCode: null, missing: null })

  // 预检放在 try 之外：它失败时**不是**"引擎出错"，会话根本没开。放进 try 会让同一个
  // catch 把状态改写成 error，用户看到的是"引擎异常"而不是"少装了一个模型"。
  let missing: MissingResource | null
  try {
    missing = findMissingResource(await bridge.engine.listResources(), config)
  } catch (error) {
    // 连资源列表都拉不到：这是真的引擎问题。
    sessionStore.setState({ status: 'error', error: errorMessage(error), errorCode: errorCodeOf(error) })
    throw error
  }
  if (missing) {
    // 状态退回 idle，UI 自己去引导安装（`preflight.modelMissing` + `preflight.installNow`）。
    sessionStore.setState({ status: 'idle', missing, errorCode: 'MODEL_MISSING' })
    throw new Error(`缺少模型：${missing.name}`)
  }

  try {
    const started = await bridge.engine.startSession(config)
    pausedAtMs = null
    pausedTotalMs = 0
    sessionStore.setState({
      status: 'running',
      sessionId: started.sessionId,
      meetingId: started.meetingId,
      startedAtMs: Date.now(),
      elapsedMs: 0,
      segments: [],
      interim: null,
      error: null,
      errorCode: null,
    })
    startTicker()
  } catch (error) {
    sessionStore.setState({ status: 'error', error: errorMessage(error), errorCode: errorCodeOf(error) })
    throw error
  }
}

/**
 * 结束同传。
 *
 * `finally` 里无条件清 sessionId 与计时器：主仓踩过的坑是停失败后 id 残留，
 * 下一次 stop 打向死会话得到 sessionNotRunning，之后再也开不了新会话。
 */
export async function stopSession(): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const { sessionId, status } = sessionStore.getState()
  if (sessionId === null) {
    sessionStore.setState({ status: 'idle' })
    return
  }
  if (status === 'stopping') throw new Error('正在结束中')
  if (status === 'paused') {
    // 停在暂停态的会话引擎侧可能还认为它在跑，先恢复再停，避免 stopSession 找不到会话。
    resumeSession()
  }

  sessionStore.setState({ status: 'stopping', error: null, errorCode: null })
  try {
    await bridge.engine.stopSession(sessionId)
    sessionStore.setState({ status: 'idle', error: null, errorCode: null })
  } catch (error) {
    // 停失败要把原因说清楚（字幕可能丢），但状态仍然是 error，用户能看到并重试。
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: errorCodeOf(error),
      elapsedMs: elapsedNow(),
    })
    throw error
  } finally {
    // 见文件头第 1 条：这里无条件清，失败也清。
    stopTicker()
    pausedAtMs = null
    pausedTotalMs = 0
    sessionStore.setState({ sessionId: null, meetingId: null, startedAtMs: null })
  }
}

export function pauseSession(): void {
  const { status, sessionId } = sessionStore.getState()
  if (status !== 'running' || sessionId === null) return
  pauseControl()?.pause()
  pausedAtMs = Date.now()
  sessionStore.setState({ status: 'paused', elapsedMs: elapsedNow() })
  // 表必须停。留着 interval 只会让"暂停"变成假的。
  stopTicker()
}

export function resumeSession(): void {
  const { status, sessionId } = sessionStore.getState()
  if (status !== 'paused' || sessionId === null) return
  pauseControl()?.resume()
  if (pausedAtMs !== null) pausedTotalMs += Date.now() - pausedAtMs
  pausedAtMs = null
  sessionStore.setState({ status: 'running' })
  startTicker()
}

export function resetSessionError(): void {
  if (sessionStore.getState().status !== 'error') return
  sessionStore.setState({ status: 'idle', error: null, errorCode: null })
}

export function clearSessionTranscript(): void {
  sessionStore.setState({ segments: [], interim: null })
}

// -- 注入 ---------------------------------------------------------------------

export function attachSessionStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event) => {
    switch (event.type) {
      case 'ready':
        sessionStore.setState({ engineReady: true, engineVersion: event.engineVersion })
        break
      /*
       * **认领会话。这是浮窗能不能工作的唯一开关。**
       *
       * 浮窗是**独立文档**（`?overlay=1`），它自己不调 `startSession()`，所以
       * `sessionId` 只由 `startSession()` 写的话**恒为 null**。而下面 `caption`
       * 分支第一行就是 `if (sessionId === null || event.sessionId !== sessionId) return`
       * —— 于是**每一条字幕都被丢掉，浮窗全程空白**。
       *
       * 原型阶段没暴露这个问题：demoBridge 用 BroadcastChannel 把主窗的 store 快照
       * 整份推给浮窗，sessionId 是跟着快照一起过去的。换成 `createIpcBridge()` 之后
       * 没有那条通道，浮窗只剩引擎事件这一条输入 —— 所以必须自己认领。
       *
       * 只在 `sessionId === null`（也就是「本窗还没持有任何会话」）时认领：
       *   · 主窗自己发起的会话，`startSession()` 已经在写状态了，别覆盖 meetingId；
       *   · 迟到的上一场 `sessionStarted` 不能把已持有的会话换掉。
       * `meetingId` 保持原值：只有 `startSession()` 的返回值里有它，浮窗拿不到，
       * 而浮窗也不显示会议详情。
       */
      case 'sessionStarted': {
        let adopted = false
        sessionStore.setState((state) => {
          if (state.sessionId !== null) return state
          adopted = true
          return {
            ...state,
            status: 'running',
            sessionId: event.sessionId,
            startedAtMs: Date.now(),
            elapsedMs: 0,
            segments: [],
            interim: null,
          }
        })
        if (adopted) {
          pausedAtMs = null
          pausedTotalMs = 0
          startTicker()
        }
        break
      }
      case 'caption': {
        const { sessionId } = sessionStore.getState()
        // 迟到的旧会话事件不能污染当前会话的字幕。
        if (sessionId === null || event.sessionId !== sessionId) return
        if (event.segment.isFinal) {
          if (interimTimer !== null) {
            clearTimeout(interimTimer)
            interimTimer = null
          }
          appendFinal(event.segment)
        } else {
          scheduleInterim(event.segment)
        }
        break
      }
      case 'error':
        sessionStore.setState({
          status: sessionStore.getState().sessionId === null ? sessionStore.getState().status : 'error',
          error: event.code,
          errorCode: event.code.toUpperCase(),
        })
        break
      /*
       * **引擎的权威会话状态。**
       *
       * 这条分支以前不存在，引擎每一条 `status` 都被 `default` 吃掉了，而引擎是**特意**
       * 发它的：`runtime.py` 里 `_listening_status` 的注释写着「Answer with the
       * authoritative status so a double-tap cannot leave the UI believing the engine
       * is somewhere else」，`setSessionPaused` 的成功路径回的就是它（暂停/恢复**不**走
       * `error` 事件）。也就是说：引擎把「谁说了算」的答案递过来，界面把它扔了。
       *
       * 丢掉它的具体后果是**协议里的 `'paused'` 在整个渲染层零消费**：
       *   · 界面只在**自己按下暂停**时才进 paused，引擎侧任何"其实暂停不了"的情况
       *     （会话已被别处停掉、设备掉了、重复点击）界面都看不见，一律照旧显示"进行中"。
       *   · `status: 'idle'` 同理：引擎已经不再跑这场会了，界面还停在 running，
       *     计时器还在跳。
       *
       * 三条不许越界的线：
       * 1. `ready`（引擎级握手）不进这里 —— 见 `ENGINE_STATUS_TO_UI`。
       * 2. **本窗不持有会话时一律忽略**：主窗在 idle、浮窗还没认领 `sessionStarted` 时
       *    都会收到引擎广播的 status，照抄会把界面从 error/idle 拽到一个不相干的状态。
       * 3. 计时器账本只在这里被**动一次**：进 paused 冻结、其余恢复。见文件头第 3 条
       *    「暂停必须停表」——引擎说停了，表就得停。
       */
      case 'status': {
        const next = ENGINE_STATUS_TO_UI[event.code]
        if (next === undefined) break
        const current = sessionStore.getState()
        if (current.sessionId === null) break
        // 界面已经乐观地画成同一个状态了（pauseSession / resumeSession 立刻就改），
        // 这时再动一次计时器账本会把暂停时长算重，所以同值直接跳过。
        if (current.status === next) break

        if (next === 'paused') {
          if (pausedAtMs === null) pausedAtMs = Date.now()
          sessionStore.setState({ status: 'paused', elapsedMs: elapsedNow() })
          stopTicker()
        } else {
          if (pausedAtMs !== null) {
            pausedTotalMs += Date.now() - pausedAtMs
            pausedAtMs = null
          }
          sessionStore.setState({ status: next, elapsedMs: elapsedNow() })
          if (next === 'running') startTicker()
          else stopTicker()
        }
        break
      }
      case 'sessionStopped':
        // 引擎侧已经收尾了。把 UI 状态对齐，不去猜 meeting 的最终时长。
        if (sessionStore.getState().sessionId !== event.sessionId) return
        stopTicker()
        sessionStore.setState({ status: 'idle', sessionId: null, meetingId: null, startedAtMs: null })
        pausedAtMs = null
        pausedTotalMs = 0
        break
      default:
        break
    }
  })
}

export function detachSessionStore(): void {
  unsubscribe?.()
  unsubscribe = null
  bridge = null
  stopTicker()
  if (interimTimer !== null) {
    clearTimeout(interimTimer)
    interimTimer = null
  }
  pausedAtMs = null
  pausedTotalMs = 0
  sessionStore.setState(initialState)
}
