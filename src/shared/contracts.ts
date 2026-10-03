export const PROTOCOL_VERSION = 1 as const

export type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }

export type SessionConfig = {
  audioSource: AudioSource
  recognitionMode: 'realtime' | 'accurate'
  /** Selects the recognition model; recognitionMode is kept only for compatibility with older protocol versions. */
  recognitionModelId?: string
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'hymt2' | 'm2m100' | 'microsoft' | 'openai' | 'ollama'
  /**
   * Local translation model id. Free-form because a model the user installed from Hugging Face
   * is addressed by the same table as the shipped ones; the engine refuses an id nothing in that
   * table can load, rather than substituting a default.
   */
  translationModelId?: string
  translationOptions?: {
    endpoint?: string
    apiKey?: string
    region?: string
    model?: string
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
  /** Wall clock when it stopped; undefined while the meeting is still open. */
  endedAtMs?: number
  durationMs: number
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
  | Envelope<'listResources'>
  | (Envelope<'manageResource'> & {
      resourceId: string
      action: 'install' | 'remove' | 'cancel'
    })
  | (Envelope<'startSession'> & { config: SessionConfig })
  | (Envelope<'stopSession'> & { sessionId: string })
  | (Envelope<'setSessionPaused'> & { sessionId: string; paused: boolean })
  | Envelope<'shutdown'>
  | (Envelope<'searchHubModels'> & { query: string; slot?: 'recognition' | 'translation'; limit?: number })
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

/** One inspected Hugging Face hit. `compatibility` is the load-bearing field. */
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
  /**
   * How many candidates the hub listed in total. `models` can be shorter — the engine inspects a
   * bounded number of hits to stay inside the hub's anonymous rate limit — so a truncated result
   * set is reported rather than presented as exhaustive.
   */
  candidates: number
  rateLimited: boolean
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
