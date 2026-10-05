import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * Every path the app owns inside a data root, in a stable order.
 *
 * This allowlist is the entire safety property of the delete step, so it is
 * spelled out rather than derived: when the data root is the default install
 * directory, `resources/**` (app.asar, the bundled Python engine, llama.cpp,
 * runtime-catalog.json, runtime-recipes.json, runtime/extract-runtime.ps1) and
 * the `*.exe` / `*.dll` / `Uninstall*.exe` / `Update.exe` sit right next to
 * these entries, and deleting the old root as a tree would uninstall the
 * running application. Nothing may be added here without proving it is app
 * data; Chromium's own state under Electron `userData` (`Cache`, `GPUCache`,
 * `Local Storage`, `Preferences`) is deliberately not in it because it belongs
 * to the Electron profile, not to us.
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

/** The one allowlisted file that gets rewritten instead of copied, and the only field inside it that can point at the old root. */
const SETTINGS_ENTRY = 'settings.json'
const MODEL_STORAGE_PATH_FIELD = 'modelStoragePath'

/**
 * Staging suffix for every copy and for the settings rewrite.
 *
 * Deterministic so a staging file left behind by a killed migration is easy to
 * find, and removed on the failure path so a clean run never accumulates them.
 * Staging must live beside the target: `rename` cannot cross a volume, and a
 * data root change can move between drives.
 */
const STAGING_SUFFIX = '.nola-migration'

/** Depth cap for the directory walk. A runtimes or `cache/tmp` tree is shallow; past this the entry fails instead of walking forever. */
const MAX_WALK_DEPTH = 16

