import { LANGUAGE_CODES } from './languages'
import { DEFAULT_COMPUTE_SETTINGS, type ComputeSettings } from './compute'

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
  /** `rolling` scrolls both streams up as one block; `sentence` breaks per segment. */
  layout: 'rolling' | 'sentence'
}

/**
 * The caption block drawn inside a browser video. A single-member `layout` union: the block always
 * pairs each source segment with its translation, so there is no other arrangement to store.
 */
/**
 * Where the browser extension's caption audio comes from. `tab` is the page's own playback,
 * captured in the tab; `system` is captured by the desktop from an output device, which is why it
 * also carries a device id. The extension reads this to fill `source` and `deviceId` on `start`.
 */
export type VideoCaptionAudioSource = 'tab' | 'system'

export type VideoCaptionSettings = {
  showSource: boolean
  showTranslation: boolean
  /** Per-segment bilingual pairing; the video overlay has no rolling mode. */
  layout: 'sentence'
  fontSize: number
  /** Percent of the video height where the caption block's bottom edge sits, 0..100. */
  position: number
  /**
   * `tab` alone, or `system` plus the device id in `audioDeviceId`. Same convention as
   * `RecognitionSettings.audioSource`: the device is only meaningful for a desktop-side capture,
   * so the two fields stay separate instead of overloading one string with a sentinel.
   *
   * Optional because the browser extension builds its own config object on this type and merges the
   * desktop's copy field by field, across independently shipped versions — the desktop always writes
   * a value (`DEFAULT_SETTINGS`, then sanitized on load and on write), the extension tolerates its
   * absence. Required here would break every extension build on the field's introduction.
   */
  audioSource?: VideoCaptionAudioSource
  /** The output device for `audioSource: 'system'`; absent or ignored when it is `tab`. */
  audioDeviceId?: string
}

export type AppSettings = {
  version: 1
  theme: 'system' | 'light' | 'dark'
  uiLanguage: 'zh-CN' | 'en'
  modelStoragePath: string
  /** Download Hugging Face model files through hf-mirror.com when enabled. */
  useHuggingFaceMirror: boolean
  recognition: RecognitionSettings
  recording: RecordingSettings
  appearance: AppearancePrefs
  overlay: OverlaySettings
  videoCaptions: VideoCaptionSettings
  translation: TranslationSettings
  compute: ComputeSettings
  browserConnection: { enabled: boolean }
}

/** `keepAudio: false` stops the engine from being handed a recording path, so no WAV is written. */
export type RecordingSettings = {
  keepAudio: boolean
}

export type AppearancePrefs = {
  /** Set on the main window's document by the settings tab, so the caption overlay keeps animating. */
  reduceMotion: boolean
}

/**
 * A shipped recognition model, or a `hub:<owner>/<name>` id for a model installed from Hugging
 * Face. The trailing `string & {}` keeps autocomplete on the known ids while still accepting a
 * custom one; `settings-schema.ts` is the runtime mirror of this union.
 */
export type RecognitionModelId = 'qwen3-asr-1.7b-hf' | 'qwen3-asr-0.6b-hf' | 'sensevoice-small' | (string & {})

export type RecognitionSettings = {
  modelId: RecognitionModelId
  sourceLanguage: string
  /** `defaultOutput` or an audio device id; shared so the overlay can start a session with the same source. */
  audioSource: string
}

/**
 * Partitioned by **who translates**, not by which model: `local` is this machine's weights
 * whichever loader owns them, `cloud` is an HTTP request whichever wire format it speaks. The
 * model and the protocol are a sub-selection under each.
 */
export type TranslationProvider = 'local' | 'cloud' | 'microsoft'

/**
 * The HTTP protocol a cloud endpoint actually speaks.
 */
export type CloudApiFormat = 'chat-completions' | 'chat-responses' | 'anthropic' | 'ollama'

/**
 * The providers that need an API key — the top-level keys of `credentials.json`. `local` has no
 * key slot at all, and `cloud` may hold none either: the OpenAI-shaped and Ollama endpoints omit
 * the Authorization header when the key is empty, while the Anthropic and Microsoft shapes
 * refuse without one.
 */
export type CredentialProvider = 'cloud' | 'microsoft'

/**
 * The three local Hy-MT2 quantization tiers, or a `hub:<owner>/<name>` id for an installed GGUF.
 * Only meaningful when provider is `local`.
 */
export type Hymt2ModelId = 'hy-mt2-1.8b-q4-k-m' | 'hy-mt2-1.8b-q3-k-m' | 'hy-mt2-1.8b-iq2-m' | (string & {})

export type TranslationSettings = {
  provider: TranslationProvider
  localModelId: string
  /** Only read when provider is `cloud`. Passed through as a base; the engine appends the path its format needs. */
  cloudEndpoint: string
  cloudModel: string
  cloudApiFormat: CloudApiFormat
  /** A display label for the user's own cloud configurations; never sent to the engine. */
  cloudName: string
  cloudContextWindow: number
  cloudMaxOutputTokens: number
  microsoftEndpoint: string
  microsoftRegion: string
  translateIntermediate: boolean
  targetLanguage: string
}

