import { z } from 'zod'

export const voiceAssetIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const ttsVoiceRepresentationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reference-audio'), assetId: voiceAssetIdSchema,
    transcript: z.string().max(64000).optional(), recordedLanguage: z.string().max(32).optional(),
    durationMs: z.number().nonnegative().optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  z.object({ kind: z.literal('design-recipe'), description: z.string().min(1).max(8000),
    recipe: z.record(z.string(), z.unknown()), recipeSchema: z.string().optional(),
    seed: z.number().int().optional(), authoringModelBinding: z.string().optional(),
    renderedSampleAssetId: voiceAssetIdSchema.optional() }),
  z.object({ kind: z.literal('provider-voice'), providerId: z.string(), voiceId: z.string(),
    bindingId: voiceAssetIdSchema.optional(), modelIds: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional() }),
])
export type TtsVoiceRepresentation = z.infer<typeof ttsVoiceRepresentationSchema>
export const ttsVoiceProfileSchema = z.object({
  schemaVersion: z.literal(1), id: voiceAssetIdSchema, revision: z.number().int().positive(),
  name: z.string().min(1).max(256), kind: z.enum(['clone', 'design', 'imported']),
  defaultLanguage: z.string().max(32).optional(), representations: z.array(ttsVoiceRepresentationSchema),
  primaryReferenceAssetId: voiceAssetIdSchema.optional(), lockedSampleAssetId: voiceAssetIdSchema.optional(),
  portraitAssetId: voiceAssetIdSchema.optional(), tags: z.array(z.string().max(128)).optional(),
  description: z.string().max(8000).optional(),
  consent: z.object({ basis: z.enum(['own-voice', 'speaker-permission', 'unknown']), verified: z.boolean(),
    statement: z.string().optional(), recordingAssetId: voiceAssetIdSchema.optional(), recordedAt: z.string().optional() }).optional(),
  license: z.object({ spdx: z.string().optional(), source: z.string().optional(),
    commercialUse: z.union([z.boolean(), z.literal('unknown')]).optional() }).optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), deletedAt: z.string().datetime().optional(),
})
export type TtsVoiceProfile = z.infer<typeof ttsVoiceProfileSchema>
