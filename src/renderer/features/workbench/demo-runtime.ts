export type ModelKind = 'llm' | 'asr' | 'mt' | 'tts'
export interface PlaygroundConfig {
  model: string
  kind: ModelKind
  effort: string
  source: string
  target: string
  voice: string
  images?: boolean
  projectId?: string | null
}
