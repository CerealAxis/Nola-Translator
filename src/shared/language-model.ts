import { z } from 'zod'

export const languageModelStreamRequestSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  effort: z.enum(['auto', 'low', 'medium', 'high']).default('auto'),
  projectId: z.string().uuid().nullable().optional(),
  body: z.object({ messages: z.array(z.unknown()).min(1).max(200) }).passthrough(),
})
export type LanguageModelStreamRequest = z.input<typeof languageModelStreamRequestSchema>
export const languageModelAudioResultSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.string().uuid(), ok: z.literal(true), audio: z.string().startsWith('data:audio/wav;base64,') }),
  z.object({ id: z.string().uuid(), ok: z.literal(false), error: z.string().max(2000) }),
])
export type LanguageModelAudioResult = z.infer<typeof languageModelAudioResultSchema>
export interface LanguageModelStreamEvent {
  id: string
  chunk: string
  done?: boolean
  audioPreparation?: { id: string; url: string; mimeType: string }
}
