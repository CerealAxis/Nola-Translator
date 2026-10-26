import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'

import { app } from 'electron'

/**
 * All app-owned data — settings, credentials, meetings, models, runtimes — lives in ONE root, so
 * "where does this app store things" has a single answer and relocating it is one setting.
 */

/**
 * The product name used by the affected release’s fixed data directory.
 */
const PRODUCT_NAME = 'Nola Translator'

/** Pointer file, written under the data root and only when the user overrides the root. */
const POINTER_FILE = 'data-location.json'

/** Shape version of the pointer file. See `writeDataRootPointer`. */
const POINTER_VERSION = 1

let sessionDataRoot: string | null = null

/** Keep every consumer on the intact source after a failed startup migration; never persist it. */
export function setSessionDataRoot(root: string | null): void {
  if (root !== null && !isAbsolute(root)) throw new Error('The data root must be an absolute path')
  sessionDataRoot = root === null ? null : normalize(root)
}

/** Packaged data follows the actual executable; NSIS uses App/, flat installs do not. */
export function defaultDataRoot(): string {
  if (!app.isPackaged) return app.getAppPath()
  const programDirectory = dirname(app.getPath('exe'))
  const installRoot = basename(programDirectory).toLowerCase() === 'app'
    ? dirname(programDirectory) : programDirectory
  return join(installRoot, 'Data')
}

/** Compatibility source for the release that incorrectly fixed all data to LOCALAPPDATA. */
export function legacyDefaultDataRoot(): string | null {
  if (!app.isPackaged) return null
  const localAppData = process.env.LOCALAPPDATA ?? join(app.getPath('appData'), '..', 'Local')
  return join(localAppData, 'Programs', PRODUCT_NAME)
}

function dataLocationFile(): string {
  return join(defaultDataRoot(), POINTER_FILE)
}

/** The pointer location used by the affected fixed-location release. */
function legacyDataLocationFile(): string | null {
  const root = legacyDefaultDataRoot()
  if (root === null) return null
  const file = join(root, POINTER_FILE)
  return file === dataLocationFile() ? null : file
}

/**
 * The user-chosen data root, or `null` when there is no usable pointer. An unreadable or
 * hand-edited pointer degrades to the default instead of throwing: this runs before a window
 * exists and the app still has to open. A relative `dataRoot` is rejected for the same reason — it
 * would resolve against whatever the process cwd happens to be.
 */
export function readDataRootPointer(): string | null {
  const currentFile = dataLocationFile()
  const file = existsSync(currentFile) ? currentFile : legacyDataLocationFile()
  // Absent is the normal state, not a fault: the pointer is written only when the user overrides the root.
  if (file === null || !existsSync(file)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.warn(`the data root pointer ${file} is unreadable; using the default data root`, error)
    return null
  }
  const candidate = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).dataRoot : undefined
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) {
    console.warn(`the data root pointer ${file} has no absolute "dataRoot"; using the default data root`)
    return null
  }
  return normalize(candidate)
}

/**
 * The root an existing install already keeps its data in, or `null` for a fresh install.
 *
 * An install that already holds data keeps it where it is; the default root is for one that has
 * nothing yet. `models` and `runtimes` are markers alongside the settings files because a user who
 * has only downloaded a model — never recorded a meeting — still owns data worth finding.
 */
function existingUserDataRoot(): string | null {
  const userData = app.getPath('userData')
  for (const marker of ['settings.json', 'credentials.json', 'meetings', 'models', 'runtimes']) {
    if (existsSync(join(userData, marker))) return userData
  }
  return null
}

/**
 * The root when there is no pointer file — the second and third tiers of `resolveDataRoot()`.
 *
 * Exported because the cancellation branch in `index.ts` needs this answer on its own: whether it
 * deletes the pointer or writes it back turns on this value alone.
 */
export function fallbackDataRoot(): string {
  return existingUserDataRoot() ?? defaultDataRoot()
}

/**
 * The one data root. Synchronous and safe to call before `app.whenReady()`.
 *
 * Three tiers, in order: an explicit pointer the user wrote, the directory an existing install
 * already uses, and finally the actual installation’s Data folder for a fresh install.
 */
export function resolveDataRoot(): string {
  return readDataRootPointer() ?? sessionDataRoot ?? fallbackDataRoot()
}

/**
 * Points the app at another data root. Throws on a relative path: that is a programming error, and
 * a pointer `readDataRootPointer` would reject next launch hides it. `version` earns its place
 * because the file outlives upgrades and reinstalls. Sync `node:fs`: this has to be callable
 * before `app.whenReady()`, where there is no loop to await on.
 */
