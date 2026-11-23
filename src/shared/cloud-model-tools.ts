import { z } from 'zod'

const sourceId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
export const cloudModelListRequestSchema = z.object({
  sourceId,
  service: z.string().max(64),
  endpoint: z.string().max(2048),
  protocol: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'google-native', 'azure-openai', 'ollama']),
  key: z.string().max(4096),
}).strict()

export type CloudModelListRequest = z.input<typeof cloudModelListRequestSchema>
export interface RemoteChatModel {
  id: string
  name?: string
  contextWindow?: number
  maxOutputTokens?: number
}

export const cloudModelProbeRequestSchema = z.object({
  capability: z.enum(['LLM', 'ASR', 'MT', 'TTS', 'S2S']),
  binding: z.string().min(1).max(512),
  audio: z.string().startsWith('data:audio/wav;base64,').max(1024 * 1024).optional(),
  text: z.string().trim().min(1).max(1000).optional(),
}).strict()
export type CloudModelProbeRequest = z.input<typeof cloudModelProbeRequestSchema>
