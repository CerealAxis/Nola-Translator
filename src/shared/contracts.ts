import type { ModelConfiguration } from './model-capabilities'
import type { CloudApiFormat, NetworkSettings } from './settings'
import type { ComputeSettings, ComputeSnapshot } from './compute'

export const PROTOCOL_VERSION = 1 as const

/**
 * Engine *subprocess* liveness, known only to the main process and never on the wire: the
 * `status` event reports what the engine says about a session, and an engine that is not up has
 * no such language. Lives in `shared/` because the renderer maps it one-to-one; `engine-process.ts`
 * re-exports it rather than redeclaring. `recovering` means a retry is still scheduled, `failed`
 * that the backoff table is exhausted — only `EngineProcess` can tell those apart, and forwarding
 * `state` alone covers `crash` and `fatalError`, which each follow a setState.
 */
export type EngineProcessState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'recovering' | 'failed'

export type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }
  | { kind: 'browserTab'; streamId: string }

export type SessionConfig = {
  compute?: ComputeSettings
  audioSource: AudioSource
  recognitionMode: 'realtime' | 'accurate'
  /** Selects the recognition model. The engine still requires `recognitionMode` but dispatches on this field alone. */
  recognitionModelId?: string
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'local' | 'cloud' | 'microsoft'
  /**
   * Local translation model id. The engine refuses an id no resource resolves rather than falling
   * back to a default.
   */
  translationModelId?: string
  /**
   * Must be absent, not `{}`, for a remote provider: the engine substitutes its default endpoint
   * and model only when the field is missing outright, and passes an empty string through to the
   * provider's own "address is empty" message. `local` never reads this field at all.
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
  browserTimeline?: { epoch: number; videoTimeMs: number; playbackRate: number }
}

/**
 * The weights a prewarm loads, without opening a session.
 *
 * `compute` is required and must be the same object the following `startSession` would carry: the
 * engine keys its loaded-runtime cache on the model path plus the sorted compute options, so a
 * prewarm run against different device or quantization settings leaves a second copy of the same
 * weights in memory and the session that follows misses the cache — the load was paid for twice.
 * The translation fields are `SessionConfig`'s own, minus the credential: a cloud provider keeps
 * no local weights, so there is nothing to prewarm and no reason to hand over an API key.
 */
export type PrewarmConfig = {
  compute: ComputeSettings
  recognitionModelId: string
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'local' | 'cloud' | 'microsoft'
  translationModelId?: string
  translationOptions?: SessionConfig['translationOptions']
}

/**
 * The codes the engine's prewarm branch refuses with, kept narrow so the UI can name the cause
 * instead of collapsing every failure into one message.
 *
 * A language the model does not cover is deliberately **not** a code of its own: it arrives as
 * `invalidConfiguration` carrying a per-language `details.reason` (`unsupportedRecognitionLanguage`
 * or `unsupportedTranslationLanguage` on the prewarm path).
 */
export const PREWARM_ERROR_CODES = ['resourceBusy', 'sessionAlreadyRunning', 'invalidConfiguration', 'resourceUnavailable', 'modelUnavailable'] as const
export type PrewarmErrorCode = (typeof PREWARM_ERROR_CODES)[number]

/** The settled answer of a prewarm; the `loading` state stays on the event channel. */
export type PrewarmResult = {
  state: 'ready' | 'failed'
  code?: PrewarmErrorCode
  message?: string
}

export type Translation = {
  targetLanguage: string
  text?: string
  state: 'pending' | 'complete' | 'failed'
  provider: string
  errorCode?: string
}

/**
 * One recorded meeting. Starting a caption session always opens one.
 * `title` stays empty until renamed, and the list renders a localized default from `startedAtMs`
 * and `daySequence`, so switching the UI language relabels every meeting without touching disk.
 */
export type MeetingMeta = {
  meetingId: string
  title: string
  titleIsCustom: boolean
  notes?: string
  startedAtMs: number
  /**
   * Wall clock when the **content** ended, not when the user pressed stop — a meeting with no
   * content keeps the wall clock, since there is no content moment to point at. Undefined while
   * the session is still running.
   */
  endedAtMs?: number
  /**
   * Lifecycle marker. `endedAtMs` alone cannot say "started but never finished": a session killed
   * with the app leaves a meta with no `endedAtMs`. `interrupted` is exactly that case — started,
   * never finalized, not running now. The store writes it at load (`MeetingStore.reconcileInterrupted`).
   */
  state?: 'running' | 'completed' | 'interrupted'
  durationMs: number
  /**
   * First and last content moment, **session-relative** milliseconds on the same clock as
   * `CaptionSegment.startedAtMs`. Both absent when a meeting produced no captions. Persisted
   * because the player needs the offset to align captions, and `durationMs` is their difference.
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
      // Every command that reaches the network carries its own copy, so a settings change
      // applies to the next request instead of needing an engine restart.
      network?: NetworkSettings
    })
  | (Envelope<'startSession'> & { config: SessionConfig })
  | (Envelope<'prewarmModels'> & { config: PrewarmConfig })
  | (Envelope<'stopSession'> & { sessionId: string })
  | (Envelope<'setSessionPaused'> & { sessionId: string; paused: boolean })
  | (Envelope<'pushAudio'> & { sessionId: string; streamId: string; epoch: number; sequence: number; sampleRate: number; capturedAtMs: number; pcmBase64: string })
  | (Envelope<'resetStream'> & { sessionId: string; epoch: number; videoTimeMs: number; playbackRate: number })
  | (Envelope<'finishStream'> & { sessionId: string; epoch: number })
  /** One diagnostic line for the shared pipeline log; the engine writes it and answers with `debugLogged`. */
  | (Envelope<'debugLog'> & { layer: string; event: string; data: Record<string, unknown> })
  | Envelope<'shutdown'>
  | (Envelope<'searchHubModels'> & { query: string; slot?: 'recognition' | 'translation'; limit?: number; weightFormat?: 'gguf'; cursor?: string; network?: NetworkSettings })
  | (Envelope<'inspectHubRepo'> & { repo: string; network?: NetworkSettings })
  | (Envelope<'installHubRepo'> & { repo: string; slot?: 'recognition' | 'translation'; network?: NetworkSettings })
  | (Envelope<'configureModel'> & { resourceId: string; configuration: ModelConfiguration })

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
   * Names the loader that will run this model, and two vocabularies reach it: built-in models
   * report the provider in `resources.py` (`qwen3-asr`, `sensevoice`, `m2m100`, `hymt2`) while a
   * hub-installed repo passes through its adapter id (`llama.cpp`).
   */
  provider: string
  name: string
  description: string
  languages: string[]
  configuration?: ModelConfiguration
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
 * Whether the engine can run a repo, plus the model-declared facts the call was made on. `reason`
 * is written for the user; `evidence` keeps the raw values so a verdict can be explained later
 * without going back to the network. The UI is expected to render this rather than infer
 * installability from the repo name.
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
  | 'audioBufferOverflow'
  | 'modelUnavailable'
  | 'resourceUnavailable'
  | 'resourceNotFound'
  | 'resourceBusy'
  | 'resourceInUse'
  | 'networkUnavailable'
  | 'integrityCheckFailed'
  | 'installFailed'
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
  | (Envelope<'modelsPrewarmed'> & {
      /**
       * How far the prewarm got. `loading` is written before the weights are read, because a cold
       * load is long enough that a client waiting on the terminal event has nothing to show; a
       * refusal arrives as an `error` event instead of a third state.
       */
      state: 'loading' | 'ready'
      recognitionModelId: string
      /** The translation model the request resolved and validated. Its weights are not loaded by a prewarm, so this reports intent rather than residency. */
      translationModelId?: string
      elapsedMs: number
      device?: string
      runtime?: string
    })
  | (Envelope<'sessionStopped'> & { sessionId: string })
  | (Envelope<'caption'> & { sessionId: string; segment: CaptionSegment; streamEpoch?: number; videoStartedAtMs?: number; videoEndedAtMs?: number })
  | (Envelope<'audioAccepted'> & { sessionId: string; epoch: number; sequence: number })
  | (Envelope<'streamReset'> & { sessionId: string; epoch: number })
  | (Envelope<'streamFinished'> & { sessionId: string; epoch: number })
  | Envelope<'debugLogged'>
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
