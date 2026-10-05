import type { CloudApiFormat } from './settings'
import type { ComputeSettings, ComputeSnapshot } from './compute'

export const PROTOCOL_VERSION = 1 as const

/**
 * 引擎**子进程**的存活状态，主进程独占这份知识。
 *
 * 它和 `EngineEvent` 里那条 `status` 事件不是一回事，别合并：
 *   · `status` 是引擎在 stdout 协议上自报的话，引擎可以只说会话层面的事；
 *   · 这里说的是"这个进程还在不在、握没握手"。引擎还没跑起来时它**没有语言**，
 *     所以这条状态只存在于主进程与界面之间，永远不进协议。
 *
 * 定义放在 `shared/` 而不是 `main/engine-process.ts` 是因为渲染进程也要读它
 * （界面显示的状态与它一一映射）。主进程那边从 `engine-process.ts` 原样转出，
 * 免得同一个联合类型有两份定义、两处漂移。
 *
 * `crash` 与 `fatalError` 两条 EventEmitter 事件**都**紧跟在一次 `setState('failed')`
 * 之后（`engine-process.ts` 的 `handleTermination` 与 `connectWithRetries`），
 * 所以只转发 `state` 就已经涵盖崩溃，不必单独转发那两条。
 *
 * **`recovering` 是"进程没了、但主进程还打算重试"，`failed` 是"重试已经不用指望了"。**
 * 这两个结论只有 `EngineProcess` 能下：它手里有退避表（`restartDelaysMs`）与已用次数，
 * 界面既数不了也猜不着（从时序上猜就是又一次推断，而推断在这里已经错过三次）。
 * 所以它进这个联合类型，而不是界面临时加一个布尔量 —— 崩溃那一刻转发的
 * `engineStateChanged` 与挂载时查回来的 `engine:get-state` 读的是同一个值，
 * 渲染进程重载正好落在退避窗口里也不会读到过期的 `failed`。
 */
export type EngineProcessState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'recovering' | 'failed'

export type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }

export type SessionConfig = {
  compute?: ComputeSettings
  audioSource: AudioSource
  recognitionMode: 'realtime' | 'accurate'
  /** Selects the recognition model; recognitionMode is kept only for compatibility with older protocol versions. */
  recognitionModelId?: string
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'local' | 'cloud' | 'microsoft'
  /**
   * Local translation model id. Free-form because a model the user installed from Hugging Face
   * is addressed by the same table as the shipped ones; the engine refuses an id nothing in that
   * table can load, rather than substituting a default.
   */
  translationModelId?: string
  /**
   * The whole field must be ABSENT when provider is 'local' — an empty `{}` is rejected by the
   * engine as an invalid configuration, so `undefined` (field not sent) and `{}` are not the
   * same thing on this wire.
   */
  translationOptions?: {
    endpoint?: string
    region?: string
    model?: string
    apiFormat?: CloudApiFormat
    contextWindow?: number
    maxOutputTokens?: number
    apiKey?: string
  }
  /** Absolute path the engine records this meeting's audio to. Omitted means no audio file. */
  recordingPath?: string
}

export type Translation = {
  targetLanguage: string
  text?: string
  state: 'pending' | 'complete' | 'failed'
  provider: string
  errorCode?: string
}

/**
 * One recorded meeting. Starting a caption session always opens one; there is no opt-in switch,
 * because a transcript nobody asked to keep is worth nothing after the meeting ends.
 *
 * `title` is empty until the user renames the meeting — the list then renders a localized default
 * from `startedAtMs` and `daySequence`, so switching the UI language relabels every meeting without
 * touching disk.
 */
