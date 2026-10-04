/**
 * 同传会话状态机：`idle | starting | running | paused | stopping | error`。
 *
 * 这个文件里有五条从主仓继承来的教训，写的时候不要"简化"掉：
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
 * 5. **不要在这里推断引擎进程状态。** `engineStatus` 由主进程观测后转发过来，只由
 *    `applyEngineState` 写。曾经反过来：界面自己先猜"要 booting 了"，再用
 *    这个猜测反过来判定"引擎起不来"—— 猜错一次就报一次假故障（这个 bug 类已经让三个
 *    界面 bug 各打了一个临时补丁）。手上没有权威信号时，正确做法是不知道，不是猜。
 */

import { DEFAULT_SETTINGS } from '@/bridge'
import type { NolaBridge } from '@/bridge'
import type {
  CaptionSegment,
  EngineChannelEvent,
  EngineEvent,
  EngineProcessState,
  ResourceSnapshot,
  SessionConfig,
  SessionStatus,
} from '@/bridge'
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

/**
 * 引擎进程在本窗眼里的状态。**五个取值对应五种用户出路完全不同的局面。**
 *
 * **`observed`，不是推断出来的。** 这一栏由主进程转发的 `engineStateChanged` 事件驱动
 * （`src/main/ipc.ts` 转发 `EngineProcess` 的 `state`），首次挂载时另调一次
 * `engine.getEngineState()` 把**当前**值读回来。它以前不是这样：主进程只转发引擎协议
 * 事件，进程状态从没到过渲染进程，于是界面只能自己猜，猜错的地方有三处 ——
 * 冷启动被当成引擎挂了、预检把引擎起不来报成设备不可用、跑着跑着崩掉完全看不见。
 * **不要再写它。** `failed` / `recovering` / `ready` 都有实据（主进程实测），不是这里推出来的。
 *
 * 以前这里还有一个 `engineReady: boolean`，它是 `engineStatus === 'ready'` 的降维版本，
 * **已删**。一个布尔值回答不了界面要问的问题：冷启动（引擎从没起过，**什么都没坏**）、
 * 引擎起不来（主进程重试耗尽）、引擎正在重连，三者在它那里都是 `false`，
 * 于是设置页把一次崩溃写成「引擎未启动」—— 把故障报成没发生。留着一个降维副本，
 * 就等于给同一个事实留第二个写法，迟早各说各话。
 *
 * 各取值的含义（由 `ENGINE_PROCESS_STATE_TO_UI` 从主进程状态一对一映射而来）：
 *   · `idle`       引擎没在跑（`stopped`），**不是故障**。
 *   · `booting`    引擎在启动/握手中（`starting`）。主进程在 app ready 时就启动引擎，
 *                  所以这一态通常出现在应用刚打开的几秒里。
 *   · `ready`      握过手了（`ready`）。
 *   · `recovering` 引擎进程刚消失，但主进程**还有重试次数**（`recovering`）。会自愈，
 *                  **不要**报故障。
 *   · `failed`     引擎起不来，且重试已经耗尽（`failed`）。这一态不会自己变好。
 */
export type EngineStatus = 'idle' | 'booting' | 'ready' | 'recovering' | 'failed'

/**
 * 主进程 `EngineProcessState` → 界面 `EngineStatus`。**唯一的映射处。**
 *
 * 写成穷举的 `Record`（而不是若干三元）是有意的：`engine-process.ts` 将来加第六个
 * 取值时，这一行会**编译不过**，逼着做决定，而不是让新状态悄悄落到 `?? 'idle'` 上
 * 被当成"没起过"。
 *
 * `stopping` 映射成 `idle` 而不是 `booting`：引擎正在收尾时它已经不可用了，
 * 而"不可用"与"从没起来"对用户是同一件事（什么都不用做）。
 *
 * **`stopSession` 之后不会有 `stopped` 事件。** 结束一场同传只发一条协议命令
 * （`src/main/ipc.ts` 的 `stopSession` 处理器），引擎进程继续留着，下一场还能用 ——
 * 这也是本应用不给引擎做"保温"的原因：权重每场结束就卸（`runtime.py` 的
 * `_unload_session_models`），留着一个空进程并不省任何加载时间。
 * `stopping` → `stopped` 只在两个地方发生：退出应用（`app.on('before-quit')`），
 * 以及字幕窗关闭时收尾失败、顺带把引擎进程正式停掉的那个兜底分支。
 * `recovering` 不映射成 `failed`：一次 250ms 就能自愈的崩溃不是故障，红色告警
 * 应该在退避耗尽（主进程置 `failed`）时才出现。
 */
