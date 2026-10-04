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
  compute: ComputeSettings
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

/**
 * 翻译服务商按**谁来翻译**分三类，而不是按「用哪个模型」分。
 *
 * 合并的理由是用户的选项单位：问「这条字幕谁来翻」时，`hymt2` / `m2m100` 是同一个答案
 * （都是本机权重，只是装的模型不同），`openai` / `ollama` 也是同一个答案（都是 HTTP 请求，
 * 只是线路协议不同）。把它们拆成五个选项，等于让用户为了选一个模型先理解引擎的内部结构。
 * 模型与协议降级成各自 provider 下面的一个下拉。
 */
export type TranslationProvider = 'local' | 'cloud' | 'microsoft'

/**
 * 云端模型实际使用的 HTTP 协议，即「这个 endpoint 收哪种请求体」。
 *
 * 独立于 provider 是因为 OpenAI 兼容协议有三代（`/chat/completions`、Responses API、Anthropic 的
 * `messages`），Ollama 又是第四种自定义的 `/api/chat`。把它们做成 provider 就得为每种协议
 * 复制一整套设置项，base URL 和模型名却还是同一个字段。
 */
export type CloudApiFormat = 'chat-completions' | 'chat-responses' | 'anthropic' | 'ollama'

/**
 * 需要保存 API 密钥的服务商，即 `credentials.json` 的顶层键。
 *
 * 与 `TranslationProvider` 的差别在于 `local`：本地模型没有密钥位，Ollama 虽然也归在 `cloud`
 * 下面，但密钥是可空的（引擎在 key 为空时不发 Authorization 头）。
 */
export type CredentialProvider = 'cloud' | 'microsoft'

/**
 * The three local Hy-MT2 quantization tiers, or a `hub:<owner>/<name>` id for a GGUF the user
 * installed; only meaningful when provider=local.
 */
export type Hymt2ModelId = 'hy-mt2-1.8b-q4-k-m' | 'hy-mt2-1.8b-q3-k-m' | 'hy-mt2-1.8b-iq2-m' | (string & {})

export type TranslationSettings = {
  provider: TranslationProvider
  /**
   * 仅 provider==='local' 有效。取值范围：Hy-MT2 档位 id / `hub:` 前缀的自装 id / 'm2m100-418m'。
   *
   * 刻意用 `string` 而不是 `Hymt2ModelId`：这个位现在是「已安装的本地翻译模型」的指针，
   * 引擎按 id 路由到对应 loader，类型上再收窄回 Hy-MT2 三档就等于把 M2M100 和自装模型挡在门外。
   */
  localModelId: string
  /** 仅 provider==='cloud' 有效。用户填的 Base URL，原样透传，不做拼接。 */
  cloudEndpoint: string
  cloudModel: string
  cloudApiFormat: CloudApiFormat
  /** 用户自定义显示名，仅用于自己区分多套云端配置，不参与任何请求。 */
  cloudName: string
  cloudContextWindow: number
  cloudMaxOutputTokens: number
  microsoftEndpoint: string
  microsoftRegion: string
  translateIntermediate: boolean
  targetLanguage: string
}

/**
 * 一种云端 API 格式的「全新配置」：接口地址 + 模型 ID。
 *
 * 字段名与 `TranslationSettings` 里那两个同名字段刻意一致，这样「切格式时一起搬的字段」
 * 可以直接当 `AppSettingsPatch.translation` 用，不必在界面里再写一遍字段映射。
 */
export type CloudFormatDefaults = {
  cloudEndpoint: string
  cloudModel: string
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'recognition' | 'recording' | 'appearance' | 'overlay' | 'translation' | 'compute' | 'modelStoragePath' | 'version'> & {
  compute?: Partial<ComputeSettings>
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

export const TRANSLATION_PROVIDERS: readonly TranslationProvider[] = ['local', 'cloud', 'microsoft']

export const CLOUD_API_FORMATS: readonly CloudApiFormat[] = ['chat-completions', 'chat-responses', 'anthropic', 'ollama']

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
  compute: { ...DEFAULT_COMPUTE_SETTINGS },
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
 * 每种 API 格式的「全新配置」：接口地址 + 模型 ID。切格式时这两个字段跟着格式一起换。
 *
 * **它们跟着格式走，不跟着服务商走。** 引擎在 `translation/network.py` 里给四种格式分别补
 * 固定后缀（`/chat/completions`、`/responses`、`/v1/messages`、`/api/chat`），所以地址留上一
 * 种格式的就会拼到错的地方：全新安装把 `https://api.openai.com/v1` 直接切成 Ollama，引擎拼出
 * `https://api.openai.com/v1/api/chat` —— 打到 OpenAI 的域名、用着 Ollama 的 URL 形状，用户只拿
 * 到一个不提地址的网络错误。模型 id 同理，`gpt-4.1-mini` 对 Ollama 和 Anthropic 都没有意义。
 *
 * 取值必须与引擎一致，改这里要同步改 `network.py` 的 `DEFAULT_OPENAI_ENDPOINT` /
 * `DEFAULT_ANTHROPIC_ENDPOINT` / `DEFAULT_OLLAMA_ENDPOINT`，以及 `runtime.py` 的
 * `_configure_translation` 四个分支里各自的 `model=`。
 *
 * 顺带一条不该被改坏的约定：`DEFAULT_SETTINGS.translation` 的 `cloudEndpoint` / `cloudModel`
 * 就等于 `chat-completions` 这一行（它是全新安装的出发值），改上面就要回来改那里。
 */
export const CLOUD_FORMAT_DEFAULTS: Record<CloudApiFormat, CloudFormatDefaults> = {
  'chat-completions': { cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini' },
  // Responses 与 Chat Completions 共用同一个 base：同一家服务、同一个 `/v1`，只有补的后缀不同，
  // 所以这两行字面重复比在读的人脑子里做一次"这俩算不算同族"的判断更靠得住。
  'chat-responses': { cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini' },
  // Anthropic 要的是**站点根地址**：`/v1/messages` 由引擎拼，所以这里不带 `/v1`。
  anthropic: { cloudEndpoint: 'https://api.anthropic.com', cloudModel: 'claude-haiku-4-5' },
  // Ollama 的 `/api/chat` 自带版本段，base 同样停在域名，默认就是本机那一个。
  ollama: { cloudEndpoint: 'http://127.0.0.1:11434', cloudModel: 'qwen3:4b' },
}
