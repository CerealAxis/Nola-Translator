import { z } from 'zod'

/**
 * The runtime half of the settings contract.
 *
 * `AppSettingsPatch` in `shared/settings.ts` is the TypeScript half; nothing makes the two
 * agree automatically, and the nested objects below strip unknown keys rather than rejecting
 * them, so a field added to the type but forgotten here is dropped in silence — the setting
 * simply never persists. `settings-schema.test.ts` asserts the two stay in sync.
 */
export const settingsPatchSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  uiLanguage: z.enum(['zh-CN', 'en']).optional(),
  recognition: z.object({
    modelId: z.enum(['qwen3-asr-1.7b-hf', 'qwen3-asr-0.6b-hf', 'sensevoice-small']).optional(),
    sourceLanguage: z.string().min(1).max(32).optional(),
    audioSource: z.string().min(1).max(128).optional(),
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
    hymt2ModelId: z.enum(['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m']).optional(),
    microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
    openaiEndpoint: z.string().min(1).max(2048).optional(), openaiModel: z.string().min(1).max(256).optional(),
    ollamaEndpoint: z.string().min(1).max(2048).optional(), ollamaModel: z.string().min(1).max(256).optional(),
    translateIntermediate: z.boolean().optional(),
    targetLanguage: z.string().min(1).max(32).optional(),
  }).partial().optional(),
}).strict()