const ENGINE_PROCESS_STATE_TO_UI: Record<EngineProcessState, EngineStatus> = {
  stopped: 'idle',
  starting: 'booting',
  ready: 'ready',
  stopping: 'idle',
  recovering: 'recovering',
  failed: 'failed',
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
  /**
   * 引擎的进程级状态，把"没起过"、"起不来"与"正在重连"分开，见 `EngineStatus`。
   *
   * **观察来的，不要在这里推断。**
   */
  engineStatus: EngineStatus
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
  engineStatus: 'idle',
  engineVersion: null,
  segments: [],
  interim: null,
}

export const sessionStore = createStore<SessionState>(initialState)

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null

/**
 * 本次挂载以来是否已经收到过一条 `engineStateChanged`。
 *
 * 存在的唯一理由是补一个真实存在的竞态：`getEngineState()` 是一次往返，在它飞回来的路上
 * 引擎完全可能又变了状态，而那个变化**先**作为事件到达（通道是同一条，事件比 invoke 的
 * 返回值更早）。此时若把读回来的旧值照写，就会用一个过期的"快照"盖掉刚收到的边沿 ——
 * 而这次改动的全部意义就是"不要拿过期的东西覆盖事实"。所以：见过边沿就不采纳那次查询。
 */
let engineStateSeen = false

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
 * （进程起来了），不是某一场会话的状态。进程级的握手由 `engineStatus` 负责
 * （`EngineProcessState` 的 `ready` 经 `engineStateChanged` 过来）。把两者混在一起会让
 * "引擎好了"被读成"这场会开始了"。
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

// -- 引擎进程状态 --------------------------------------------------------------

/**
 * `state === 'error'` 时的错误码：引擎进程没了，**这一场会**到此为止。
 *
 * 用码而不是布尔量，是因为它要经过 `errorCode` → `errors.*` 那条既有通路
 * （`WorkspacePage` 的 `ERROR_TABLE`、浮窗的 `StartFailureNotice` 都在读 `errorCode`），
 * 而那条通路已经规定"界面文案由码查表、诊断串不进界面"。
 */
export const ENGINE_LOST_CODE = 'ENGINE_LOST'

/**
 * **全文件唯一写 `engineStatus` 的地方。**
 *
 * 输入是主进程告诉我们的**实测值**（`engineStateChanged` 事件，或挂载时
 * `getEngineState()` 读回来的当前值），不是任何一次调用的成败。
 *
 * **不要在别处再写这个字段。** 过去 `startSession` 的失败分支与 `PreflightDialog`
 * 都在这里之外自己判"引擎是不是没起来"并写 `failed`，那两处推断都已经删掉了：
 * 主进程在抛错**之前**就置了 `failed` 并转发了出来，界面比错误更早知道。
 *
 * 引擎进程不在了的时候顺手把这一场收掉（`abandonSessionOnEngineLoss`）：两件事
 * 来自同一条观测，放在这里是为了让"`engineStatus` 只有一个来源"这句话继续成立 ——
 * 边沿与查询（`getEngineState()`）两条入口都会经过它，重载落在退避窗口里也一样。
 */
function applyEngineState(state: EngineProcessState): void {
  const engineStatus = ENGINE_PROCESS_STATE_TO_UI[state]
  sessionStore.setState({ engineStatus })
  if (engineStatus === 'recovering' || engineStatus === 'failed') abandonSessionOnEngineLoss()
}