export type MeetingMeta = {
  meetingId: string
  title: string
  titleIsCustom: boolean
  /** Free-form note the user wrote. Optional so meetings recorded before this field need no migration. */
  notes?: string
  /** Wall clock when the caption session started. */
  startedAtMs: number
  /**
   * Wall clock when the **content** ended — not when the user pressed stop.
   *
   * 它过去是 finalize 那一刻的 `Date.now()`，而 `finish()` 跑在引擎卸完几个 GB 权重、
   * 发出 `sessionStopped` **之后**，所以它比最后一句话晚了 25~60 秒。现在由最后一条字幕
   * 推出来。一条内容都没有的退化情形保留墙钟 —— 没有内容时刻可指。
   * 会议仍在进行时为 undefined。
   */
  endedAtMs?: number
  /**
   * Lifecycle marker. `endedAtMs` alone cannot say "started but never finished": a session killed
   * with the app leaves a meta with no `endedAtMs`, and the UI read that as 进行中 forever.
   * `interrupted` is exactly that case — started, never finalized, not running now.
   * Optional so meetings recorded before this field need no migration; the main process fills it
   * in on load (see MeetingStore.loadAll).
   */
  state?: 'running' | 'completed' | 'interrupted'
  /**
   * **内容有多长** = 最后一条内容结束 − 第一条内容开始。列表、详情页、导出都只看这一个数。
   *
   * 它**故意不等于** `endedAtMs - startedAtMs`：录音本身就不含暂停与前导静音（见引擎
   * `setSessionPaused` 的说明），所以"开头空了四分钟、之后说了九十分钟"的一场，录音就是
   * 90 分钟，时长也该是 90 分钟 —— 过去列表显示 398 秒。
   *
   * 老记录里这个值是旧的墙钟时长且**无法重算**（字幕文件还在，但要重扫全部历史记录不值得）。
   * 它们的音频长度是更接近真相的替代，但统一改写历史数据不在这次改动范围内。
   */
  durationMs: number
  /**
   * 首尾内容时刻，**会话相对**毫秒（与 `CaptionSegment.startedAtMs` 同一个时钟）。
   * 这一场没有产出任何字幕时两个字段都缺席。
   *
   * 落盘是因为有两处都要用、而且事后都算不出来：录音的 t=0 是采集**真正吐出第一帧**的
   * 时刻，播放器要靠这个量把字幕对齐；上面的时长就是这两者之差。
   */
  contentStartedAtMs?: number
  contentEndedAtMs?: number
  /** How many meetings already existed on the same local day, used for the `_记录_1` suffix. */
  daySequence: number
  segmentCount: number
  sourceLanguage: string
  targetLanguage: string
  /** File name inside the meeting directory; undefined when no audio was recorded. */
  audioFile?: string
  audioDurationMs?: number
}

export type CaptionSegment = {
  segmentId: string
  revision: number
  startedAtMs: number
  endedAtMs?: number
  sourceLanguage?: string
  sourceText: string
  isFinal: boolean
  translations: Translation[]
}

type Envelope<TType extends string> = {
  protocolVersion: typeof PROTOCOL_VERSION
  type: TType
  requestId: string
}

export type EngineCommand =
  | (Envelope<'hello'> & { clientVersion: string })
  | Envelope<'listDevices'>
  | Envelope<'listComputeDevices'>
  | Envelope<'listResources'>
  | (Envelope<'manageResource'> & {
      resourceId: string
      action: 'install' | 'remove' | 'cancel'
    })
  | (Envelope<'startSession'> & { config: SessionConfig })
  | (Envelope<'stopSession'> & { sessionId: string })
  | (Envelope<'setSessionPaused'> & { sessionId: string; paused: boolean })
  | Envelope<'shutdown'>
  | (Envelope<'searchHubModels'> & { query: string; slot?: 'recognition' | 'translation'; limit?: number; weightFormat?: 'gguf'; cursor?: string })
  | (Envelope<'inspectHubRepo'> & { repo: string })
  | (Envelope<'installHubRepo'> & { repo: string; slot?: 'recognition' | 'translation' })

export type AudioDevice = {
  deviceId: string
  name: string
  kind: 'systemOutput' | 'microphone'
  isDefault: boolean
}

