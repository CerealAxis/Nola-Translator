import { z } from 'zod'
import { computeSettingsPatchSchema } from '../shared/compute'

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

/**
 * 本地翻译模型 id：Hy-MT2 的三个量化档 + 合并进来的 M2M100，或 `hub:` 前缀的自装 id。
 *
 * 闭集而不是裸字符串，和 `recognitionModelIdSchema` 同理 —— 一个已经卸载的 id 在这里就响，
 * 错误消息说的是设置项本身，而不是几分钟后引擎报的一句「模型不可用」。
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
  translation: z.object({
    provider: z.enum(['local', 'cloud', 'microsoft']).optional(),
    localModelId: localModelIdSchema.optional(),
    microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
    // `.min(1)` is deliberately dropped on the two cloud fields. With it, a user who clears the
    // box (to switch to Ollama, or to re-type a base URL from scratch) gets a write that throws
    // and bubbles up as a failed save — the setting then looks like it refuses to be cleared.
    // An empty endpoint/model is a legitimate state here: the request is rejected at the engine
    // with a message about the missing endpoint, which is more accurate than a schema error.
    cloudEndpoint: z.string().max(2048).optional(), cloudModel: z.string().max(256).optional(),
    cloudApiFormat: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'ollama']).optional(),
    cloudName: z.string().max(64).optional(),
    // Bounds are what keeps a typo'd 0 (or a pasted 1e9) from turning into a divide-by-zero or a
    // runaway request body; the defaults sit comfortably inside them.
    cloudContextWindow: z.number().int().min(256).max(10_000_000).optional(),
    cloudMaxOutputTokens: z.number().int().min(1).max(10_000_000).optional(),
    translateIntermediate: z.boolean().optional(),
    targetLanguage: z.string().min(1).max(32).optional(),
  }).partial().optional(),
}).strict()