/**
 * A fresh configuration for one API format: endpoint plus model id. The field names match
 * `TranslationSettings` so the pair can be applied as an `AppSettingsPatch.translation` directly.
 */
export type CloudFormatDefaults = {
  cloudEndpoint: string
  cloudModel: string
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'recording' | 'appearance' | 'overlay' | 'videoCaptions' | 'translation' | 'compute' | 'modelStoragePath' | 'version' | 'browserConnection'> & {
  compute?: Partial<ComputeSettings>
  recognition?: Partial<RecognitionSettings>
  recording?: Partial<RecordingSettings>
  appearance?: Partial<AppearancePrefs>
  overlay?: Partial<OverlaySettings>
  videoCaptions?: Partial<VideoCaptionSettings>
  translation?: Partial<TranslationSettings>
}

export const RECOGNITION_MODEL_IDS: readonly RecognitionModelId[] = ['qwen3-asr-1.7b-hf', 'qwen3-asr-0.6b-hf', 'sensevoice-small']

export const RECOGNITION_MODEL_LABELS: Record<RecognitionModelId, string> = {
  'qwen3-asr-1.7b-hf': 'Qwen3-ASR 1.7B',
  'qwen3-asr-0.6b-hf': 'Qwen3-ASR 0.6B',
  'sensevoice-small': 'SenseVoiceSmall',
}

export const TRANSLATION_PROVIDERS: readonly TranslationProvider[] = ['local', 'cloud', 'microsoft']

export const CLOUD_API_FORMATS: readonly CloudApiFormat[] = ['chat-completions', 'chat-responses', 'anthropic', 'ollama']

/** The three Hy-MT2 tiers, ordered largest to smallest; ids come from the engine's models/catalog.py. */
export const HYMT2_MODEL_IDS: readonly Hymt2ModelId[] = ['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m']

export const HYMT2_MODEL_LABELS: Record<Hymt2ModelId, string> = {
  'hy-mt2-1.8b-q4-k-m': 'Q4_K_M · 1.13 GB · 质量基准',
  'hy-mt2-1.8b-q3-k-m': 'Q3_K_M · 951 MB · 专名最稳',
  'hy-mt2-1.8b-iq2-m': 'UD-IQ2_M · 723 MB · 体积最小',
}

/** Catalog fallback for remote providers and persisted language validation. */
export const SOURCE_LANGUAGE_OPTIONS: readonly string[] = ['auto', ...LANGUAGE_CODES]
export const NO_TRANSLATION_LANGUAGE = 'none'
export const TARGET_LANGUAGE_OPTIONS: readonly string[] = [NO_TRANSLATION_LANGUAGE, ...LANGUAGE_CODES]

export const DEFAULT_SETTINGS: AppSettings = {
  compute: { ...DEFAULT_COMPUTE_SETTINGS },
  browserConnection: { enabled: false },
  version: 1,
  theme: 'system',
  uiLanguage: 'zh-CN',
  modelStoragePath: '',
  useHuggingFaceMirror: true,
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
  videoCaptions: {
    showSource: true,
    showTranslation: true,
    layout: 'sentence',
    fontSize: 24,
    position: 82,
    audioSource: 'tab',
  },
  translation: {
    provider: 'local',
    localModelId: 'hy-mt2-1.8b-q3-k-m',
    cloudEndpoint: 'https://api.openai.com/v1',
    cloudModel: 'gpt-4.1-mini',
    cloudApiFormat: 'chat-completions',
    cloudName: '',
    cloudContextWindow: 128000,
    cloudMaxOutputTokens: 4096,
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com',
    microsoftRegion: '',
    translateIntermediate: false,
    targetLanguage: 'zh',
  },
}

/**
 * A fresh configuration per API format: endpoint plus model id. These follow the **format**, not
 * the vendor — the engine appends the path each format needs (`/chat/completions`, `/responses`,
 * `/v1/messages`, `/api/chat`), so a base left over from another format is silently wrong.
 * `DEFAULT_SETTINGS.translation` is the `chat-completions` row, the starting value for a new install.
 */
export const CLOUD_FORMAT_DEFAULTS: Record<CloudApiFormat, CloudFormatDefaults> = {
  'chat-completions': { cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini' },
  'chat-responses': { cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini' },
  // Anthropic takes a bare origin: the engine appends `/v1/messages`, so there is no `/v1` here.
  anthropic: { cloudEndpoint: 'https://api.anthropic.com', cloudModel: 'claude-haiku-4-5' },
  // `/api/chat` carries its own version segment, so this base stops at the host; the default is the local server.
  ollama: { cloudEndpoint: 'http://127.0.0.1:11434', cloudModel: 'qwen3:4b' },
}
