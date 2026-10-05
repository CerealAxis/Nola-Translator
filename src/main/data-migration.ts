import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Every path the app owns inside a data root, in a stable order.
 *
 * The entire safety property of the delete step: the default data root is the install directory,
 * where `resources/**` (app.asar, the bundled Python engine, llama.cpp) and the NSIS uninstaller
 * sit beside these entries, so a tree delete would uninstall the app.
 */
export const DATA_ROOT_ENTRIES: readonly string[] = [
  'settings.json',
  'credentials.json',
  'history.jsonl',
  'meetings',
  'models',
  'cache',
  'runtimes',
]

/**
 * The one allowlisted file that is rewritten rather than byte-copied, and the only field in it that
 * can point at the old root.
 */
const SETTINGS_ENTRY = 'settings.json'
const MODEL_STORAGE_PATH_FIELD = 'modelStoragePath'

/**
 * Staging suffix for every copy and for the settings rewrite, removed again on the failure path.
 *
 * Staging must live beside the target: `rename` cannot cross a volume, and a data root change can
 * move between drives.
 */
const STAGING_SUFFIX = '.nola-migration'

/** Depth cap for the directory walk; past it the entry fails rather than walking forever. */
const MAX_WALK_DEPTH = 16

export type DataRootMigrationReport = {
  /** Entries written at the destination by this call (or that `plan` would write). */
  copied: string[]
  /** Absent at the source, or already identical at the destination. */
  skipped: string[]
  /** Read, copy or removal failed, so the entry stays where it is and is never deleted. */
  failed: string[]
  /** Entries removed from the source afterwards. */
  removed: string[]
  /** Bytes that had to be copied, for the destination's free-space precheck. Undefined when the roots were refused. */
  requiredBytes?: number
}

/** One regular file below an entry root. `relative` is `''` when the entry is itself the file. */
type WalkedFile = { relative: string; bytes: number }

type EntryPlan = {
  name: string
  /**
   * The root this entry is read from: the data root, or a legacy folder the pending marker named.
   * Both the copy and the delete step follow this field rather than the `from` argument, so "moved"
   * means the same thing for both: an entry lands at the destination and leaves its origin, whichever
   * origin that was.
   */
  source: string
  files: WalkedFile[]
  /** The destination already holds the same content, so a retry can skip the write. */
  identical: boolean
  bytes: number
}

type Survey = {
  report: DataRootMigrationReport
  plans: Map<string, EntryPlan>
}

function emptyReport(): DataRootMigrationReport {
  return { copied: [], skipped: [], failed: [], removed: [] }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : undefined
}

/**
 * Whether `child` is `parent` or sits below it. Exported so `app-ipc.ts` can ask the same question of a legacy `modelStoragePath` rather than hand-write a second containment check.
 *
 * Case-insensitive, matching how `legacy-migration.ts` compares roots; on a case-sensitive volume that only makes the check more eager, so it fails towards refusing a migration rather than deleting one.
 */
export function isSameOrInside(parent: string, child: string): boolean {
  const from = resolve(parent).toLowerCase()
  const target = resolve(child).toLowerCase()
  if (from === target) return true
  return target.startsWith(from.endsWith(sep) ? from : from + sep)
}

/**
 * List every regular file below `root`, with its size. Throws on a link rather than skipping it: a
 * junction is invisible to `isFile()` and `isDirectory()`, so the copy would drop it silently and the
 * delete step would never know it is there. An entry is either fully accounted for or left alone.
 */
async function walkFiles(root: string, prefix: string, depth: number): Promise<WalkedFile[]> {
  if (depth > MAX_WALK_DEPTH) throw new Error(`directory nesting exceeds ${MAX_WALK_DEPTH} levels`)
  const files: WalkedFile[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name)
    // lstat, not the dirent type: the delete step acts on this walk, and a junction is the one reparse
    // point a copy would follow straight out of the root.
    const stats = await lstat(child)
    if (stats.isSymbolicLink()) throw new Error('symbolic link or junction is not app data')
    const relative = prefix ? join(prefix, entry.name) : entry.name
    if (stats.isDirectory()) files.push(...(await walkFiles(child, relative, depth + 1)))
    // A member of a directory only, so a socket or FIFO falls through on purpose: it is not app data.
    else if (stats.isFile()) files.push({ relative, bytes: stats.size })
  }
  return files
}

