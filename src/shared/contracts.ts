export const PROTOCOL_VERSION = 1 as const

export type AudioSource =
  | { kind: 'defaultOutput' }
  | { kind: 'systemOutput'; deviceId: string }
  | { kind: 'microphone'; deviceId: string }

export type SessionConfig = {
  audioSource: AudioSource
  recognitionMode: 'realtime' | 'accurate'
  /** 选择具体识别模型；recognitionMode 保留用于旧版本协议兼容。 */
  recognitionModelId?: 'qwen3-asr-1.7b-hf'
  sourceLanguage: string
  targetLanguages: string[]
  allowIntermediateTranslation?: boolean
  translationProvider?: 'hymt2' | 'microsoft' | 'openai' | 'ollama'
  translationOptions?: {
    endpoint?: string
    apiKey?: string
    region?: string
    model?: string
  }
}

export type Translation = {
  targetLanguage: string
  text?: string
  state: 'pending' | 'complete' | 'failed'
  provider: string
  errorCode?: string
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
  provider: 'qwen3-asr' | 'hy-mt2'
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
