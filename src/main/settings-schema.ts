import { z } from 'zod'
import { computeSettingsPatchSchema } from '../shared/compute'

/**
 * The runtime half of the settings contract.
 *
 * Nothing makes this schema and `AppSettingsPatch` in `shared/settings.ts` agree automatically,
 * and the nested objects strip unknown keys rather than rejecting them, so a field added to the
 * type but missing here is dropped in silence and the setting never persists.
 * `tests/unit/main/settings-schema.test.ts` asserts the two stay in sync.
 */

/**
 * A model id is one of the shipped ones, or a `hub:<owner>/<name>` id for a model the user
 * installed from Hugging Face.
 *
 * The union rather than a bare string, so an id for a model that is gone fails here, naming the
 * setting, instead of being persisted and failing much later at session start.
 */
const hubModelId = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.startsWith('hub:'), '只有 hub: 前缀的自装模型 id 才被接受')

const recognitionModelIdSchema = z.union([
  z.enum(['qwen3-asr-1.7b-hf', 'qwen3-asr-0.6b-hf', 'sensevoice-small']),
  hubModelId,
])

/**
 * Local translation model ids: the Hy-MT2 quantisations, the folded-in M2M100, or a `hub:` id.
 * A closed union for the same reason as `recognitionModelIdSchema`.
 */
const localModelIdSchema = z.union([
  z.enum(['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m', 'm2m100-418m']),
  hubModelId,
])

export const settingsPatchSchema = z.object({
  compute: computeSettingsPatchSchema.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  uiLanguage: z.enum(['zh-CN', 'en']).optional(),
  recognition: z.object({
    modelId: recognitionModelIdSchema.optional(),
    sourceLanguage: z.string().min(1).max(32).optional(),
    audioSource: z.string().min(1).max(128).optional(),
  }).partial().optional(),
  recording: z.object({
    keepAudio: z.boolean().optional(),
  }).partial().optional(),
  appearance: z.object({
    reduceMotion: z.boolean().optional(),
  }).partial().optional(),
  overlay: z.object({
    mode: z.enum(['free', 'top', 'bottom']).optional(), locked: z.boolean().optional(),
    colorScheme: z.enum(['dark', 'light']).optional(),
    alwaysOnTop: z.boolean().optional(), fontFamily: z.string().max(128).optional(),
    fontSize: z.number().min(14).max(72).optional(), fontWeight: z.number().min(300).max(800).optional(),
    translationFontSize: z.number().min(12).max(72).optional(), translationFontWeight: z.number().min(300).max(800).optional(),
    sourceColor: z.string().max(32).optional(), translationColor: z.string().max(32).optional(), backgroundColor: z.string().max(32).optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(),
    lineHeight: z.number().min(1).max(2).optional(),
    translationLineHeight: z.number().min(1).max(2).optional(), showSource: z.boolean().optional(), showTranslation: z.boolean().optional(),
    layout: z.enum(['rolling', 'sentence']).optional(),
  }).partial().optional(),
  videoCaptions: z.object({
    showSource: z.boolean().optional(),
    showTranslation: z.boolean().optional(),
    layout: z.literal('sentence').optional(),
    fontSize: z.number().int().min(12).max(72).optional(),
    position: z.number().min(0).max(100).optional(),
    audioSource: z.enum(['tab', 'system']).optional(),
    audioDeviceId: z.string().min(1).max(512).optional(),
  }).partial().optional(),
  translation: z.object({
    provider: z.enum(['local', 'cloud', 'microsoft']).optional(),
    localModelId: localModelIdSchema.optional(),
    microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
    cloudEndpoint: z.string().max(2048).optional(), cloudModel: z.string().max(256).optional(),
    cloudApiFormat: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'ollama']).optional(),
    cloudName: z.string().max(64).optional(),
    // Bounds mirror `protocol.py`'s `contextWindow` and `maxOutputTokens`; the 10M ceiling is a
    // fat-finger guard, set to agree with the TypeScript schema rather than to a model's window.
    cloudContextWindow: z.number().int().min(256).max(10_000_000).optional(),
    cloudMaxOutputTokens: z.number().int().min(1).max(10_000_000).optional(),
    translateIntermediate: z.boolean().optional(),
    targetLanguage: z.string().min(1).max(32).optional(),
  }).partial().optional(),
}).strict()
