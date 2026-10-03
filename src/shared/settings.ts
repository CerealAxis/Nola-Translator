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
  lineHeight: number
  translationLineHeight: number
  showSource: boolean
  showTranslation: boolean
  /** `rolling` keeps the source/translation streams scrolling up like 讯飞同传; `sentence` switches to per-segment line breaks. */
  layout: 'rolling' | 'sentence'
}

export type AppSettings = {
  version: 1
  theme: 'system' | 'light' | 'dark'
  uiLanguage: 'zh-CN' | 'en'
  modelStoragePath: string
  recognition: RecognitionSettings
  recording: RecordingSettings
  appearance: AppearancePrefs
  overlay: OverlaySettings
  translation: TranslationSettings
}

/** `keepAudio: false` stops the engine from being handed a recording path, so no WAV is written. */
export type RecordingSettings = {
  keepAudio: boolean
}

export type AppearancePrefs = {
  /** Honoured by the app shell; the caption overlay always animates, it is the system caption surface. */
  reduceMotion: boolean
}

/**
 * One of the recognition models the app ships with, or a `hub:<owner>/<name>` id for a model the
 * user installed from Hugging Face.
 *
 * The trailing `string & {}` keeps editor autocomplete on the three known ids while still
 * accepting a custom one; a plain `string` would silently accept any typo, and the union is what
 * `settings-schema.ts` mirrors at runtime.
 */
export type RecognitionModelId = 'qwen3-asr-1.7b-hf' | 'qwen3-asr-0.6b-hf' | 'sensevoice-small' | (string & {})

export type RecognitionSettings = {
  modelId: RecognitionModelId
  sourceLanguage: string
  /** `defaultOutput` or an audio device id; shared so the overlay can start a session with the same source. */
  audioSource: string
}

export type TranslationProvider = 'hymt2' | 'm2m100' | 'microsoft' | 'openai' | 'ollama'

/**
 * The three local Hy-MT2 quantization tiers, or a `hub:<owner>/<name>` id for a GGUF the user
 * installed; only meaningful when provider=hymt2.
 */
export type Hymt2ModelId = 'hy-mt2-1.8b-q4-k-m' | 'hy-mt2-1.8b-q3-k-m' | 'hy-mt2-1.8b-iq2-m' | (string & {})

export type TranslationSettings = {
  provider: TranslationProvider
  /** Ignored unless provider=hymt2. */
  hymt2ModelId: Hymt2ModelId
  microsoftEndpoint: string
  microsoftRegion: string
  openaiEndpoint: string
  openaiModel: string
  ollamaEndpoint: string
  ollamaModel: string
  translateIntermediate: boolean
  targetLanguage: string
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'recording' | 'appearance' | 'overlay' | 'translation' | 'modelStoragePath' | 'version'> & {
  recognition?: Partial<RecognitionSettings>
  recording?: Partial<RecordingSettings>
  appearance?: Partial<AppearancePrefs>
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

/** The three Hy-MT2 tiers, ordered largest to smallest, matching the engine's resources.py definitions. */
export const HYMT2_MODEL_IDS: readonly Hymt2ModelId[] = ['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m']

export const HYMT2_MODEL_LABELS: Record<Hymt2ModelId, string> = {
  'hy-mt2-1.8b-q4-k-m': 'Q4_K_M · 1.13 GB · 质量基准',
  'hy-mt2-1.8b-q3-k-m': 'Q3_K_M · 951 MB · 专名最稳',
  'hy-mt2-1.8b-iq2-m': 'UD-IQ2_M · 723 MB · 体积最小',
}

/** Source language dropdown entries; `auto` leaves detection to the model. Kept in sync with the engine's resources.py language list. */
export const SOURCE_LANGUAGE_OPTIONS = ['auto', 'zh', 'yue', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'th', 'vi', 'tr', 'id'] as const

/** Target language dropdown entries. The app passes exactly one; the engine protocol still accepts a list. */
export const TARGET_LANGUAGE_OPTIONS = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'tr', 'ar', 'th', 'vi', 'ms', 'id'] as const

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  uiLanguage: 'zh-CN',
  modelStoragePath: '',
  recognition: {
    modelId: 'qwen3-asr-1.7b-hf',
    sourceLanguage: 'auto',
    audioSource: 'defaultOutput',
  },
  recording: {
    keepAudio: true,
  },
  appearance: {
    reduceMotion: false,
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
    translationColor: '#D7DEE8',
    backgroundColor: '#0D0E10',
    backgroundOpacity: 0.96,
    lineHeight: 1.3,
    translationLineHeight: 1.35,
    showSource: true,
    showTranslation: true,
    layout: 'rolling',
  },
  translation: {
    provider: 'hymt2',
    hymt2ModelId: 'hy-mt2-1.8b-q3-k-m',
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
