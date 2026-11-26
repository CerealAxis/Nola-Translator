import { z } from 'zod'

const id = z.string().min(1).max(512)
export const ttsVoiceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('engine-default') }).strict(),
  z.object({ kind: z.literal('preset'), modelBinding: id, voiceId: id }).strict(),
  z.object({ kind: z.literal('profile'), profileId: id,
    revision: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal('session-speaker'), sessionId: id, speakerId: id }).strict(),
])
export type TtsVoiceRef = z.infer<typeof ttsVoiceRefSchema>

export function normalizeVoiceRef(raw: unknown): TtsVoiceRef {
  return ttsVoiceRefSchema.parse(raw)
}

export function voiceRefKey(ref: TtsVoiceRef): string {
  return 'tts:v1:' + encodeURIComponent(JSON.stringify(normalizeVoiceRef(ref)))
}

export function parseVoiceRefKey(value: string): TtsVoiceRef {
  if (!value.startsWith('tts:v1:')) throw new Error('Unsupported voice reference key')
  return normalizeVoiceRef(JSON.parse(decodeURIComponent(value.slice(7))))
}
