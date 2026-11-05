import type { SessionConfig } from './contracts'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_PUBLIC_MODEL } from './index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from './google-translate'
import { ALIYUN_ASR_MODELS, DEFAULT_SETTINGS, MINIMAX_RECOGNITION_MODELS, type RecognitionProvider, type RecognitionSettings, type TranslationProvider, type TranslationSettings } from './settings'
import { customModelsOf } from './custom-models'

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
      model: settings.aliyunModel ?? ALIYUN_ASR_MODELS[0],
    } } : provider === 'minimax' ? { recognitionOptions: {
      endpoint: settings.minimaxEndpoint ?? DEFAULT_SETTINGS.recognition.minimaxEndpoint ?? '',
      model: settings.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0],
    } } : {}),
  }
}

export function translationOptionsOf(settings: TranslationSettings): SessionConfig['translationOptions'] {
  switch (settings.provider) {
    case 'cloud': return { endpoint: settings.cloudEndpoint, model: settings.cloudModel, apiFormat: settings.cloudApiFormat, contextWindow: settings.cloudContextWindow, maxOutputTokens: settings.cloudMaxOutputTokens }
    case 'microsoft': return { endpoint: DEFAULT_SETTINGS.translation.microsoftEndpoint }
    case 'mymemory': return { endpoint: settings.mymemoryEndpoint ?? DEFAULT_SETTINGS.translation.mymemoryEndpoint, email: settings.mymemoryEmail ?? '' }
    case 'google': return { endpoint: GOOGLE_TRANSLATE_ENDPOINT }
    case 'index-translate': return { endpoint: INDEX_TRANSLATE_ENDPOINT, model: INDEX_TRANSLATE_PUBLIC_MODEL, apiFormat: 'chat-completions', contextWindow: 32768, maxOutputTokens: 1024 }
    default: return undefined
  }
}

/**
 * Connection fields for one explicit translation provider.
 *
 * `translationOptionsOf` follows whichever provider is currently selected, but the model gateway can
 * hold several providers at once, so a binding has to resolve its own endpoint without reading the
 * selection of another consumer.
 */
export function translationOptionsFor(settings: TranslationSettings, provider: TranslationProvider, customModelId = ''): SessionConfig['translationOptions'] {
  switch (provider) {
    case 'cloud': {
      const profiles = customModelsOf(settings)
      const profile = profiles.find(item => item.id === (customModelId || settings.customModelId || 'legacy')) ?? profiles[0]
      if (!profile) return undefined
      return { endpoint: profile.endpoint, model: profile.model, apiFormat: profile.apiFormat,
        contextWindow: profile.contextWindow, maxOutputTokens: profile.maxOutputTokens }
    }
    case 'microsoft': return { endpoint: DEFAULT_SETTINGS.translation.microsoftEndpoint }
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
    case 'microsoft': return { fallbackTranslationProvider: 'microsoft', fallbackTranslationOptions: { endpoint: DEFAULT_SETTINGS.translation.microsoftEndpoint } }
    case 'mymemory': return { fallbackTranslationProvider: 'mymemory', fallbackTranslationOptions: { endpoint: fallback.mymemoryEndpoint, email: fallback.mymemoryEmail } }
    case 'google': return { fallbackTranslationProvider: 'google', fallbackTranslationOptions: { endpoint: GOOGLE_TRANSLATE_ENDPOINT } }
    case 'index-translate': return { fallbackTranslationProvider: 'index-translate', fallbackTranslationOptions: {
      endpoint: INDEX_TRANSLATE_ENDPOINT, model: INDEX_TRANSLATE_PUBLIC_MODEL, apiFormat: 'chat-completions', contextWindow: 32768, maxOutputTokens: 1024,
    } }
    case 'local': return { fallbackTranslationProvider: 'local' }
  }
}

export function recognitionLabel(settings: RecognitionSettings): string {
  if (settings.provider === 'aliyun') return settings.aliyunModel ?? ALIYUN_ASR_MODELS[0]
  if (settings.provider === 'minimax') return settings.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]
  return settings.modelId
}

// Text output languages from https://help.aliyun.com/zh/model-studio/qwen3-5-livetranslate-flash-realtime.
// App codes tl/no are normalized to the provider's fil/nb by the recognizer.
export const ALIYUN_LANGUAGES = ['zh', 'en', 'ar', 'de', 'fr', 'es', 'pt', 'id', 'it', 'ko', 'ru', 'th', 'vi', 'ja', 'tr', 'hi', 'ms', 'nl', 'ur', 'no', 'sv', 'da', 'he', 'fi', 'pl', 'is', 'cs', 'tl', 'fa', 'yue', 'el', 'af', 'ast', 'be', 'bg', 'bn', 'bs', 'ca', 'ceb', 'et', 'gl', 'gu', 'hr', 'hu', 'jv', 'kk', 'kn', 'ky', 'lv', 'mk', 'ml', 'mr', 'pa', 'ro', 'sk', 'sl', 'sw', 'tg', 'az', 'uk'] as const
export const ALIYUN_S2S_SPEECH_LANGUAGES: readonly string[] = 'zh en ar de fr es pt id it ko ru th vi ja tr hi ms nl ur no sv da he fi pl is cs tl fa'.split(' ')

// The `language` hint on https://platform.minimax.io/docs/api-reference/speech-to-text accepts only
// these 20 BCP-47 tags, and it is the whole list rather than a floor — unlike the 62 Aliyun accepts.
// App code tl is normalized to the provider's fil by the recognizer, as it is for Aliyun.
export const MINIMAX_LANGUAGES = ['zh', 'yue', 'en', 'fr', 'de', 'es', 'it', 'pt', 'pl', 'ru', 'uk', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'tl', 'ar', 'tr'] as const

/**
 * Whether the recognition provider can return a translation alongside the transcript.
 *
 * Only the two Aliyun LiveTranslate models answer with a native translation; Aliyun's dedicated
 * ASR models and MiniMax return recognized text only.
 */
export function supportsRecognitionNativeTranslation(settings: RecognitionSettings | RecognitionProvider | undefined): boolean {
  if (typeof settings === 'string' || settings === undefined) return settings === 'aliyun'
  return settings.provider === 'aliyun' &&
    (settings.aliyunModel === 'qwen3.8-livetranslate-flash-realtime' || settings.aliyunModel === 'qwen3.5-livetranslate-flash-realtime')
}

// Committed-only providers must never receive text that can still be revised.
export function supportsIntermediateTranslation(provider: TranslationProvider): boolean {
  return provider !== 'google' && provider !== 'microsoft' && provider !== 'mymemory' && provider !== 'recognition'
}

export function remoteSourceLanguages(settings: RecognitionSettings): readonly string[] {
  const provider = settings.provider ?? 'local'
  if (provider === 'minimax') return ['auto', ...MINIMAX_LANGUAGES]
  if (provider !== 'aliyun') return ['auto']
  return settings.aliyunModel === 'qwen3.5-livetranslate-flash-realtime' ? ['auto', ...ALIYUN_LANGUAGES] : ['auto']
}
