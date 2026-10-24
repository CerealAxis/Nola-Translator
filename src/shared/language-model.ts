import { z } from 'zod'

export const languageModelStreamRequestSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  effort: z.enum(['auto', 'low', 'medium', 'high']).default('auto'),
  projectId: z.string().uuid().nullable().optional(),
  body: z.object({ messages: z.array(z.unknown()).min(1).max(200) }).passthrough(),
})
export type LanguageModelStreamRequest = z.input<typeof languageModelStreamRequestSchema>
export interface LanguageModelStreamEvent { id: string; chunk: string; done?: boolean }
