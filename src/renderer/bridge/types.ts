/**
 * The type exit of the data-access layer. Every contract type here is imported
 * from `src/shared/` rather than copied: a copy drifts the moment preload gains
 * a method.
 */

import type { NolaTranslatorApi } from '../../shared/bridge'
import type { ResourceRecord, ResourceSnapshot } from '../../shared/contracts'

// Re-exported verbatim from src/shared/.

export type {
  AudioDevice,
  AudioSource,
  CaptionSegment,
  EngineCommand,
  EngineErrorCode,
  EngineEvent,
  EngineProcessState,
  MeetingMeta,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
  Translation,
} from '../../shared/contracts'

export type { EngineChannelEvent, EngineLifecycleEvent, ModelStorageInfo, OverlayTargetPage, SessionStartResult } from '../../shared/bridge'

export type {
  AppearancePrefs,
  AppSettings,
  AppSettingsPatch,
  CloudApiFormat,
  Hymt2ModelId,
  OverlaySettings,
  RecognitionModelId,
  RecognitionSettings,
  RecordingSettings,
  TranslationProvider,
  TranslationSettings,
} from '../../shared/settings'

/**
 * Translation providers that need a credential, i.e. the top-level keys of
 * `credentials.json`, re-exported from `src/shared/settings`.
 */
export type { CredentialProvider } from '../../shared/settings'

export {
  CLOUD_API_FORMATS,
  CLOUD_FORMAT_DEFAULTS,
  DEFAULT_SETTINGS,
  HYMT2_MODEL_IDS,
  HYMT2_MODEL_LABELS,
  RECOGNITION_MODEL_IDS,
  RECOGNITION_MODEL_LABELS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  TRANSLATION_PROVIDERS,
} from '../../shared/settings'

export { PROTOCOL_VERSION } from '../../shared/contracts'

export type { NolaTranslatorApi }

/**
 * `ResourceRecord.bytesPerSecond`: neither the main process's `ResourceRecord`
 * nor its `modelProgress` event carries a rate, and the download table's speed
 * column needs one.
 */
export type ResourceRecordWithRate = ResourceRecord & {
  readonly bytesPerSecond?: number
}

export type ResourceSnapshotWithRate = Omit<ResourceSnapshot, 'resources'> & {
  readonly resources: readonly ResourceRecordWithRate[]
}

export type SessionStatus = 'idle' | 'starting' | 'running' | 'paused' | 'stopping' | 'error'

/**
 * Download lifecycle, shaped the way the model list draws it. The engine reports
 * the coarser `state ('idle'|'running'|'cancelling'|'failed') + phase`, and
 * `resourceStateOf()` in `contract.ts` flattens the two.
 */
export type ResourceState = 'absent' | 'queued' | 'downloading' | 'verifying' | 'installed' | 'failed'

/** Diagnostics payload shape; this is what the main process's `getDiagnostics()` returns. */
export type DiagnosticsPayload = Record<string, string | number>

/** Formats `meetings.export()` accepts. */
export type ExportFormat = 'txt' | 'srt' | 'vtt'

/**
 * One entry of the audio source picker. `AudioDevice` cannot express the
 * pseudo-option "system default output" — in the protocol that is
 * `SessionConfig.audioSource = { kind: 'defaultOutput' }`, not a device.
 */
export type AudioSourceOption =
  | { value: 'defaultOutput'; kind: 'defaultOutput'; deviceId: null; name: string; isDefault: true }
  | {
      value: string
      kind: 'systemOutput' | 'microphone'
      deviceId: string
      name: string
      isDefault: boolean
    }

/** Bilingual label for a language code. Data, not UI copy: the i18n layer looks it up by `code`. */
export type LanguageLabel = { code: string; zh: string; en: string }

/**
 * Language names. Data, not a fixture: a language's name does not change with
 * the UI language, so it follows `SOURCE_LANGUAGE_OPTIONS` /
 * `TARGET_LANGUAGE_OPTIONS` instead of the i18n dictionary.
 */
export const LANGUAGE_LABELS: Record<string, LanguageLabel> = {
  auto: { code: 'auto', zh: '自动检测', en: 'Auto detect' },
  zh: { code: 'zh', zh: '中文（简体）', en: 'Chinese (Simplified)' },
  yue: { code: 'yue', zh: '粤语', en: 'Cantonese' },
  en: { code: 'en', zh: '英语', en: 'English' },
  ja: { code: 'ja', zh: '日语', en: 'Japanese' },
  ko: { code: 'ko', zh: '韩语', en: 'Korean' },
  fr: { code: 'fr', zh: '法语', en: 'French' },
  de: { code: 'de', zh: '德语', en: 'German' },
  es: { code: 'es', zh: '西班牙语', en: 'Spanish' },
  pt: { code: 'pt', zh: '葡萄牙语', en: 'Portuguese' },
  it: { code: 'it', zh: '意大利语', en: 'Italian' },
  ru: { code: 'ru', zh: '俄语', en: 'Russian' },
  ar: { code: 'ar', zh: '阿拉伯语', en: 'Arabic' },
  th: { code: 'th', zh: '泰语', en: 'Thai' },
  vi: { code: 'vi', zh: '越南语', en: 'Vietnamese' },
  tr: { code: 'tr', zh: '土耳其语', en: 'Turkish' },
  id: { code: 'id', zh: '印度尼西亚语', en: 'Indonesian' },
  ms: { code: 'ms', zh: '马来语', en: 'Malay' },
}

/**
 * The "system default output" pseudo source. `listDevices()` returns real
 * devices only, and the protocol's `defaultOutput` has no device behind it, so
 * the picker takes its first entry from here. The name comes from i18n
 * (`audio.defaultOutput`); only the three protocol fields live here.
 */
export const DEFAULT_OUTPUT_VALUE = 'defaultOutput'

/**
 * Fallback vocabulary for engine-reported failures, mostly
 * `type(error).__name__` plus a few fixed semantic codes. Not UI copy: the UI
 * goes through the i18n dictionary (`shellUi.error.*`), and this only keeps a
 * code the dictionary has never heard of from rendering as a blank.
 */
export const TRANSLATION_ERROR_LABELS: Record<string, string> = {
  URLError: '网络不可达',
  HTTPError: '接口返回错误',
  TimeoutError: '请求超时',
  translationTimeout: '翻译超时',
  resourceUnavailable: '翻译模型未安装',
  llamaServerUnavailable: '本地翻译服务未就绪',
  unsupportedLanguagePair: '不支持该语言组合',
  translationUnavailable: '翻译暂不可用',
  RuntimeError: '翻译服务返回异常',
  ValueError: '翻译参数无效',
  ConnectionError: '网络连接失败',
}