export function writeDataRootPointer(root: string): void {
  if (!isAbsolute(root)) throw new Error('The data root must be an absolute path')
  const file = dataLocationFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ version: POINTER_VERSION, dataRoot: normalize(root) }, null, 2)}\n`, 'utf8')
}

const PENDING_MIGRATION_FILE = 'data-migration-pending.json'

/**
 * A marker as read back: the old root, plus the legacy directories that must move with it. Both
 * parts are needed — the old root says where to copy from, the legacy directories name what sits
 * outside the root's normal walk.
 */
export type PendingDataMigration = {
  from: string
  /** Legacy directories outside the root that must move with it; absent means none. */
  extra: string[]
  /** All entries were copied; retries may delete the old copies but must never overwrite new data. */
  copied: boolean
}

/**
 * Records "move `from` to the current data root at the next startup", where `extraSources` are
 * legacy directories outside the root that must come along. The settings handler writes a pointer
 * and this marker and moves nothing: the move runs at the next startup, before any store opens a
 * handle, the one moment nothing is open. Relative paths are rejected as in
 * `writeDataRootPointer` — `normalize` and `join` never make one absolute.
 */
export function writePendingDataMigration(from: string, extraSources: readonly string[] = [], copied = false): void {
  if (!isAbsolute(from)) throw new Error('The migration source must be an absolute path')
  for (const extra of extraSources) {
    if (!isAbsolute(extra)) throw new Error('A legacy migration source must be an absolute path')
  }
  // The marker goes beside the pointer, under `defaultDataRoot()`, which ignores the pointer itself:
  // that is the one path still found after the pointer has been overwritten, and the new root may
  // not exist yet.
  const file = join(defaultDataRoot(), PENDING_MIGRATION_FILE)
  mkdirSync(dirname(file), { recursive: true })
  // `extra` is always written, even when empty, so a missing key reads as `[]`.
  const marker = { version: POINTER_VERSION, from: normalize(from), extra: extraSources.map((extra) => normalize(extra)), copied }
  // The completed-copy phase must survive interruption before source deletion starts.
  const temporary = `${file}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
    renameSync(temporary, file)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

/**
 * The pending old root and its legacy directories, or `null` when there is no marker or the marker
 * is bad — a bad marker must never block startup. A marker written before `extra` existed must
 * read as `[]` rather than corruption, or an upgrade strands users whose old root is perfectly
 * good.
 */
export function readPendingDataMigration(): PendingDataMigration | null {
  const currentFile = join(defaultDataRoot(), PENDING_MIGRATION_FILE)
  const legacyRoot = legacyDefaultDataRoot()
  const legacyFile = legacyRoot === null ? null : join(legacyRoot, PENDING_MIGRATION_FILE)
  const file = existsSync(currentFile) ? currentFile : legacyFile
  if (file === null || !existsSync(file)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.warn(`the pending data migration marker ${file} is unreadable; skipping the move`, error)
    return null
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const candidate = record.from
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) {
    console.warn(`the pending data migration marker ${file} has no absolute "from"; skipping the move`)
    return null
  }
  // One hand-edited `extra` entry drops that legacy folder, not the whole marker: a good `from` stays usable.
  const raw = Array.isArray(record.extra) ? record.extra : []
  const extra = raw.filter((value): value is string => {
    if (typeof value !== 'string' || !isAbsolute(value)) {
      console.warn(`the pending data migration marker ${file} has an unusable "extra" entry; it is ignored`)
      return false
    }
    return true
  })
  return { from: normalize(candidate), extra: extra.map((value) => normalize(value)), copied: record.copied === true }
}

/**
 * Clears the marker. Call only after a successful move: a leftover marker just runs the copy
 * again, while a cleared one leaves the old root with nothing ever coming back for it.
 */
export function clearPendingDataMigration(): void {
  rmSync(join(defaultDataRoot(), PENDING_MIGRATION_FILE), { force: true })
  const legacyRoot = legacyDefaultDataRoot()
  if (legacyRoot !== null) rmSync(join(legacyRoot, PENDING_MIGRATION_FILE), { force: true })
}

/**
 * Undoes a data-root change so the next launch falls back. Exists for the ENOSPC case only: the
 * sole call site is inside the `required > available` branch in `index.ts`.
 */
export function clearDataRootPointer(): void {
  rmSync(dataLocationFile(), { force: true })
  const legacyFile = legacyDataLocationFile()
  if (legacyFile !== null) rmSync(legacyFile, { force: true })
}
