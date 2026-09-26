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

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'overlay' | 'translation'> & {
  recognition?: Partial<RecognitionSettings>
  overlay?: Partial<OverlaySettings>
  translation?: Partial<TranslationSettings>
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  historyEnabled: false,
  recognition: {
    modelId: 'sherpa-zh-en-small',
  },
  overlay: {
    mode: 'bottom',
    colorScheme: 'dark',
    locked: true,
    alwaysOnTop: true,
    fontFamily: 'Segoe UI Variable',
    fontSize: 28,
    fontWeight: 600,
    translationFontSize: 22,
    translationFontWeight: 500,
    sourceColor: '#FFFFFF',
    translationColor: '#E6F2FF',
    backgroundColor: '#202020',
    backgroundOpacity: 0.84,
    maxLines: 3,
    lineHeight: 1.3,
    translationMaxLines: 3,
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
