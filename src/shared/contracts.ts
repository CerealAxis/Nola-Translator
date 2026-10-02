export const PROTOCOL_VERSION = 1 as const

export type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }

export type SessionConfig = {
  audioSource: AudioSource
  recognitionMode: 'realtime' | 'accurate'
  /** Selects the recognition model; recognitionMode is kept only for compatibility with older protocol versions. */
  recognitionModelId?: 'qwen3-asr-1.7b-hf' | 'qwen3-asr-0.6b-hf' | 'sensevoice-small'
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'hymt2' | 'm2m100' | 'microsoft' | 'openai' | 'ollama'
  /** Local Hy-MT2 quantization tier; only applied when translationProvider=hymt2. */
  translationModelId?: 'hy-mt2-1.8b-q4-k-m' | 'hy-mt2-1.8b-q3-k-m' | 'hy-mt2-1.8b-iq2-m'
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
  | Envelope<'shutdown'>

export type AudioDevice = {
  deviceId: string
  name: string
  kind: 'systemOutput' | 'microphone'
  isDefault: boolean
}

export type ResourceRecord = {
  resourceId: string
  kind: 'recognitionModel' | 'translationModel'
  provider: 'qwen3-asr' | 'sensevoice' | 'hy-mt2' | 'm2m100'
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
      code: 'idle' | 'starting' | 'ready' | 'listening' | 'stopping'
      details?: Record<string, unknown>
    })
  | (Envelope<'error'> & {
      code: EngineErrorCode
      recoverable: boolean
      details?: Record<string, unknown>
    })
  | Envelope<'shutdownComplete'>
