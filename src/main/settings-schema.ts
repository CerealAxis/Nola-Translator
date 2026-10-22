import { z } from 'zod'
import { PYPI_MIRROR_NODES, PYTORCH_WHEEL_MIRROR_NODES } from '../shared/pypi-mirrors'
import { INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../shared/index-translate'
import { computeSettingsPatchSchema } from '../shared/compute'
import { RECOGNITION_MODEL_IDS } from '../shared/settings'

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
  z.enum(RECOGNITION_MODEL_IDS),
  hubModelId,
])

/**
 * Local translation model ids: the Hy-MT2 quantisations, the folded-in M2M100, or a `hub:` id.
 * A closed union for the same reason as `recognitionModelIdSchema`.
 */
const localModelIdSchema = z.union([
  z.enum(['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m', 'hy-mt2-7b-q4-k-m', 'm2m100-418m', ...INDEX_TRANSLATE_MODEL_IDS, ...INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS]),
  hubModelId,
])

export const settingsPatchSchema = z.object({
  onboardingSeen: z.boolean().optional(),
  compute: computeSettingsPatchSchema.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  uiLanguage: z.enum(['auto', 'zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja', 'en']).optional(),
  network: z.object({
    useHuggingFaceMirror: z.boolean().optional(),
    usePypiMirror: z.boolean().optional(),
    pypiMirrorUrl: z.enum(PYPI_MIRROR_NODES).optional(),
    pytorchWheelMirrorUrl: z.enum(PYTORCH_WHEEL_MIRROR_NODES).optional(),
    useGithubAccelerate: z.boolean().optional(),
    // A node from the picker catalog or its `auto` sentinel; the catalog is not enforced here, so the
    // bound is what keeps a hand-built request from riding an oversized value onto every engine call.
    githubAccelerateUrl: z.string().max(2048).optional(),
    proxyUrl: z.string().max(2048).optional(),
    proxyForPip: z.boolean().optional(),
    proxyForModelDownload: z.boolean().optional(),
    proxyForRuntimeDownload: z.boolean().optional(),
  }).partial().optional(),
  recognition: z.object({
    max_segment_ms: z.number().int().min(3000).max(30000).optional(),
    silence_end_ms: z.number().int().min(300).max(2000).optional(),
    provider: z.enum(['local', 'aliyun', 'minimax']).optional(),
    aliyunWorkspaceId: z.string().max(128).optional(),
    aliyunRegion: z.enum(['cn-beijing', 'ap-southeast-1']).optional(),
    aliyunModel: z.enum(['qwen3.8-livetranslate-flash-realtime', 'qwen3.5-livetranslate-flash-realtime', 'qwen3-asr-flash-realtime', 'fun-asr-realtime', 'qwen-audio-3.1-asr-flash-streaming']).optional(),
    // `api.minimax.cn` and `api.minimax.io` serve different accounts, so the address is stored
    // rather than fixed; the bound only keeps a hand-built request from riding it to the engine.
    minimaxEndpoint: z.string().max(2048).optional(),
    minimaxModel: z.enum(['asr-1.0']).optional(),
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
    mode: z.enum(['free', 'top', 'bottom']).optional(),
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
  browserCaptions: z.object({
    showSource: z.boolean().optional(),
    showTranslation: z.boolean().optional(),
    colorScheme: z.enum(['dark', 'light']).optional(),
    fontFamily: z.string().min(1).max(128).optional(),
    sourceFontSize: z.number().int().min(10).max(72).optional(),
    translationFontSize: z.number().int().min(10).max(72).optional(),
    lineHeight: z.number().min(1).max(2.5).optional(),
    sourceColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    translationColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(),
    bottomOffset: z.number().min(0).max(30).optional(),
  }).partial().optional(),
  translation: z.object({
    provider: z.enum(['local', 'cloud', 'microsoft', 'mymemory', 'google', 'index-translate', 'recognition']).optional(),
    mymemoryEndpoint: z.string().max(2048).optional(),
    mymemoryEmail: z.string().max(320).optional(),
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
    fallback: z.object({
      provider: z.enum(['disabled', 'local', 'cloud', 'microsoft', 'mymemory', 'google', 'index-translate']).optional(),
      cloudEndpoint: z.string().max(2048).optional(), cloudModel: z.string().max(256).optional(),
      cloudApiFormat: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'ollama']).optional(),
      cloudContextWindow: z.number().int().min(256).max(10_000_000).optional(),
      cloudMaxOutputTokens: z.number().int().min(1).max(10_000_000).optional(),
      microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
      mymemoryEndpoint: z.string().max(2048).optional(), mymemoryEmail: z.string().max(320).optional(),
    }).partial().optional(),
  }).partial().optional(),
}).strict()
