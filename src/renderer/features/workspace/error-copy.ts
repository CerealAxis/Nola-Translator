/** Error code to copy, shared by the workspace page and its session dialogs. */

import type { SessionState } from '@/store'
import type { TranslationKey } from '@/i18n'

// -- Error code to copy ------------------------------------------------------------

export interface ErrorCopy {
  message: TranslationKey
  /**
   * Optional second line, null by default: an `errors.*` message is already a
   * complete sentence, so a detail repeating the action would show the same
   * "retry" text in the body and on the primary button.
   */
  detail: TranslationKey | null
  /** The primary button. */
  action: TranslationKey
}

/**
 * `errorCode` to `errors.*` copy.
 *
 * `sessionStore.errorCodeOf()` prefers a structured engine code and falls back
 * to the prefix of a thrown `FOO: ...`; engine events are uppercased directly, so one fault can
 * arrive three ways (`MODEL_MISSING` / `MODELUNAVAILABLE` / `MODEL_UNAVAILABLE`).
 * Normalise before lookup, and fall back on context: an imprecise message beats
 * the UI rendering `missing:errors.xxx`, which is what the i18n layer does with
 * an unknown key.
 *
 * `context` decides the fallback copy and the primary button. A live session
 * always gets "end session": once an error has happened, saving the captions
 * already captured is the only useful thing left to do, and a "retry" there
 * invites clicking a dead session.
 *
 * A matched row is chosen by `errorCode` alone, so `ENGINELOST` resolves to its
 * own row in either context. The engine takes the session with it and clears
 * the `sessionId`, so it lands in the `start` branch, which only supplies a
 * fallback and leaves a matched row alone.
 */
const ERROR_TABLE: Record<string, ErrorCopy> = {
  CLOUDRECOGNITIONCREDENTIALMISSING: { message: 'errors.cloudRecognitionCredentialMissing', detail: null, action: 'modelsSettingsUi.audio' },
  CLOUDRECOGNITIONRATELIMITED: { message: 'errors.cloudRecognitionRateLimited', detail: null, action: 'errors.startFailedAction' },
  // Balance is topped up in the provider's console, so retrying here cannot help and the
  // primary button ends the session instead of inviting another dead attempt.
  CLOUDRECOGNITIONINSUFFICIENTBALANCE: { message: 'errors.cloudRecognitionInsufficientBalance', detail: null, action: 'workspace.end' },
  RUNTIMETORCH: { message: 'errors.torchRuntimeUnavailable', detail: null, action: 'runtime.goTorch' },
  RUNTIMELLAMA: { message: 'errors.llamaRuntimeUnavailable', detail: null, action: 'runtime.goLlama' },
  MODELMISSING: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  MODELUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNAVAILABLE: { message: 'errors.prewarm.resourceUnavailable', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNFOUND: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEBUSY: { message: 'errors.prewarm.resourceBusy', detail: null, action: 'errors.startFailedAction' },
  INVALIDCONFIGURATION: { message: 'errors.prewarm.invalidConfiguration', detail: null, action: 'errors.modelMissingAction' },
  SESSIONALREADYRUNNING: { message: 'errors.prewarm.sessionAlreadyRunning', detail: null, action: 'errors.startFailedAction' },
  ENGINENOTREADY: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  ENGINENOTRUNNING: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  INTERNALERROR: { message: 'errors.engineOperationFailed', detail: null, action: 'errors.startFailedAction' },
  SESSIONERROR: { message: 'errors.startFailed', detail: null, action: 'errors.startFailedAction' },
  // The normalised form of `ENGINE_LOST` (uppercase, separators removed) —
  // the same code as `sessionStore.ENGINE_LOST_CODE`, not a second code.
  ENGINELOST: { message: 'errors.engineLost', detail: null, action: 'errors.engineLostAction' },
  AUDIODEVICEENUMERATIONFAILED: { message: 'errors.audioDeviceEnumerationFailed', detail: null, action: 'errors.deviceNotFoundAction' },
  AUDIODEVICEUNAVAILABLE: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  DEVICENOTFOUND: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  TRANSLATIONUNAVAILABLE: { message: 'errors.translateFailed', detail: null, action: 'errors.translateFailedAction' },
}

const FALLBACK: Record<'start' | 'stop', ErrorCopy> = {
  start: { message: 'errors.startFailed', detail: null, action: 'errors.startFailedAction' },
  stop: { message: 'errors.unknownFailure', detail: null, action: 'workspace.end' },
}

/**
 * Copy whose subject is "starting recognition", so it reads backwards once a
 * session is already running. A startup-specific message becomes the generic
 * unknown-failure copy in that context; the original cause remains in diagnostics.
 */
const START_ONLY_MESSAGES: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  'errors.engineNotReady',
  'errors.startFailed',
])

/** Normalise, look up, and pick the primary button by context. */
export function errorCopyOf(code: string | null, context: 'start' | 'stop'): ErrorCopy {
  const normalized = code === null ? '' : code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const base = (normalized.length > 0 ? ERROR_TABLE[normalized] : undefined)
    ?? (normalized.length > 0
      ? { ...FALLBACK[context], message: 'errors.unknownFailure' as const }
      : FALLBACK[context])
  // A live session always gets "end session": saving the captions already
  // recognised is the only useful thing left, and a "retry" would invite
  // clicking a session whose engine is already gone.
  if (context !== 'stop') return base
  return {
    ...base,
    message: START_ONLY_MESSAGES.has(base.message) ? 'errors.unknownFailure' : base.message,
    action: 'workspace.end',
  }
}

/** The errorCode from a store snapshot, read after the fact by `stop`'s catch. */
export function errorCodeOfSession(state: SessionState): string | null {
  return state.errorCode
}
