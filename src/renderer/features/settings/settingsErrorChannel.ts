import { describeError, notifyError } from '@/components/primitives/notify'
import { stores } from '@/store'
import { isSessionAlreadyRunningError } from '../../../shared/ipc-error'
import type { SettingsCommand } from '@/store/settingsStore'

/**
 * Whether a failure is the session mutex refusing a second owner.
 *
 * The main process names this refusal `sessionAlreadyRunning`, so the token survives the IPC
 * boundary even though the sentence behind it does not. A feature that meets this failure has
 * to say what the user has to close, not read a code back to them.
 */
export function isSessionConflictFailure(cause: unknown): boolean {
  return isSessionAlreadyRunningError(cause)
}

/**
 * The settings store keeps one failure field for the commands it runs, so a failure that a
 * settings feature has already explained in its own words would otherwise reach the user a
 * second time, as a generic settings failure. The feature claims the failure it reported,
 * and the shared notice leaves a claimed failure alone.
 *
 * The claim carries the command as well as the text: a feature that explained the failure
 * of one command must not silence the notice about another.
 */
let claimed: { text: string; operation: SettingsCommand | null } | null = null

/** Records that this failure has been reported with a message of its own. */
export function claimSettingsError(error: string, operation: SettingsCommand | null = null): void {
  claimed = { text: error, operation }
}

/**
 * Whether the shared notice should stay quiet about this failure. The claim covers a single
 * report, so a later failure carrying the same text is reported on its own.
 */
export function isSettingsErrorClaimed(error: string, operation: SettingsCommand | null = null): boolean {
  if (claimed === null) return false
  if (claimed.text !== error || claimed.operation !== operation) return false
  claimed = null
  return true
}

/**
 * Reports a failed settings command with a message that names the action the user took,
 * and keeps the shared notice from reporting the same failure a second time.
 */
export function reportSettingsFailure(message: string, cause: unknown): void {
  const text = describeError(cause)
  const state = stores.settings.getState()
  // Only a failure the store recorded can reach the shared notice, so only that one is
  // worth claiming. The command it belongs to travels with the claim, so the notice
  // stays quiet about this failure and not about another one.
  if (text !== undefined && state.error === text) claimSettingsError(text, state.errorOperation)
  notifyError(message, { cause })
}

/**
 * How many pages are reporting a runtime failure themselves.
 *
 * The runtime operation notice reads a failure the moment the store records it, which is
 * before the call that caused it comes back to the page. A page that reports the failure
 * in the words of the button the user pressed claims it before that call, and the notice
 * leaves a claimed failure alone.
 */
let runtimeFailureClaims = 0

/** Records that the runtime failure belongs to the page that asked for it. */
export function claimRuntimeFailure(): void {
  runtimeFailureClaims += 1
}

/** Gives the claim back when the call it was made for did not fail that way. */
export function releaseRuntimeFailure(): void {
  runtimeFailureClaims = Math.max(0, runtimeFailureClaims - 1)
}

/** Whether the runtime operation notice should stay quiet about the failure it is reading. */
export function isRuntimeFailureClaimed(): boolean {
  return runtimeFailureClaims > 0
}
