import { z } from 'zod'

/**
 * The runtime half of the settings contract.
 *
 * `AppSettingsPatch` in `shared/settings.ts` is the TypeScript half; nothing makes the two
 * agree automatically, and the nested objects below strip unknown keys rather than rejecting
 * them, so a field added to the type but forgotten here is dropped in silence — the setting
 * simply never persists. `settings-schema.test.ts` asserts the two stay in sync.
 */

/**
 * A model id is one of the shipped ones, or a `hub:<owner>/<name>` id for a model the user
 * installed from Hugging Face.
 *
 * The union rather than a bare string, so a stale id (a removed model) still fails here instead
 * of being persisted and only failing much later at session start, where the message would be
 * about the engine rather than about the setting.
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

const hymt2ModelIdSchema = z.union([
  z.enum(['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m']),
  hubModelId,
])

export const settingsPatchSchema = z.object({
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
  translation: z.object({
    provider: z.enum(['hymt2', 'm2m100', 'microsoft', 'openai', 'ollama']).optional(),
    hymt2ModelId: hymt2ModelIdSchema.optional(),
    microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
    openaiEndpoint: z.string().min(1).max(2048).optional(), openaiModel: z.string().min(1).max(256).optional(),
    ollamaEndpoint: z.string().min(1).max(2048).optional(), ollamaModel: z.string().min(1).max(256).optional(),
    translateIntermediate: z.boolean().optional(),
    targetLanguage: z.string().min(1).max(32).optional(),
  }).partial().optional(),
}).strict()
