import { z } from 'zod'

export const TTS_SCHEMA_VERSION = 1 as const
export const ttsPresetVoiceDescriptorSchema = z.object({
  id: z.string().min(1).max(512), name: z.string().min(1).max(512),
  languages: z.array(z.string().max(32)).optional(), locale: z.string().max(32).optional(),
  gender: z.enum(['female', 'male', 'neutral']).optional(), styles: z.array(z.string()).optional(),
  modelIds: z.array(z.string()).optional(), metadata: z.record(z.string(), z.unknown()).optional(),
})
export type TtsPresetVoiceDescriptor = z.infer<typeof ttsPresetVoiceDescriptorSchema>
const support = z.union([z.boolean(), z.literal('unknown')])
export const ttsModelCapabilitiesSchema = z.object({
  schemaVersion: z.literal(TTS_SCHEMA_VERSION), modelBinding: z.string(),
  providerId: z.string(), modelId: z.string(),
  languages: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('finite'), values: z.array(z.string()) }),
    z.object({ mode: z.literal('multi'), verifiedValues: z.array(z.string()).optional() }), z.object({ mode: z.literal('unknown') }),
  ]),
  languageInputMode: z.enum(['explicit', 'voice-derived', 'auto-detect']),
  presetVoices: z.array(ttsPresetVoiceDescriptorSchema), defaultPresetVoiceId: z.string().optional(),
  supports: z.object({
    cloning: support, voiceDesign: support, voiceConversion: support,
    emotion: z.boolean(), styleInstruction: z.boolean(), seed: z.boolean(),
    speed: z.boolean(), pitch: z.boolean(), volume: z.boolean(),
    pronunciation: z.boolean(), ssml: z.boolean(), streamingInput: z.boolean(), streamingOutput: z.boolean(),
  }),
  instructVocabulary: z.enum(['none', 'tags', 'freeform']), outputFormats: z.array(z.string()),
  sampleRates: z.array(z.number().int().positive()).optional(), renderedDialects: z.array(z.string()).optional(),
  controlLimits: z.partialRecord(z.enum(['speed', 'pitch', 'volume', 'seed']), z.object({
    min: z.number().optional(), max: z.number().optional(), integer: z.boolean().optional(),
  })).optional(),
  maxReferenceSeconds: z.number().positive().optional(),
  referenceStrategy: z.enum(['full', 'head', 'best-window']).optional(),
  reference: z.object({
    mimeTypes: z.array(z.string()), maxBytes: z.number().int().positive().optional(),
    maxEncodedBytes: z.number().int().positive().optional(), minSeconds: z.number().nonnegative().optional(),
    maxSeconds: z.number().positive().optional(), transcriptRequired: z.boolean(),
    acceptsSynthetic: z.boolean(),
  }).optional(),
  conditioning: z.array(z.enum(['engine-default', 'preset', 'reference-audio', 'design', 'provider-voice'])).optional(),
  voiceRegistration: z.object({ create: z.boolean(), inspect: z.boolean(), delete: z.boolean() }).optional(),
  streaming: z.object({ transport: z.enum(['none', 'http', 'sse', 'websocket']),
    audio: z.enum(['incremental', 'completed']), formats: z.array(z.string()) }).optional(),
  revision: z.string().optional(),
  source: z.enum(['static-catalog', 'provider-api', 'runtime-probe', 'user-override']),
})
export type TtsModelCapabilities = z.infer<typeof ttsModelCapabilitiesSchema>
