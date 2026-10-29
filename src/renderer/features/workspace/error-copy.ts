/** Error code to copy, shared by the workspace page and its session dialogs. */

import type { SessionState } from '@/store'
import type { TranslationKey } from '@/i18n'
import type { SettingsTab } from '@/routes'
import { SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from '../../../shared/error-catalog'
import type { SupportErrorCode } from '../../../shared/error-catalog'

// -- Error code to copy ------------------------------------------------------------

/** What the primary button of a failure does. */
export type ErrorActionTarget =
  | { kind: 'reset' } // start the session again
  | { kind: 'stop' } // end the session
  | { kind: 'record' } // open this session's record
  | { kind: 'settings'; tab: SettingsTab } // jump to one tab of the settings page
  | { kind: 'models' } // jump to model management
  | { kind: 'runtime'; component: 'engine' | 'llama' | 'crisp' } // open the runtime component settings

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
  /**
   * What the primary button does. It travels with the label so the two cannot disagree:
   * a button that says "install the model" and then restarts the session leaves the user
   * believing something happened that did not.
   */
  target: ErrorActionTarget
}

/**
 * The primary button of a failure, keyed by support code.
 *
 * The message is not repeated here: it comes from the shared catalog, so the sentence a user
 * reads and the support code behind it are the same entry and cannot drift apart. Only the
 * action is local, because it depends on what the user can do next rather than on what broke.
 *
 * A `Record` rather than a `Partial`: a support code without a row used to fall through to the
 * generic "start again" button, which is a wrong answer for every failure that a retry cannot
 * fix. Adding a code to the catalog now fails the build until it says what its button does.
 */
const ERROR_ACTIONS: Record<SupportErrorCode, { target: ErrorActionTarget; label: TranslationKey; detail?: TranslationKey }> = {
  'ARG-001': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ARG-002': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ARG-003': { target: { kind: 'record' }, label: 'errors.engineLostAction' },
  'ARG-004': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.configureCloudRecognitionAction' },
  // Cloud recognition: Aliyun LiveTranslate and MiniMax both bill per account, so a missing
  // key, a spent balance or a rejected response is settled in the provider's settings.
  'ASR-001': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.configureCloudRecognitionAction' },
  'ASR-002': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.configureCloudRecognitionAction' },
  'ASR-003': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ASR-004': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ASR-005': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ASR-006': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.configureCloudRecognitionAction' },
  'ASR-007': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ASR-008': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Audio devices: the capture device is picked in the audio settings.
  'AUD-001': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.deviceNotFoundAction' },
  'AUD-002': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.deviceNotFoundAction' },
  'AUD-003': { target: { kind: 'settings', tab: 'audio' }, label: 'errors.deviceNotFoundAction' },
  'AUD-004': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Engine: the runtime components live in the engine settings, a protocol mismatch needs the
  // matching engine version, and a lost engine leaves a record behind instead of a retry.
  'ENG-001': { target: { kind: 'runtime', component: 'engine' }, label: 'runtime.goTorch' },
  'ENG-002': { target: { kind: 'record' }, label: 'errors.engineLostAction' },
  'ENG-003': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ENG-004': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ENG-005': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'ENG-006': { target: { kind: 'runtime', component: 'engine' }, label: 'errors.updateEngineAction' },
  'ENG-007': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  'ERR-999': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'EXP-009': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Models: a missing or broken weight is fixed in model management, a busy resource is
  // transient, and a missing dependency is a runtime component the engine needs.
  'MDL-003': { target: { kind: 'models' }, label: 'errors.modelMissingAction' },
  'MDL-012': { target: { kind: 'models' }, label: 'errors.modelMissingAction' },
  'MDL-013': { target: { kind: 'models' }, label: 'errors.modelMissingAction' },
  'MDL-014': { target: { kind: 'models' }, label: 'errors.modelMissingAction' },
  'MDL-015': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MDL-017': { target: { kind: 'models' }, label: 'errors.modelLoadFailedAction' },
  'MDL-018': { target: { kind: 'runtime', component: 'engine' }, label: 'runtime.goTorch' },
  'MDL-019': { target: { kind: 'models' }, label: 'errors.modelLoadFailedAction' },
  'MDL-020': { target: { kind: 'models' }, label: 'errors.chooseSmallerModelAction' },
  'MDL-021': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MDL-022': { target: { kind: 'models' }, label: 'errors.modelLoadFailedAction' },
  'MDL-023': { target: { kind: 'models' }, label: 'errors.modelMissingAction' },
  'MDL-024': { target: { kind: 'models' }, label: 'modelsPolicy.modelDisabled' },
  'MDL-025': { target: { kind: 'models' }, label: 'modelsPolicy.modelNotLoaded' },

  // Translation: the hosted providers (LLM translation, Microsoft, Google, MyMemory) need the
  // service's key and credit, which is configured in the translation settings.
  'MT-007': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.translateFailedAction' },
  'MT-008': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-009': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-010': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-011': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-012': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-013': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.translateFailedAction' },
  'MT-014': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.configureTranslationAction' },
  'MT-015': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.translateFailedAction' },
  'MT-016': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.translateFailedAction' },
  'MT-017': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.changeTranslationLanguageAction' },
  'MT-018': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.configureTranslationAction' },
  'MT-019': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.configureTranslationAction' },
  'MT-020': { target: { kind: 'settings', tab: 'translation' }, label: 'errors.configureTranslationAction' },
  'MT-021': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'MT-022': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Download, search and network: a failed lookup is worth another try, a failed integrity
  // check is not, and it is settled by fetching the weights again.
  'NET-006': { target: { kind: 'models' }, label: 'errors.downloadFailedAction' },
  'NET-007': { target: { kind: 'models' }, label: 'errors.searchFailedAction' },
  'NET-008': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'NET-009': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'NET-010': { target: { kind: 'models' }, label: 'errors.modelLoadFailedAction' },

  // Runtime components: each one is installed from its own panel.
  'RNT-001': { target: { kind: 'runtime', component: 'engine' }, label: 'runtime.goTorch' },
  'RNT-002': { target: { kind: 'runtime', component: 'llama' }, label: 'runtime.goLlama' },
  'RNT-003': { target: { kind: 'runtime', component: 'crisp' }, label: 'runtime.goCrisp' },

  // Session.
  'SES-004': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'SES-005': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'SES-008': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'SES-009': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Storage: the directory and its permissions are chosen in the storage settings.
  'STO-008': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.storageChangedAction' },
  'STO-018': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-019': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-020': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-021': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-022': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-023': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },
  'STO-024': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.checkStorageAction' },

  // Interface: the window is back to a state where a new attempt can be made.
  'UIP-010': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-011': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-017': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-022': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-023': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-024': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-025': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-026': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-027': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-028': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-029': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-030': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
  'UIP-031': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },

  // Settings commands: the storage ones are settled in the storage settings, and the two that
  // are not about storage have nothing better to offer than another attempt.
  'UIP-033': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.storageChangedAction' },
  'UIP-034': { target: { kind: 'settings', tab: 'storage' }, label: 'errors.storageChangedAction' },
  'UIP-035': { target: { kind: 'reset' }, label: 'errors.startFailedAction' },
}