/**
 * 引擎进程没了，而本窗还持有会话。
 *
 * **不要把它读成"引擎待会儿会自己好"。** 重连出来的是一个**新进程**：没有这场会话、
 * 没有录音、也没有已加载的权重（每场结束引擎就卸，`runtime.py` 的
 * `_unload_session_models`），所以主进程还剩几次重试都不改变结论 —— 这一场回不来。
 * 真正会自愈的是**引擎**，不是这场会。
 *
 * 收尾方式与 `sessionStopped` 那一支同一套（停表、冻结读数、清 `sessionId`，
 * **保留已经收到的字幕**），唯一的区别是不装作正常结束：`status` 抬成 `error`
 * 并带上 `ENGINE_LOST`，好让界面说出"这场会中断了"，并把用户送到那条记录。
 * 走 `error` 而不是新增一个会话状态，是因为 `SessionErrorDialog` 已经是"会话出错"
 * 这件事的现成出口，而 `status` 的取值还牵着 `SessionBar` 与浮窗的按钮语义。
 *
 * 主进程在同一条边沿上收了它自己的账本（释放 `activeSessionId`、给会议落结束时间），
 * 见 `src/main/ipc.ts` 的 `releaseSessionOnEngineLoss` —— 否则引擎自愈之后用户开新会话
 * 会拿到「已有字幕会话正在运行」，而实际上什么都没在跑。
 */
function abandonSessionOnEngineLoss(): void {
  const { sessionId } = sessionStore.getState()
  // 本窗没持有会话：主窗在 idle、浮窗还没认领 `sessionStarted`，或者已经收过尾了。
  // 那种情况下没有"这一场"可以结束，不许借引擎的边沿去改会话状态。
  if (sessionId === null) return
  stopTicker()
  pausedAtMs = null
  pausedTotalMs = 0
  sessionStore.setState({
    status: 'error',
    // 诊断串：这一条是写死的，因为退出码与信号只存在于主进程（日志与 `diagnostics`），
    // 而这条边沿只带状态。**不要拿它拼界面文案**，界面走 `ENGINE_LOST` + `errors.engineLost`。
    error: '本地引擎进程已退出',
    errorCode: ENGINE_LOST_CODE,
    sessionId: null,
    meetingId: null,
    startedAtMs: null,
    elapsedMs: elapsedNow(),
  })
}

// -- 预检 ---------------------------------------------------------------------

/**
 * 按 `SessionConfig` 在资源快照里找缺的那一个。返回 null 表示可以开。
 *
 * **只有 `local` 进预检。** `cloud` / `microsoft` 的模型在服务商那边，本机既没有对应
 * 资源也没有下载渠道，所以它们的 `translationResourceId` 是 null —— 不是「进快照查一遍，
 * 查不到就算缺失」。
 *
 * **本地要预检哪一个，只由 `translationModelId` 决定。** Hy-MT2 三档、M2M100、Hub 自装
 * GGUF 合并成同一个 provider 之后，彼此的区别就是这一个字符串；这里再按 provider 分叉、
 * 或者写死某个模型 id，都会让预检替另一个模型背书（说它装了，真要跑的是没装的那一个）。
 * 字段缺失或空白时回落到内置默认档（`DEFAULT_SETTINGS.translation.localModelId`）——
 * 别去抄引擎「字段整个缺席」时的兜底 id：那是协议底线那一档，与设置默认值不是同一个
 * 量化档，抄错了等于预检在替另一个模型背书。
 *
 * **id 不在快照里判「缺失」而不是「跳过」**：放行到引擎再报错，只是把「配置没做完」
 * 伪装成「引擎坏了」。
 */
