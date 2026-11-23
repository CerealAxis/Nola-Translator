import { z } from 'zod'

// Agent instructions and tool schemas need their own budget, separate from translation context.
export const LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE = 32768
export const LOCAL_LANGUAGE_MODEL_MIN_CONTEXT_SIZE = 512
export const LOCAL_REASONING_LEVELS = ['disabled', 'enabled'] as const
export const localChatSettingsSchema = z.object({
  contextWindow: z.number().int().min(LOCAL_LANGUAGE_MODEL_MIN_CONTEXT_SIZE).max(LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE),
  maxOutputTokens: z.number().int().min(1),
  reasoningLevels: z.array(z.enum(LOCAL_REASONING_LEVELS)).min(1).max(2),
}).strict().refine(value => value.maxOutputTokens <= value.contextWindow
  && new Set(value.reasoningLevels).size === value.reasoningLevels.length)

export function localChatSettingsOf(workspace: { localChat?: Record<string, LocalChatSettings> } | undefined, resourceId: string): LocalChatSettings {
  return workspace?.localChat?.[resourceId] ?? {
    contextWindow: LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE,
    maxOutputTokens: 4096,
    reasoningLevels: [...LOCAL_REASONING_LEVELS],
  }
}

export type LocalChatSettings = z.infer<typeof localChatSettingsSchema>

export const languageModelStreamRequestSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().regex(/^[a-zA-Z0-9_.-]{1,256}$/),
  source: z.enum(['custom', 'local']).default('custom'),
  effort: z.enum(['auto', 'low', 'medium', 'high', ...LOCAL_REASONING_LEVELS]).default('auto'),
  projectId: z.string().uuid().nullable().optional(),
  comicProjectId: z.string().uuid().nullable().optional(),
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