/**
 * Copy whose subject is "starting recognition", so it reads backwards once a
 * session is already running. A startup-specific message becomes the generic
 * unknown-failure copy in that context; the original cause remains in diagnostics.
 */
const START_ONLY_CODES: ReadonlySet<SupportErrorCode> = new Set<SupportErrorCode>([
  'ENG-001',
  'SES-004',
])

/**
 * The copy for a failure, in the context it happened in.
 *
 * The cause decides the code, and the code decides the message, so the sentence and the support
 * code a user reports are the same lookup the diagnostics use. A cause nobody claims is the
 * generic failure rather than a sentence about something else.
 *
 * `context` decides the primary button. A live session normally gets "end session": once an error
 * has happened, saving the captions already captured is the only useful thing left to do, and a
 * "retry" there invites clicking a dead session. Two failures keep the button their own code asks
 * for, because ending the session would throw away the reason it ended: a missing runtime
 * component has to be installed, and a lost engine leaves captions worth reading.
 */
export function errorCopyOf(cause: string | null, context: 'start' | 'stop'): ErrorCopy {
  const code = supportErrorCodeForCause(cause)
  const entry = ERROR_ACTIONS[code]
  const message: TranslationKey = SUPPORT_ERROR_CATALOG[code].messageKey
  if (context !== 'stop') {
    return { message, detail: entry.detail ?? null, action: entry.label, target: entry.target }
  }
  const keepsItsTarget = entry.target.kind === 'runtime' || entry.target.kind === 'record'
  return {
    message: START_ONLY_CODES.has(code) ? 'errors.unknownFailure' : message,
    detail: entry.detail ?? null,
    action: keepsItsTarget ? entry.label : 'workspace.end',
    target: keepsItsTarget ? entry.target : { kind: 'stop' },
  }
}

/** The errorCode from a store snapshot, read after the fact by `stop`'s catch. */
export function errorCodeOfSession(state: SessionState): string | null {
  return state.errorCode
}
