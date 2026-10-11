import type { SessionConfig } from './contracts'
import { DEFAULT_SETTINGS, MINIMAX_RECOGNITION_MODELS, type RecognitionProvider, type RecognitionSettings, type TranslationSettings } from './settings'

/** Connection options are public configuration; credentials are injected only by the main process. */
export function recognitionFieldsOf(settings: RecognitionSettings): Pick<SessionConfig, 'recognitionProvider' | 'recognitionOptions'> {
  const provider = settings.provider ?? 'local'
  return {
    recognitionProvider: provider,
    ...(provider === 'aliyun' ? { recognitionOptions: {
      workspaceId: settings.aliyunWorkspaceId ?? '',
      region: settings.aliyunRegion ?? 'cn-beijing',
      model: settings.aliyunModel ?? 'qwen3.8-livetranslate-flash-realtime',
    } } : provider === 'minimax' ? { recognitionOptions: {
      endpoint: settings.minimaxEndpoint ?? DEFAULT_SETTINGS.recognition.minimaxEndpoint ?? '',
      model: settings.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0],
    } } : {}),
  }
}

export function translationOptionsOf(settings: TranslationSettings): SessionConfig['translationOptions'] {
  switch (settings.provider) {
    case 'cloud': return { endpoint: settings.cloudEndpoint, model: settings.cloudModel, apiFormat: settings.cloudApiFormat, contextWindow: settings.cloudContextWindow, maxOutputTokens: settings.cloudMaxOutputTokens }
    case 'microsoft': return { endpoint: settings.microsoftEndpoint, region: settings.microsoftRegion }
    case 'mymemory': return { endpoint: settings.mymemoryEndpoint ?? DEFAULT_SETTINGS.translation.mymemoryEndpoint, email: settings.mymemoryEmail ?? '' }
    default: return undefined
  }
}

export function recognitionLabel(settings: RecognitionSettings): string {
  if (settings.provider === 'aliyun') return settings.aliyunModel ?? 'qwen3.8-livetranslate-flash-realtime'
  if (settings.provider === 'minimax') return settings.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]
  return settings.modelId
}

// Text output languages from https://help.aliyun.com/zh/model-studio/qwen3-5-livetranslate-flash-realtime.
// App codes tl/no are normalized to the provider's fil/nb by the recognizer.
export const ALIYUN_LANGUAGES = ['zh', 'en', 'ar', 'de', 'fr', 'es', 'pt', 'id', 'it', 'ko', 'ru', 'th', 'vi', 'ja', 'tr', 'hi', 'ms', 'nl', 'ur', 'no', 'sv', 'da', 'he', 'fi', 'pl', 'is', 'cs', 'tl', 'fa', 'yue', 'el', 'af', 'ast', 'be', 'bg', 'bn', 'bs', 'ca', 'ceb', 'et', 'gl', 'gu', 'hr', 'hu', 'jv', 'kk', 'kn', 'ky', 'lv', 'mk', 'ml', 'mr', 'pa', 'ro', 'sk', 'sl', 'sw', 'tg', 'az', 'uk'] as const

// The `language` hint on https://platform.minimax.io/docs/api-reference/speech-to-text accepts only
// these 20 BCP-47 tags, and it is the whole list rather than a floor — unlike the 62 Aliyun accepts.
// App code tl is normalized to the provider's fil by the recognizer, as it is for Aliyun.
export const MINIMAX_LANGUAGES = ['zh', 'yue', 'en', 'fr', 'de', 'es', 'it', 'pt', 'pl', 'ru', 'uk', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'tl', 'ar', 'tr'] as const

/**
 * Whether the recognition provider can return a translation alongside the transcript.
 *
 * Only Aliyun LiveTranslate answers with one, so `translationProvider: 'recognition'` is valid
 * there alone; MiniMax's endpoint takes an audio file and returns text only, and asking it for a
 * translation is a configuration the API cannot express.
 */
export function supportsRecognitionNativeTranslation(provider: RecognitionProvider | undefined): boolean {
  return provider === 'aliyun'
}

export function remoteSourceLanguages(settings: RecognitionSettings): readonly string[] {
  const provider = settings.provider ?? 'local'
  if (provider === 'minimax') return ['auto', ...MINIMAX_LANGUAGES]
  if (provider !== 'aliyun') return ['auto']
  return settings.aliyunModel === 'qwen3.5-livetranslate-flash-realtime' ? ['auto', ...ALIYUN_LANGUAGES] : ['auto']
}