import { z } from 'zod'
import { ttsVoiceRefSchema } from './voice-ref'
import { voiceAssetIdSchema } from './voice-profile'

export const ttsOperationSchema = z.enum(['SYNTHESIZE', 'SYNTHESIZE_STREAM', 'CONVERT_VOICE', 'DESIGN_VOICE', 'INSPECT_VOICES'])
export type TtsOperation = z.infer<typeof ttsOperationSchema>
export const ttsControlsSchema = z.object({
  speed: z.number().positive().optional(), pitch: z.number().optional(), volume: z.number().nonnegative().optional(),
  emotion: z.string().max(128).optional(), emotionStrength: z.number().min(0).max(1).optional(),
  instruct: z.string().max(8000).optional(), seed: z.number().int().optional(),
}).strict()
export const ttsOutputSchema = z.object({ format: z.enum(['wav', 'mp3', 'pcm']).optional(),
  sampleRate: z.number().int().positive().optional() }).strict()
export const ttsSynthesisRequestSchema = z.object({
  schemaVersion: z.literal(1), requestId: z.string().uuid(), modelBinding: z.string().min(1).max(512),
  voiceRef: ttsVoiceRefSchema, text: z.string().min(1).max(64000), targetLanguage: z.string().min(1).max(32),
  controls: ttsControlsSchema.optional(), output: ttsOutputSchema.optional(),
  pronunciation: z.object({ dictionaryId: z.string(), revision: z.number().int().positive() }).optional(),
  fallbackVoiceRef: ttsVoiceRefSchema.optional(),
}).strict()
export type TtsSynthesisRequest = z.infer<typeof ttsSynthesisRequestSchema>
export const resolvedVoiceConditioningSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('engine-default') }).strict(),
  z.object({ kind: z.literal('preset'), voiceId: z.string().min(1).max(512) }).strict(),
  z.object({ kind: z.literal('reference-audio'), assetId: voiceAssetIdSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    transcript: z.string().optional(), recordedLanguage: z.string().optional(),
    purpose: z.enum(['human-reference', 'designed-sample']) }).strict(),
  z.object({ kind: z.literal('design'), description: z.string().min(1).max(8000), recipe: z.record(z.string(), z.unknown()),
    recipeSchema: z.string(), authoringModelBinding: z.string(), seed: z.number().int().optional() }).strict(),
  z.object({ kind: z.literal('provider-voice'), bindingId: z.string(), bindingRevision: z.number().int().positive(),
    voiceId: z.string().min(1).max(512), scopeId: z.string() }).strict(),
])
export type ResolvedVoiceConditioning = z.infer<typeof resolvedVoiceConditioningSchema>
export interface ResolvedTtsRequest extends TtsSynthesisRequest {
  conditioning: ResolvedVoiceConditioning;
  modelId: string;
  providerId: string;
  capabilityRevision: string;
  profileId?: string;
  profileRevision?: number;
  voiceEpoch?: number;
}
export interface TtsAudioResult {
  audio: string;
  mime: string;
  sampleRate?: number;
  outputAssetId?: string;
}