export function findMissingResource(
  snapshot: { readonly resources: readonly { resourceId: string; name: string; installed: boolean; kind?: string }[]; storagePath?: string },
  config: SessionConfig,
): MissingResource | null {
  // 不翻目标语言，或用的不是本地 provider：这一场就没有本地翻译模型要预检。
  const translationResourceId = config.targetLanguages.length === 0 || config.translationProvider !== 'local'
    ? null
    : config.translationModelId?.trim() || DEFAULT_SETTINGS.translation.localModelId
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

  /*
   * **这里曾经有一行 `engineStatus: engineWasReady ? 'ready' : 'booting'`，现在没有了。**
   *
   * 那是在本地**猜**引擎接下来会怎么走：猜得准的时候它只是提前了半毫秒，猜不准的时候
   * （引擎早就 ready 却因为别的原因失败）它就把界面按在一个假状态上。更贵的是它催生了
   * 下面两处 `state.engineStatus === 'booting' ? 'failed' : ...` —— 判据反过来依赖
   * 自己写的那一行，于是"引擎起不来"这件事是由界面自己判的，而不是主进程测出来的。
   *
   * 现在 `engineStatus` 只由 `applyEngineState` 写，源头是主进程转发的 `state` 事件：
   * 主进程在处理 `listResources` 的第一句 `ensureReady()` 里就会 `setState('starting')`，
   * 而界面此刻正卡在 `status === 'starting'`（`IdleGuide` 那块引导不渲染），
   * 所以从"点开始"到"引擎开始启动"这几毫秒没有任何东西会闪。
   */

  // 预检放在 try 之外：它失败时**不是**"引擎出错"，会话根本没开。放进 try 会让同一个
  // catch 把状态改写成 error，用户看到的是"引擎异常"而不是"少装了一个模型"。
  let missing: MissingResource | null
  try {
    missing = findMissingResource(await bridge.engine.listResources(), config)
  } catch (error) {
    /*
     * 连资源列表都拉不到。**这里只报错误，不再判断引擎是不是起不来。**
     *
     * 旧版在这一行写 `engineStatus: state.engineStatus === 'booting' ? 'failed' : ...`，
     * 理由是"失败那一刻还停在 booting 就说明引擎没握上手"。那条判据现在不需要了：
     * 主进程在 `engine.start()` 抛错**之前**就已经 `setState('failed')` 并把
     * `engineStateChanged` 发到了界面上，而抛错是这个通道上**更晚**的一条报文，
     * 所以走到这个 `catch` 时 `engineStatus` 早就被 `applyEngineState` 写好了。
     *
     * 也就是说：引擎起不来时界面照样会显示 `failed`（有实据），但这个结论不再由界面猜，
     * 而配置非法、已有会话在跑之类的失败**再也不会**被顺手改成 `failed`。
     */
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: errorCodeOf(error),
    })
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
      // 这里曾经顺手写 `engineStatus: 'ready'`，理由是"处理器的第一句是 ensureReady()，
      // 走到这里说明握上手了"。**现在不写了**：那是拿一次调用的成功去反推进程状态，
      // 而进程状态本来就有权威来源（主进程的 `state` 事件），而且它此刻已经写好了。
      // 让主进程说的算，是这个字段能当事实用的前提。
    })
    startTicker()
  } catch (error) {
    // 与上面那条同源：这里也曾经有 `state.engineStatus === 'booting' ? 'failed' : ...`。
    // 同样是删掉 —— 引擎真起不来时主进程已经把 `failed` 送到了界面上（报文更早），
    // 而这一场会话自己的失败（配置非法、已有会话在跑）不该再被说成"引擎坏了"。
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: errorCodeOf(error),
    })
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
    // 唯一不许覆盖的是 `ENGINE_LOST`：引擎在收尾途中崩掉时，那条边沿已经报过真话了
    // （见 `abandonSessionOnEngineLoss`），这里再写一个从异常文本猜出来的兜底码
    // （多半是 SESSION_ERROR）只会把"引擎没了"说成"启动失败"，方向正好说反。
    const engineLost = sessionStore.getState().errorCode === ENGINE_LOST_CODE
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: engineLost ? ENGINE_LOST_CODE : errorCodeOf(error),
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
  // **不动 `engineStatus`，而且现在有了更强的理由：它是观测值，不是本窗的标记。**
  //
  // 旧版的理由是"引擎起不来是引擎的现状，不是刚被关掉的那个对话框的现状"。那条仍然成立，
  // 但旧注释里"下一次 startSession 一进来就会把它改回 booting"这一句**已经不成立了** ——
  // 那行写入本身被删了（它是在猜引擎会怎么走）。现在不需要任何补偿动作：主进程说
  // `failed` 就还是 `failed`，主进程说 `ready` 就自己会送一条 `engineStateChanged` 过来。
  //
  // 具体到界面：关掉对话框之后引导块上那条 ENG-001 Alert 还要留着（`WorkspacePage` 的
  // `IdleGuide` 读的就是 `engineStatus === 'failed'`），出路是它自己的「重试启动」。
  // 在这里把它清掉等于把"主进程说引擎坏了"这句实话删掉，换来一条用户看得见但没人负责的
  // 重启状态 —— 所以这里什么都不做，等主进程改口。
  sessionStore.setState({ status: 'idle', error: null, errorCode: null })
}

export function clearSessionTranscript(): void {
  sessionStore.setState({ segments: [], interim: null })
}

// -- 注入 ---------------------------------------------------------------------

