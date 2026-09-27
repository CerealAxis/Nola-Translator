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

export type RecognitionModelId = 'sherpa-zh-en-small' | 'sensevoice-small' | 'faster-whisper-small'

export type RecognitionSettings = {
  modelId: RecognitionModelId
}

export type TranslationSettings = {
  provider: 'argos' | 'microsoft' | 'openai' | 'ollama'
  microsoftEndpoint: string
  microsoftRegion: string
  openaiEndpoint: string
  openaiModel: string
  ollamaEndpoint: string
  ollamaModel: string
  allowIntermediate: boolean
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'overlay' | 'translation' | 'modelStoragePath' | 'version'> & {
  recognition?: Partial<RecognitionSettings>
  overlay?: Partial<OverlaySettings>
  translation?: Partial<TranslationSettings>
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  uiLanguage: 'zh-CN',
  modelStoragePath: '',
  historyEnabled: false,
  recognition: {
    modelId: 'sherpa-zh-en-small',
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
    provider: 'argos',
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com',
    microsoftRegion: '',
    openaiEndpoint: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4.1-mini',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    ollamaModel: 'qwen3:4b',
    allowIntermediate: false,
  },
}