/** Byte equality, for the entries small enough to hold in memory. */
async function sameBytes(left: string, right: string): Promise<boolean> {
  const [first, second] = await Promise.all([readFile(left), readFile(right)])
  return first.equals(second)
}

/**
 * Whether the destination already holds this entry's content.
 *
 * A single file is compared byte for byte, never by size: `secure-store.ts`'s `get()` deletes the ciphertext before it throws, so a size-equal but different `credentials.json` is keys already lost, and only matching bytes make deleting the source copy safe.
 *
 * A directory is compared by member name and size; the residual is a member that differs and has the same length, and ruling that out byte-wise would mean reading `runtimes/` (roughly 687 MB) a second time to save a case a later run self-heals.
 */
async function destinationHolds(source: string, destination: string, files: WalkedFile[], isSingleFile: boolean): Promise<boolean> {
  if (isSingleFile) return sameBytes(join(source, files[0]?.relative ?? ''), join(destination, files[0]?.relative ?? '')).catch(() => false)
  const existing = await walkFiles(destination, '', 0).catch(() => null)
  if (!existing || existing.length !== files.length) return false
  const sizes = new Map(existing.map((file) => [file.relative, file.bytes]))
  return files.every((file) => sizes.get(file.relative) === file.bytes)
}

/** What reading one allowlisted entry at one root produced. The error is kept so it can be logged where it matters. */
type EntryRead =
  | { state: 'ok'; files: WalkedFile[]; isSingleFile: boolean }
  /** Not there, or not a file and not a directory: nothing to copy, and nothing of ours to delete. */
  | { state: 'absent' }
  | { state: 'fault'; error: unknown }

/**
 * `lstat` one entry root, and walk it when it is a directory.
 *
 * Shared with the legacy-folder read so both are held to identical rules: an entry one root refuses has
 * to be refused everywhere, or the move depends on which folder `modelStoragePath` happened to name.
 */
async function readEntry(root: string): Promise<EntryRead> {
  try {
    const stats = await lstat(root)
    if (stats.isSymbolicLink()) throw new Error('symbolic link or junction is not app data')
    if (stats.isFile()) return { state: 'ok', files: [{ relative: '', bytes: stats.size }], isSingleFile: true }
    if (stats.isDirectory()) return { state: 'ok', files: await walkFiles(root, '', 0), isSingleFile: false }
    return { state: 'absent' }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { state: 'absent' }
    return { state: 'fault', error }
  }
}

/**
 * The legacy folders this move may actually read from.
 *
 * Every direction of the overlap rule, applied to a third path: one that is or contains the destination would make `survey` read the destination's own files back out of an allowlisted entry and charge them to the precheck; one that overlaps the primary source could only re-read bytes the data root already provides.
 */
function usableExtraSources(from: string, to: string, extraSources: readonly string[]): string[] {
  return extraSources.filter((extra) => !isSameOrInside(to, extra) && !isSameOrInside(extra, to)
    && !isSameOrInside(from, extra) && !isSameOrInside(extra, from))
}

/**
 * Measure every allowlisted entry without writing anything. The total is the number the copy will move, so the caller's precheck and the copy cannot disagree.
 *
 * The data root is the source of record for every entry. A legacy folder is consulted only for an entry the data root does not provide, and never merged with it: two candidates for one entry leave "which of them is authoritative" unanswerable.
 */
