import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'

import { app } from 'electron'

/**
 * All app-owned data — settings, credentials, meetings, models, runtimes — lives in ONE root, so
 * "where does this app store things" has a single answer and relocating it is one setting.
 */

/** Pointer file, written next to the executable and only when the user overrides the root. */
const POINTER_FILE = 'data-location.json'

/** Shape version of the pointer file. See `writeDataRootPointer`. */
const POINTER_VERSION = 1

/**
 * The install root: the folder holding `App\` (the program) and `Data\` (user data).
 *
 * Packaged, `dirname(app.getPath('exe'))` is `...\App`, so the root is one level up. In dev the exe
 * is the Electron binary inside `node_modules\electron\dist`, where that parent is meaningless —
 * there the app root is the repository and the two subfolders do not exist.
 */
export function defaultDataRoot(): string {
  if (app.isPackaged) {
    try {
      return join(dirname(app.getPath('exe')), '..', 'Data')
    } catch (error) {
      // A path lookup must never take startup down; `getAppPath()` is absolute and writable even
      // though it is the wrong directory for a packaged build, and a warning beats a dead launch.
      console.warn('the exe path is unavailable; falling back to the app path for the data root', error)
    }
  }
  return app.getAppPath()
}

function dataLocationFile(): string {
  return join(defaultDataRoot(), POINTER_FILE)
}

/**
 * The user-chosen data root, or `null` when there is no usable pointer. An unreadable or
 * hand-edited pointer degrades to the default instead of throwing: this runs before a window
 * exists and the app still has to open. A relative `dataRoot` is rejected for the same reason — it
 * would resolve against whatever the process cwd happens to be.
 */
export function readDataRootPointer(): string | null {
  const file = dataLocationFile()
  // Absent is the normal state, not a fault: the pointer is written only when the user overrides the root.
  if (!existsSync(file)) return null
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
 * already uses, and finally the install directory for a fresh install.
 */
export function resolveDataRoot(): string {
  return readDataRootPointer() ?? fallbackDataRoot()
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
}

/**
 * Records "move `from` to the current data root at the next startup", where `extraSources` are
 * legacy directories outside the root that must come along. The settings handler writes a pointer
 * and this marker and moves nothing: the move runs at the next startup, before any store opens a
 * handle, the one moment nothing is open. Relative paths are rejected as in
 * `writeDataRootPointer` — `normalize` and `join` never make one absolute.
 */
export function writePendingDataMigration(from: string, extraSources: readonly string[] = []): void {
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
  const marker = { version: POINTER_VERSION, from: normalize(from), extra: extraSources.map((extra) => normalize(extra)) }
  writeFileSync(file, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
}

/**
 * The pending old root and its legacy directories, or `null` when there is no marker or the marker
 * is bad — a bad marker must never block startup. A marker written before `extra` existed must
 * read as `[]` rather than corruption, or an upgrade strands users whose old root is perfectly
 * good.
 */
export function readPendingDataMigration(): PendingDataMigration | null {
  const file = join(defaultDataRoot(), PENDING_MIGRATION_FILE)
  if (!existsSync(file)) return null
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
  return { from: normalize(candidate), extra: extra.map((value) => normalize(value)) }
}

/**
 * Clears the marker. Call only after a successful move: a leftover marker just runs the copy
 * again, while a cleared one leaves the old root with nothing ever coming back for it.
 */
export function clearPendingDataMigration(): void {
  rmSync(join(defaultDataRoot(), PENDING_MIGRATION_FILE), { force: true })
}

/**
 * Undoes a data-root change so the next launch falls back. Exists for the ENOSPC case only: the
 * sole call site is inside the `required > available` branch in `index.ts`.
 */
export function clearDataRootPointer(): void {
  rmSync(dataLocationFile(), { force: true })
}
