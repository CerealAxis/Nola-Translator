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
 * `sessionStore.errorCodeOf()` takes the prefix of a thrown `FOO: ...` and
 * uppercases it, while engine events are uppercased directly, so one fault can
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
  RUNTIMETORCH: { message: 'runtime.noticeTitle', detail: null, action: 'runtime.goTorch' },
  RUNTIMELLAMA: { message: 'runtime.noticeTitle', detail: null, action: 'runtime.goLlama' },
  MODELMISSING: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  MODELUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNFOUND: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  ENGINENOTREADY: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  ENGINENOTRUNNING: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  INTERNALERROR: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  // The normalised form of `ENGINE_LOST` (uppercase, separators removed) —
  // the same code as `sessionStore.ENGINE_LOST_CODE`, not a second code.
  ENGINELOST: { message: 'errors.engineLost', detail: null, action: 'errors.engineLostAction' },
  AUDIODEVICEUNAVAILABLE: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  DEVICENOTFOUND: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  TRANSLATIONUNAVAILABLE: { message: 'errors.translateFailed', detail: null, action: 'errors.translateFailedAction' },
}

const FALLBACK: Record<'start' | 'stop', ErrorCopy> = {
  start: { message: 'errors.startFailed', detail: null, action: 'errors.startFailedAction' },
  // A session that died mid-run with an unrecognised code is closest to
  // "the engine stopped". `engineNotReady` says recognition cannot start,
  // which is the opposite of what happened here. The code stays off because it
  // could not be read.
  stop: { message: 'errors.engineStopped', detail: null, action: 'workspace.end' },
}

/**
 * Copy whose subject is "starting recognition", so it reads backwards once a
 * session is already running. `errorCopyOf(code, 'stop')` would otherwise take
 * `errors.engineNotReady` ("local engine not running, recognition cannot
 * start") from the table for an `internalError` raised mid-session, telling the
 * user it could not start when it actually stopped.
 */
const START_ONLY_MESSAGES: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  'errors.engineNotReady',
  'errors.startFailed',
])

/** Normalise, look up, and pick the primary button by context. */
export function errorCopyOf(code: string | null, context: 'start' | 'stop'): ErrorCopy {
  const normalized = code === null ? '' : code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const base = (normalized.length > 0 ? ERROR_TABLE[normalized] : undefined) ?? FALLBACK[context]
  // A live session always gets "end session": saving the captions already
  // recognised is the only useful thing left, and a "retry" would invite
  // clicking a session whose engine is already gone.
  if (context !== 'stop') return base
  return {
    ...base,
    message: START_ONLY_MESSAGES.has(base.message) ? 'errors.engineStopped' : base.message,
    action: 'workspace.end',
  }
}

/** The errorCode from a store snapshot, read after the fact by `stop`'s catch. */
export function errorCodeOfSession(state: SessionState): string | null {
  return state.errorCode
}