async function survey(source: string, to: string, extraSources: readonly string[]): Promise<Survey> {
  const report = emptyReport()
  const plans = new Map<string, EntryPlan>()
  const extras = usableExtraSources(source, to, extraSources)
  let requiredBytes = 0
  for (const name of DATA_ROOT_ENTRIES) {
    const origin = join(source, name)
    const primary = await readEntry(origin)
    if (primary.state === 'fault') {
      console.error('data root entry could not be read, it stays at the source', origin, primary.error)
    }
    let read = primary
    let entrySource = source
    if (primary.state !== 'ok') {
      // First legacy folder that has the entry wins; the rest are never consulted, so two legacy folders cannot merge into the destination either.
      for (const extra of extras) {
        const candidate = await readEntry(join(extra, name))
        if (candidate.state === 'ok') {
          read = candidate
          entrySource = extra
          console.warn(`data root entry ${name} is not in the data root; it is taken from the legacy folder ${extra}`)
          break
        }
        if (candidate.state === 'fault') {
          console.error('a legacy data root entry could not be read, it is not used', join(extra, name), candidate.error)
        }
      }
    }
    if (read.state === 'absent') {
      if (primary.state === 'fault') report.failed.push(name)
      else report.skipped.push(name)
      continue
    }
    if (read.state === 'fault') {
      // Reachable only when the data root itself is at fault: a faulted legacy folder is logged above and ignored, because the entry will not be read from anywhere.
      report.failed.push(name)
      continue
    }
    const files = read.files
    const entryOrigin = join(entrySource, name)
    const bytes = files.reduce((total, file) => total + file.bytes, 0)
    let identical = false
    try {
      identical = await destinationHolds(entryOrigin, join(to, name), files, read.isSingleFile)
    } catch (error) {
      console.error('data root entry could not be compared with the destination, it will be copied', entryOrigin, error)
    }
    const plan: EntryPlan = { name, files, identical, bytes, source: entrySource }
    plans.set(name, plan)
    if (identical) {
      // Not charged against the destination's free space, since nothing is written for it, but still safe to delete afterwards.
      report.skipped.push(name)
    } else {
      requiredBytes += bytes
      report.copied.push(name)
    }
  }
  report.requiredBytes = requiredBytes
  return { report, plans }
}

/**
 * Write one file through a staging name, so the target path only ever appears complete: an interrupted
 * copy would otherwise leave a truncated file where the app expects whole content.
 *
 * `copyFile` copies raw bytes, which is what keeps `credentials.json` decryptable — never parsed and
 * re-serialised, because Windows `safeStorage` is DPAPI, bound to the logon credential, not the path.
 */