export function attachSessionStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event: EngineChannelEvent) => {
    switch (event.type) {
      /*
       * **引擎进程生命周期。这是 `engineStatus` 的唯一来源。**
       *
       * 主进程转发 `EngineProcess` 的 `state` 事件（`src/main/ipc.ts` 的 `forwardState`），
       * 载在这条通道上。崩溃也走这里：`engine-process.ts` 在 `emit('crash')` /
       * `emit('fatalError')` **之前**先置 `failed` 或 `recovering`，所以一条
       * `engineStateChanged` 就够了，不必单独转发那两条。
       *
       * 这一支以前**根本不存在** —— 主进程只转发引擎协议事件，进程状态从没到过界面，
       * 于是"引擎跑着跑着死了"是彻底看不见的（见 `EngineStatus`）。
       *
       * **注意 `recovering` 也归这一支管**：`applyEngineState` 会在进程不在时把这一场收掉
       * （`abandonSessionOnEngineLoss`）。自愈的引擎与回不来的会话是两件事，前者不报警，
       * 后者必须让用户知道。
       */
      case 'engineStateChanged':
        // 边沿已经听见了，下面那次 `getEngineState()` 读回来的旧值就不能再覆盖它。
        engineStateSeen = true
        applyEngineState(event.state)
        break
      case 'ready':
        /*
         * 协议事件，**只**用来取 `engineVersion`（那是引擎自报的数据，别处拿不到）。
         *
         * 这里曾经顺手写 `engineStatus: 'ready'`，注释里还专门说明
         * "crash / fatalError / state 三个事件都没被转发，所以别在这里找那条消息" ——
         * 那三句现在都不成立了：`state` 已经被转发，引擎状态由上面那个分支负责。
         * **别把这个字段搬回这个分支**：一次握手成功不等于进程此刻还在（下一行代码
         * 它就可能崩了），拿事件去推断状态是这次改动要根除的那件事本身。
         */
        sessionStore.setState({ engineVersion: event.engineVersion })
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

  /*
   * **订阅之后立刻读一次当前值 —— 这半步就是"渲染进程重载"能自愈的原因。**
   *
   * 只订阅是不够的：事件给的是**边沿**，而重载（Ctrl+R、窗口重建、浮窗新开文档）时引擎
   * 往往早就 `ready` 了 —— 那一刻它不会再发一次任何东西。没有这一次查询，重载后的界面会
   * 一辈子停在 `engineStatus: 'idle'`，也就是我正在根除的那个 bug 本身（"分不清从没启动
   * 过与起不来"）。所以这两个形状是配套的：查询给**电平**，通道给**后续边沿**。
   *
   * 放在订阅**之后**：先挂上监听，再去问，中间发生的变化会以事件形式补上；
   * 反过来的话，查询与挂载之间发生的变化就两头不沾（既没被听到，也没被读到）。
   * 真正会咬人的只剩"变化发生在往返途中"这一种，`engineStateSeen` 挡的就是它。
   *
   * 这个调用**不会**启动引擎（主进程那条处理器刻意不调 `ensureReady()`），所以
   * `initStores` 挂上订阅时引擎还没起，界面看到的仍然是诚实的 `idle`。
   *
   * **为什么多套一层 `Promise.resolve().then()`：** 桥上没有 `getEngineState` 时
   * （缺桥，或 `tests/e2e/*.mjs` 里手写的假 `nolaTranslator`），`ipcBridge` 的 `call()`
   * 会**同步** throw。而这一行是在 `initStores` 里跑的，同步 throw 会一路冒到
   * `main.tsx` 的模块顶层，`createRoot().render()` 根本执行不到 —— 界面永远停在启动画面
   * （这段历史写在 `ipcBridge.ts` 顶部：那里正是因为同样的原因放弃了同步 throw）。
   * 所以把它包进 promise 链，让它变成一个被就地吞掉的 rejection：拿不到状态就从 `idle`
   * 起步。少一条状态消息，永远好过整个界面打不开。
   */
  engineStateSeen = false
  void Promise.resolve()
    .then(() => next.engine.getEngineState())
    .then(
      (state) => {
        if (engineStateSeen) return
        applyEngineState(state)
      },
      () => undefined
    )
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
  // 回到 `initialState` 就等于回到 `engineStatus: 'idle'`；下一次 `attachSessionStore`
  // 会重新订阅并重查一次，所以这里**不需要**保留旧值（保留反而会让一次重挂载显示成
  // "引擎已就绪"，而那可能只是上一个文档的残留认知）。
  engineStateSeen = false
  sessionStore.setState(initialState)
}
