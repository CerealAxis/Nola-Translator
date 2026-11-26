import type { TtsVoiceRef } from '../../../shared/tts/voice-ref'
export type ModelKind = 'llm' | 'asr' | 'mt' | 'tts'
export interface PlaygroundConfig {
  model: string
  kind: ModelKind
  effort: string
  source: string
  target: string
  voice?: string
  voiceRef?: TtsVoiceRef
  images?: boolean
  projectId?: string | null
  comicProjectId?: string | null
}