export type ResourceRecord = {
  resourceId: string
  kind: 'recognitionModel' | 'translationModel'
  /**
   * Names the loader that will actually run this model, which is the runtime adapter id
   * (`qwen3-asr`, `sensevoice`, `m2m100`, `llama.cpp`). Free-form because a self-installed model
   * carries whichever adapter its own metadata selected; the four shipped families are a subset,
   * not the whole vocabulary.
   */
  provider: string
  name: string
  description: string
  languages: string[]
  sourceLanguage?: string
  targetLanguage?: string
  installed: boolean
  installedBytes: number
  downloadBytes?: number
  state: 'idle' | 'running' | 'cancelling' | 'failed'
  phase?: 'resolve' | 'download' | 'verify' | 'install' | 'remove' | 'cleanup'
  progress?: number
  cancellable: boolean
  errorCode?: string
}

/**
 * Whether the engine can run a repo, and the model-declared facts the call was made on.
 *
 * `reason` is written for the user and always explains a refusal in terms of what the repo itself
 * declares; `evidence` carries the raw values so a verdict can be explained later without going
 * back to the network. The UI is expected to render this rather than infer installability from
 * the repo name.
 */
export type HubCompatibility = {
  compatible: boolean
  reasonCode: string
  reason: string
  slot?: 'recognition' | 'translation'
  loader?: 'llama.cpp' | 'transformers' | 'funasr'
  adapterId?: string
  languages: string[]
  evidence: Record<string, string>
}

/** A Hugging Face metadata hit, available before README or runtime inspection finishes. */
export type HubModelSummary = {
  repo: string
  /** `hub:<owner>/<name>` — the id this repo gets once installed, so the UI can name the action early. */
  resourceId: string
  revision?: string
  formats?: ('pytorch' | 'gguf')[]
  description?: string
  author?: string
  pipelineTag?: string
  libraryName?: string
  downloads?: number
  lastModified?: string
  hasGguf: boolean
  ggufArchitecture?: string
  fileCount: number
  downloadBytes?: number
  installed: boolean
  /** Only present if this repository has been inspected separately. */
  compatibility?: HubCompatibility
}

export type HubSearchResult = {
  query: string
  models: HubModelSummary[]
  /** Metadata candidates fetched before format filtering and the displayed page limit. */
  candidates: number
  rateLimited: boolean
  /** Opaque Hub cursor. Absent only when no further page is available. */
  nextCursor?: string
}

export type HubInspectResult = {
  repo: string
  revision?: string
  fileCount: number
  downloadBytes?: number
  compatibility: HubCompatibility
}

export type ResourceSnapshot = {
  storagePath: string
  resources: ResourceRecord[]
}

export type EngineErrorCode =
  | 'invalidMessage'
  | 'unsupportedProtocol'
  | 'invalidConfiguration'
  | 'sessionNotRunning'
  | 'sessionAlreadyRunning'
  | 'audioDeviceUnavailable'
  | 'modelUnavailable'
  | 'resourceUnavailable'
  | 'resourceNotFound'
  | 'resourceBusy'
  | 'resourceInUse'
  | 'lineTooLarge'
  | 'internalError'

export type EngineEvent =
  | (Envelope<'ready'> & { engineVersion: string; capabilities: string[] })
  | (Envelope<'devices'> & { devices: AudioDevice[] })
  | (Envelope<'computeDevices'> & ComputeSnapshot)
  | (Envelope<'resources'> & ResourceSnapshot)
  | (Envelope<'resourceActionResult'> & { resource: ResourceRecord })
  | (Envelope<'resourceChanged'> & { resource: ResourceRecord })
  | (Envelope<'sessionStarted'> & { sessionId: string })
  | (Envelope<'sessionStopped'> & { sessionId: string })
  | (Envelope<'caption'> & { sessionId: string; segment: CaptionSegment })
  | (Envelope<'modelProgress'> & {
      modelId: string
      operation: 'download' | 'install' | 'remove'
      progress: number
      state: 'running' | 'complete' | 'failed'
    })
  | (Envelope<'status'> & {
      code: 'idle' | 'starting' | 'ready' | 'listening' | 'paused' | 'stopping'
      details?: Record<string, unknown>
    })
  | (Envelope<'error'> & {
      code: EngineErrorCode
      recoverable: boolean
      details?: Record<string, unknown>
    })
  | (Envelope<'hubModels'> & HubSearchResult)
  | (Envelope<'hubInspect'> & HubInspectResult)
  | Envelope<'shutdownComplete'>
