import type { SessionConfig } from './contracts'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_PUBLIC_MODEL } from './index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from './google-translate'
import { DEFAULT_SETTINGS, MINIMAX_RECOGNITION_MODELS, type RecognitionProvider, type RecognitionSettings, type TranslationProvider, type TranslationSettings } from './settings'

/** Connection options are public configuration; credentials are injected only by the main process. */
export function recognitionFieldsOf(settings: RecognitionSettings): Pick<SessionConfig, 'recognitionProvider' | 'recognitionOptions' | 'max_segment_ms' | 'silence_end_ms'> {
  const provider = settings.provider ?? 'local'
  return {
    recognitionProvider: provider,
    max_segment_ms: settings.max_segment_ms ?? 10000,
    silence_end_ms: settings.silence_end_ms ?? 800,
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
    case 'google': return { endpoint: GOOGLE_TRANSLATE_ENDPOINT }
    case 'index-translate': return { endpoint: INDEX_TRANSLATE_ENDPOINT, model: INDEX_TRANSLATE_PUBLIC_MODEL, apiFormat: 'chat-completions', contextWindow: 32768, maxOutputTokens: 1024 }
    default: return undefined
  }
}

/** Resolves an independently configured backup provider without exposing its credential slot. */
export function fallbackTranslationFieldsOf(settings: TranslationSettings): Partial<Pick<SessionConfig, 'fallbackTranslationProvider' | 'fallbackTranslationOptions'>> {
  const fallback = settings.fallback
  if (!fallback || fallback.provider === 'disabled') return {}
  switch (fallback.provider) {
    case 'cloud': return { fallbackTranslationProvider: 'cloud', fallbackTranslationOptions: {
      endpoint: fallback.cloudEndpoint, model: fallback.cloudModel, apiFormat: fallback.cloudApiFormat,
      contextWindow: fallback.cloudContextWindow, maxOutputTokens: fallback.cloudMaxOutputTokens,
    } }
    case 'microsoft': return { fallbackTranslationProvider: 'microsoft', fallbackTranslationOptions: { endpoint: fallback.microsoftEndpoint, region: fallback.microsoftRegion } }
    case 'mymemory': return { fallbackTranslationProvider: 'mymemory', fallbackTranslationOptions: { endpoint: fallback.mymemoryEndpoint, email: fallback.mymemoryEmail } }
    case 'google': return { fallbackTranslationProvider: 'google', fallbackTranslationOptions: { endpoint: GOOGLE_TRANSLATE_ENDPOINT } }
    case 'index-translate': return { fallbackTranslationProvider: 'index-translate', fallbackTranslationOptions: {
      endpoint: INDEX_TRANSLATE_ENDPOINT, model: INDEX_TRANSLATE_PUBLIC_MODEL, apiFormat: 'chat-completions', contextWindow: 32768, maxOutputTokens: 1024,
    } }
    case 'local': return { fallbackTranslationProvider: 'local' }
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

/**
 * Whether a translation provider can accept source text that is still settling.
 *
 * `mymemory` spends a slice of a shared free quota per request and every revision replaces the
 * previous one, so translating a superseded intermediate produces nothing. `recognition` takes
 * its translation from the Aliyun recognition socket rather than from this path, so a preference
 * about intermediate text carries no meaning there. `microsoft` answers one request with a whole
 * sentence instead of streaming tokens, which does not exclude it: what decides the answer is
 * the text a provider accepts as input, not the shape of what it sends back.
 */
export function supportsIntermediateTranslation(provider: TranslationProvider): boolean {
  return provider !== 'mymemory' && provider !== 'recognition'
}

export function remoteSourceLanguages(settings: RecognitionSettings): readonly string[] {
  const provider = settings.provider ?? 'local'
  if (provider === 'minimax') return ['auto', ...MINIMAX_LANGUAGES]
  if (provider !== 'aliyun') return ['auto']
  return settings.aliyunModel === 'qwen3.5-livetranslate-flash-realtime' ? ['auto', ...ALIYUN_LANGUAGES] : ['auto']
}
