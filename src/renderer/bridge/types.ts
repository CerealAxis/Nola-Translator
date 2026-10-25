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
  AudioTestSource,
  AudioTestResult,
  AudioSource,
  CaptionSegment,
  EngineCommand,
  EngineErrorCode,
  EngineEvent,
  EngineProcessState,
  MeetingMeta,
  ModelDownloadSource,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
  Translation,
} from '../../shared/contracts'

export type { DiagnosticCopyContext, EngineChannelEvent, EngineLifecycleEvent, ModelStorageInfo, OverlayTargetPage, SessionStartResult } from '../../shared/bridge'
export type { AppUpdateCheckResult } from '../../shared/app-updates'

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
  NO_TRANSLATION_LANGUAGE,
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
export type ResourceState = 'absent' | 'queued' | 'downloading' | 'paused' | 'verifying' | 'removing' | 'installed' | 'failed'

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

export { LANGUAGE_LABELS, languageName } from '../../shared/languages'
export type { LanguageLabel } from '../../shared/languages'
export type { ModelConfiguration } from '../../shared/model-capabilities'

/**
 * The "system default output" pseudo source. `listDevices()` returns real
 * devices only, and the protocol's `defaultOutput` has no device behind it, so
 * the picker takes its first entry from here. The name comes from i18n
 * (`audio.defaultOutput`); only the three protocol fields live here.
 */
export const DEFAULT_OUTPUT_VALUE = 'defaultOutput'
