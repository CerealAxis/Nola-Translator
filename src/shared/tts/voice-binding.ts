import { z } from 'zod'
import { voiceAssetIdSchema } from './voice-profile'

export const voiceBindingSchema = z.object({
  schemaVersion: z.literal(1), id: voiceAssetIdSchema, revision: z.number().int().positive(),
  profileId: voiceAssetIdSchema, profileRevision: z.number().int().positive(),
  providerId: z.string(), connectionId: z.string(), accountScope: z.string(),
  workspace: z.string().optional(), region: z.string(), endpoint: z.string(), apiFamily: z.string(),
  voiceId: z.string().optional(), modelIds: z.array(z.string()), languages: z.array(z.string()).optional(),
  creationKind: z.enum(['clone', 'design', 'imported']).optional(),
  status: z.enum(['not-created', 'creating', 'processing', 'ready', 'failed', 'expired', 'revoked',
    'remote-missing', 'deleting', 'deleted']),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime().optional(),
  activationDeadline: z.string().datetime().optional(), lastVerifiedAt: z.string().datetime().optional(),
  activatedAt: z.string().datetime().optional(),
  sourceAssetHashes: z.array(z.string()),
})
export type TtsVoiceBinding = z.infer<typeof voiceBindingSchema>
