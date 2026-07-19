export type OverlaySettings = {
  mode: 'free' | 'top' | 'bottom'
  locked: boolean
  alwaysOnTop: boolean
  fontFamily: string
  fontSize: number
  fontWeight: number
  sourceColor: string
  translationColor: string
  backgroundOpacity: number
  maxLines: number
  lineHeight: number
  showSource: boolean
  showTranslation: boolean
}

export type AppSettings = {
  version: 1
  theme: 'system' | 'light' | 'dark'
  historyEnabled: boolean
  overlay: OverlaySettings
  translation: TranslationSettings
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

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'overlay' | 'translation'> & {
  overlay?: Partial<OverlaySettings>
  translation?: Partial<TranslationSettings>
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  historyEnabled: false,
  overlay: {
    mode: 'bottom',
    locked: true,
    alwaysOnTop: true,
    fontFamily: 'Segoe UI Variable',
    fontSize: 28,
    fontWeight: 600,
    sourceColor: '#FFFFFF',
    translationColor: '#E6F2FF',
    backgroundOpacity: 0.84,
    maxLines: 3,
    lineHeight: 1.3,
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
