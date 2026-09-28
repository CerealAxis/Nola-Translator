export type OverlaySettings = {
  mode: 'free' | 'top' | 'bottom'
  colorScheme: 'dark' | 'light'
  locked: boolean
  alwaysOnTop: boolean
  fontFamily: string
  fontSize: number
  fontWeight: number
  translationFontSize: number
  translationFontWeight: number
  sourceColor: string
  translationColor: string
  backgroundColor: string
  backgroundOpacity: number
  maxLines: number
  lineHeight: number
  translationMaxLines: number
  translationLineHeight: number
  showSource: boolean
  showTranslation: boolean
}

export type AppSettings = {
  version: 1
  theme: 'system' | 'light' | 'dark'
  uiLanguage: 'zh-CN' | 'en'
  modelStoragePath: string
  historyEnabled: boolean
  recognition: RecognitionSettings
  overlay: OverlaySettings
  translation: TranslationSettings
}

export type RecognitionModelId = 'qwen3-asr-1.7b-hf' | 'qwen3-asr-0.6b-hf' | 'sensevoice-small'

export type RecognitionSettings = {
  modelId: RecognitionModelId
  sourceLanguage: string
}

export type TranslationSettings = {
  provider: 'hymt2' | 'm2m100' | 'microsoft' | 'openai' | 'ollama'
  microsoftEndpoint: string
  microsoftRegion: string
  openaiEndpoint: string
  openaiModel: string
  ollamaEndpoint: string
  ollamaModel: string
  translateIntermediate: boolean
  targetLanguage: string
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'overlay' | 'translation' | 'modelStoragePath' | 'version'> & {
  recognition?: Partial<RecognitionSettings>
  overlay?: Partial<OverlaySettings>
  translation?: Partial<TranslationSettings>
}

export const RECOGNITION_MODEL_IDS: readonly RecognitionModelId[] = ['qwen3-asr-1.7b-hf', 'qwen3-asr-0.6b-hf', 'sensevoice-small']

export const RECOGNITION_MODEL_LABELS: Record<RecognitionModelId, string> = {
  'qwen3-asr-1.7b-hf': 'Qwen3-ASR 1.7B',
  'qwen3-asr-0.6b-hf': 'Qwen3-ASR 0.6B',
  'sensevoice-small': 'SenseVoiceSmall',
}

export const TRANSLATION_PROVIDERS: readonly TranslationSettings['provider'][] = ['hymt2', 'm2m100', 'microsoft', 'openai', 'ollama']

/** 源语言下拉项：`auto` 表示交给模型自判。与引擎 resources.py 的 languages 清单保持一致。 */
export const SOURCE_LANGUAGE_OPTIONS = ['auto', 'zh', 'yue', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'th', 'vi', 'tr', 'id'] as const

/** 目标语言下拉项。应用每次只传一种，引擎协议本身仍接受列表。 */
export const TARGET_LANGUAGE_OPTIONS = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'tr', 'ar', 'th', 'vi', 'ms', 'id'] as const

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  uiLanguage: 'zh-CN',
  modelStoragePath: '',
  historyEnabled: false,
  recognition: {
    modelId: 'qwen3-asr-1.7b-hf',
    sourceLanguage: 'auto',
  },
  overlay: {
    mode: 'bottom',
    colorScheme: 'dark',
    locked: false,
    alwaysOnTop: true,
    fontFamily: 'Segoe UI Variable',
    fontSize: 17,
    fontWeight: 500,
    translationFontSize: 16,
    translationFontWeight: 400,
    sourceColor: '#F7F7F7',
    translationColor: '#BFC2C8',
    backgroundColor: '#0D0E10',
    backgroundOpacity: 0.96,
    maxLines: 2,
    lineHeight: 1.3,
    translationMaxLines: 2,
    translationLineHeight: 1.35,
    showSource: true,
    showTranslation: true,
  },
  translation: {
    provider: 'hymt2',
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com',
    microsoftRegion: '',
    openaiEndpoint: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4.1-mini',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    ollamaModel: 'qwen3:4b',
    translateIntermediate: false,
    targetLanguage: 'zh',
  },
}
