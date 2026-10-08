import type { TranslationKey } from '@/i18n'

/**
 * What stopped a settings write, as far as the message says. `unknown` is a real outcome rather
 * than a placeholder: the store also rejects a patch before touching a file.
 */
export type SettingsWriteFailure = 'writeDenied' | 'fileLocked' | 'diskFull' | 'unknown'

/**
 * Node puts the errno at the head of an fs error message (`ENOSPC: no space left on device,
 * write …`) and the preload has already removed Electron's channel framing, so the errno is what
 * survives into the renderer. Windows reports "another program holds this file open" as EPERM
 * about as often as EBUSY, so both land on the same notice.
 */
const ERRNO_FAILURES = new Map<string, SettingsWriteFailure>([
  ['EACCES', 'writeDenied'],
  ['EROFS', 'writeDenied'],
  ['EPERM', 'fileLocked'],
  ['EBUSY', 'fileLocked'],
  ['ENOSPC', 'diskFull'],
  ['EDQUOT', 'diskFull'],
])

/** An errno the notice has no specific cause for falls back to the generic save failure. */
export function settingsWriteFailure(error: unknown): SettingsWriteFailure {
  const message = error instanceof Error ? error.message : String(error)
  const errno = /\b([A-Z]{3,6}): /.exec(message)?.[1]
  return (errno === undefined ? undefined : ERRNO_FAILURES.get(errno)) ?? 'unknown'
}

/** A total map so a new failure has no copy until it is given one. */
export const SETTINGS_WRITE_FAILURE_KEYS: Record<SettingsWriteFailure, TranslationKey> = {
  writeDenied: 'errors.settingsWriteDenied',
  fileLocked: 'errors.settingsFileLocked',
  diskFull: 'errors.settingsDiskFull',
  unknown: 'errors.settingsSaveFailed',
}