export type DataRootMigrationReport = {
  /** Entries written at the destination by this call (or that `plan` would write). */
  copied: string[]
  /** Absent at the source, or already identical at the destination. */
  skipped: string[]
  /** Present at the source, but the copy threw. These are never deleted. */
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
   * The root this entry is read from: the data root itself, or a legacy folder the pending marker
   * named. The copy follows this field rather than the `from` argument, and so does the delete step —
   * which is what makes "moved" mean the same thing for both: an entry lands at the destination and
   * then leaves its origin, whichever origin that was.
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
 * Whether `child` is `parent` or sits below it.
 *
 * Case-insensitive because this is a Windows-only build and the existing legacy
 * migration compares roots the same way (`legacy-migration.ts`); on a
 * case-sensitive volume this would only ever make the check *more* eager, which
 * fails towards refusing a migration rather than towards deleting one.
 *
 * Exported so `app-ipc.ts` can ask "is this legacy `modelStoragePath` inside the data root" by the
 * same rule. A second, hand-written copy of path containment is how one folder gets classified as
 * "somewhere else" by the code that records it and as "inside the data root" by the code that
 * moves it — and the entry is then copied twice over, or not at all.
 */
export function isSameOrInside(parent: string, child: string): boolean {
  const from = resolve(parent).toLowerCase()
  const target = resolve(child).toLowerCase()
  if (from === target) return true
  return target.startsWith(from.endsWith(sep) ? from : from + sep)
}

/**
 * List every regular file below `root`, with its size.
 *
 * Throws on a symlink or junction rather than skipping it. A link is not
 * something this app writes, and `lstat` semantics mean a link inside
 * `runtimes/` or `cache/` would otherwise be invisible: `isFile()` and
 * `isDirectory()` are both false for one, so the copy would silently drop it
 * and — worse — the delete step would not know it is there. Refusing the whole
 * entry keeps the rule simple: an entry is either fully accounted for, or it
 * is left alone at the source.
 */
async function walkFiles(root: string, prefix: string, depth: number): Promise<WalkedFile[]> {
  if (depth > MAX_WALK_DEPTH) throw new Error(`directory nesting exceeds ${MAX_WALK_DEPTH} levels`)
  const files: WalkedFile[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name)
    // lstat, not the dirent type: this walk decides what may later be deleted
    // from the source, and on Windows a junction is the one reparse point that
    // a copy would happily follow out of the root.
    const stats = await lstat(child)
    if (stats.isSymbolicLink()) throw new Error('symbolic link or junction is not app data')
    const relative = prefix ? join(prefix, entry.name) : entry.name
    if (stats.isDirectory()) files.push(...(await walkFiles(child, relative, depth + 1)))
    // A file entry is reported by its own `lstat`, so the `isFile()` branch
    // here only covers members of a directory. Sockets and FIFOs are neither
    // app data nor something this app creates, and are ignored on purpose.
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
 * A single file is compared byte for byte, never by size. `credentials.json` is
 * the reason: `secure-store.ts`'s `get()` deletes the ciphertext before it
 * throws when decryption fails, so a size-equal but different credentials file
 * is not a harmless miss — it is the user's API keys, gone for good. Proving
 * the bytes match is what makes deleting the source copy safe.
 *
 * A directory is compared by member name and size. The residual is a member
 * that differs *and* has the same length, which needs corruption to line up;
 * the trade is deliberate because byte-comparing `models/` and `runtimes/`
 * would mean reading ~687 MB twice to save a case that a later run self-heals
 * (the entry is recopied, never deleted, until it matches).
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
 * Split out so the data root and a legacy folder are read by identical rules. An entry that one
 * root refuses — a junction, a tree past the depth cap — has to be refused everywhere, or the move
 * would keep walking past the first refusal until some other root happened to answer, and the
 * result would depend on which folder the user happened to have pointed `modelStoragePath` at.
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
 * Every direction of the module's existing overlap rule, applied to a third path: a legacy folder
 * that is the destination or sits inside it would be walked while it was being written to, and
 * **one that *contains* the destination** would make `survey` read the destination's own files back
 * out of an allowlisted entry and charge them to the precheck — the same "a root inside itself"
 * hazard the primary pair is refused for, in the other direction. A legacy folder that is the
 * primary source (or sits inside it) could only ever re-read bytes the data root already provides.
 * Everything else is left for `survey` to ask about one entry at a time.
 */
function usableExtraSources(from: string, to: string, extraSources: readonly string[]): string[] {
  return extraSources.filter((extra) => !isSameOrInside(to, extra) && !isSameOrInside(extra, to)
    && !isSameOrInside(from, extra) && !isSameOrInside(extra, from))
}

/**
 * Measure every allowlisted entry without writing anything.
 *
 * Shared by `planDataRootMigration` and `migrateDataRoot` so the byte total the
 * caller prechecks free space against is the same number the copy will move,
 * and so a single walk is not paid for twice.
 *
 * **The data root is the source of record for every entry.** A legacy folder from the
 * marker is consulted only for an entry the data root does not provide — absent, or
 * unreadable — and is never merged with the data root's own copy: two candidates for
 * one entry would leave "which of these is authoritative" unanswerable, and the data
 * root's is the one the app was actually running against.
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
      // First legacy folder that actually has this entry wins; the rest are not consulted, so two
      // legacy folders can never be merged into the destination either.
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
      // Reachable only when the data root itself is at fault: a legacy folder that is also at
      // fault is logged above and does not turn the entry into a failure, because the entry is
      // not going to be read from anywhere.
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
      // An identical entry is not counted against the destination's free space — nothing is
      // written for it — but it is still safe to delete afterwards. The exclusion has to happen
      // here, where `identical` is known, and not at the accumulation point: charging the bytes
      // anyway made a retried migration ask for the full size of `models/` and `runtimes/` again
      // after they had already been moved, so the retry that only had a few MB left to transfer
      // was cancelled for "not enough space" and the user could never finish the move.
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
 * Write one file through a staging name.
 *
 * Interruption safety, which is the reason this is not `copyFile` straight to
 * the target: a file truncated by a half-finished copy *exists*, so an
 * exists-check would treat it as done and the app would go on running against
 * corrupt data. Staging and renaming means the target path is only ever
 * created complete — an interrupted migration leaves a `.nola-migration` file
 * beside it and the next run recopies from scratch. `copyFile` itself copies
 * raw bytes, which is what keeps `credentials.json` decryptable: it is never
 * parsed and re-serialised, because Electron's `safeStorage` on Windows is
 * DPAPI, bound to the logon credential rather than to the path, and
 * `secure-store.ts` permanently drops any ciphertext it fails to read.
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
 * Clear the absolute `modelStoragePath` in the destination's `settings.json`.
 *
 * Every other entry is a byte copy; this one field is not, because it is
 * absolute. Carried verbatim it keeps `models/` and `runtimes/` pinned to the
 * old root (`index.ts` builds the runtime directory from
 * `initialSettings.modelStoragePath || userData`), so the app would keep writing
 * to the directory it is being moved out of. Rewriting is atomic — staging file
 * plus `rename`, matching `SettingsStore.persist` — so an interrupted migration
 * cannot leave a half-written settings file that boots with no configuration.
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
 * Copying a root into itself would walk into the copy, and moving one into its
 * own subdirectory would delete the tree it is walking. Neither is recoverable,
 * so the answer is a report the caller can show, not an exception.
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
 * The caller needs `requiredBytes` before committing: `build/runtime-catalog.json`
 * declares roughly 687 MB of downloadable runtimes, so the destination's free
 * space has to be checked against this number first.
 *
 * `extraSources` are the legacy folders the pending marker recorded (see `data-root.ts`).
 * They are measured on the same terms as the data root, so the precheck covers every
 * byte the copy will really write and not just the ones still living in the data root.
 */
export async function planDataRootMigration(from: string, to: string, extraSources: readonly string[] = []): Promise<DataRootMigrationReport> {
  if (isSameOrInside(from, to) || isSameOrInside(to, from)) return refusedReport(from, to)
  return (await survey(from, to, extraSources)).report
}

/**
 * Copy the allowlist to the new root, rewrite `settings.json`, then delete the
 * source entries.
 *
 * Per-entry failures are reported rather than thrown: one unreadable entry must
 * not cost the user the other six. The caller reads `failed` and `removed` to
 * tell the user what moved and what did not.
 *
 * `extraSources` are the legacy folders the pending marker recorded: an entry the data
 * root does not have is read from the first of them that does, and it leaves that folder
 * on the same terms as everything else — copied, then removed from wherever it was found.
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
      // Moved to `failed` from `copied` so the delete step below skips it, and
      // a settings rewrite that could not be applied counts as a failure: the
      // copy is in place but still points at the old root.
      report.copied = report.copied.filter((entry) => entry !== name)
      report.failed.push(name)
      console.error('data root entry could not be copied, it stays at the source', join(plan.source, name), error)
    }
  }

  // The delete rule, and the only part of this module that destroys anything:
  // delete the allowlisted entries one by one, and only the ones that are now
  // present at the destination — never the tree at `from`, and never an entry
  // that failed. A blanket `rm(from, { recursive: true })` would be the one
  // change that can delete `resources/app.asar`, the bundled engine, llama.cpp
  // and the NSIS uninstaller, because the default data root *is* the install
  // directory. An empty directory shell at a user-chosen old root is left in
  // place on purpose: it may hold files that are not ours, and there is no way
  // to tell, so the caller decides what to do with it.
  //
  // `copied` plus the entries the destination already held. An entry that was
  // merely absent at the source is in neither set, so it is never reported as
  // removed — nothing was there to remove.
  //
  // **每个条目都从它真正的来源删**（`plan.source`），数据根与旧 `modelStoragePath` 目录一视同仁：
  // 搬完就删是这次搬家该有的语义——旧目录里剩下的那几个 GB 如果没人删，就等于这个功能只完成了一半，
  // 而设置页还写着"设置、会议、模型和运行时都在这个文件夹里"。"搬完才删"的安全前提与主来源那条
  // 完全相同：目标端已经完整落地（`copyFile` + `rename` 之后），且这一条目没有失败。
  //
  // 遗留目录能这样删，靠的是 `usableExtraSources` 已经把"等于或落在 `to` / `from` 里、以及**包含**
  // `to` 或 `from`"的目录全部剔掉：剩下的任何一个来源，都不可能因为删掉白名单里的一个条目而碰到
  // 这次搬运正在写入的那棵树。目录本身照旧只留空壳，不整棵删：里面可能有不是我们的文件。
  const settled = new Set<string>(report.copied)
  for (const [name, plan] of plans) if (plan.identical) settled.add(name)
  for (const name of DATA_ROOT_ENTRIES) {
    const plan = plans.get(name)
    if (!plan || !settled.has(name)) continue
    try {
      await rm(join(plan.source, name), { recursive: true, force: true })
      report.removed.push(name)
    } catch (error) {
      // A locked file (a runtime still mapped by a running engine) leaves a
      // duplicate behind rather than losing data, so this is reported and not thrown.
      report.failed.push(name)
      console.error('data root entry was copied but could not be removed from its old location', join(plan.source, name), error)
    }
  }
  // There is no migration UI to say any of this: it runs before the window exists, and the storage
  // page only learns the new root at the next launch. The console is the one place a user can find
  // out that several GB came out of a folder the app no longer references, so name the entries, the
  // folder they came from, and whether they are gone — that is the difference between "the old drive
  // is free now" and "did this just eat my models".
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