async function copyThroughStaging(origin: string, target: string): Promise<void> {
  const staging = `${target}${STAGING_SUFFIX}`
  await mkdir(dirname(target), { recursive: true })
  try {
    await copyFile(origin, staging)
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Clear the absolute `modelStoragePath` in the destination's `settings.json`, the only field there that can point at the old root.
 *
 * Carried verbatim it pins `models/` and `runtimes/` to the old root (`index.ts` derives the runtime directory from `initialSettings.modelStoragePath || dataRoot`). The rewrite is atomic, like `SettingsStore.persist`, so an interruption cannot leave a file that boots with no configuration.
 */
async function clearModelStoragePath(settingsPath: string): Promise<void> {
  const parsed: unknown = JSON.parse(await readFile(settingsPath, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings.json is not an object')
  const record = parsed as Record<string, unknown>
  const current = record[MODEL_STORAGE_PATH_FIELD]
  // Rewriting an already-empty value would only reformat the file.
  if (typeof current !== 'string' || current === '') return
  record[MODEL_STORAGE_PATH_FIELD] = ''
  const staging = `${settingsPath}${STAGING_SUFFIX}`
  try {
    await writeFile(staging, JSON.stringify(record, null, 2), 'utf8')
    await rename(staging, settingsPath)
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Refuse roots that are the same directory or nested in each other.
 *
 * Copying a root into itself would walk into the copy, and moving one into its own subdirectory would
 * delete the tree being walked. The answer is a report the caller can show, not an exception.
 */
function refusedReport(from: string, to: string): DataRootMigrationReport {
  console.error('data root migration refused: the source and destination roots overlap', { from, to })
  const report = emptyReport()
  report.failed.push(...DATA_ROOT_ENTRIES)
  return report
}

/**
 * Measure a root change without writing anything.
 *
 * The caller prechecks free space against `requiredBytes`, and `build/runtime-catalog.json` declares roughly 687 MB of downloadable runtimes, so a destination that cannot hold them is refused before anything is written. `extraSources` are the legacy folders the pending marker recorded (`data-root.ts`), measured on the same terms.
 */
export async function planDataRootMigration(from: string, to: string, extraSources: readonly string[] = []): Promise<DataRootMigrationReport> {
  if (isSameOrInside(from, to) || isSameOrInside(to, from)) return refusedReport(from, to)
  return (await survey(from, to, extraSources)).report
}

/**
 * Copy the allowlist to the new root, rewrite `settings.json`, then delete the source entries.
 *
 * Per-entry failures are reported rather than thrown: one unreadable entry must not cost the user the
 * other six, and the caller reads `failed` and `removed` to tell the user what moved and what did not.
 */
export async function migrateDataRoot(from: string, to: string, extraSources: readonly string[] = []): Promise<DataRootMigrationReport> {
  if (isSameOrInside(from, to) || isSameOrInside(to, from)) return refusedReport(from, to)
  const { report, plans } = await survey(from, to, extraSources)

  for (const name of DATA_ROOT_ENTRIES) {
    const plan = plans.get(name)
    if (!plan) continue
    if (plan.identical) continue
    try {
      await mkdir(to, { recursive: true })
      for (const file of plan.files) {
        await copyThroughStaging(join(plan.source, name, file.relative), join(to, name, file.relative))
      }
      if (name === SETTINGS_ENTRY) await clearModelStoragePath(join(to, name))
    } catch (error) {
      // Dropped from `copied` so the delete step skips it; a settings rewrite that could not be applied counts as a failure, because the copy in place still points at the old root.
      report.copied = report.copied.filter((entry) => entry !== name)
      report.failed.push(name)
      console.error('data root entry could not be copied, it stays at the source', join(plan.source, name), error)
    }
  }

  // The only code here that destroys anything: allowlisted entries one by one, only those now present at
  // the destination, never the tree at `from`, never a failed entry. Always from `plan.source`, so a legacy
  // folder loses an entry exactly as the data root does — safe only because `usableExtraSources` already
  // dropped every folder overlapping either root. The old root's shell stays behind: it may hold files that
  // are not ours. An entry merely absent at the source is in neither `copied` nor identical, so it is never
  // reported as removed.
  const settled = new Set<string>(report.copied)
  for (const [name, plan] of plans) if (plan.identical) settled.add(name)
  for (const name of DATA_ROOT_ENTRIES) {
    const plan = plans.get(name)
    if (!plan || !settled.has(name)) continue
    try {
      await rm(join(plan.source, name), { recursive: true, force: true })
      report.removed.push(name)
    } catch (error) {
      // A locked file (a runtime still mapped by a running engine) leaves a duplicate behind rather than losing data, so this is reported, not thrown.
      report.failed.push(name)
      console.error('data root entry was copied but could not be removed from its old location', join(plan.source, name), error)
    }
  }
  // There is no migration UI: this runs before the window exists, so the console is the only place a user can learn that several GB left a folder the app no longer references.
  const fromLegacy = [...plans.values()].filter((plan) => plan.source !== from)
  if (fromLegacy.length > 0) {
    console.log(
      'entries were moved out of a legacy folder; the folder itself is left in place',
      fromLegacy.map((plan) => ({
        entry: plan.name, legacyFolder: plan.source, bytes: plan.bytes, removed: report.removed.includes(plan.name),
      })),
    )
  }
  return report
}
