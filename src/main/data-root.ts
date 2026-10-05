import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'

import { app } from 'electron'

/**
 * The app's own data — settings, credentials, meetings, models, runtimes — lives in ONE root, so
 * "where does this app store things" has a single answer and moving everything to another drive is
 * one setting instead of five.
 *
 * **Why this is deliberately not `app.setPath('userData', ...)`.** `userData` also holds everything
 * Chromium owns: `Cache`, `GPUCache`, `Code Cache`, `Local Storage`, `Preferences`, `Network`. All
 * of it is disposable, so relocating it would drag thousands of throwaway files into the install
 * directory and blur the line between "app data" and "browser state" — the very line the migration
 * has to reason about. Chromium state therefore stays in AppData and starts fresh; the data root
 * is a separate location that only this app's own stores resolve from.
 */

/** Pointer file, written next to the executable and only when the user overrides the root. */
const POINTER_FILE = 'data-location.json'

/** Shape version of the pointer file. See `writeDataRootPointer`. */
const POINTER_VERSION = 1

/**
 * The install directory, i.e. the parent of the `resources` directory. Two layouts, one rule,
 * discriminated on `app.isPackaged` — the flag this repo already uses for every other packaged/dev
 * path split (see `index.ts`):
 *
 *  - Packaged (`asar: true` in package.json): `<install>\Nola Translator.exe` sits next to
 *    `<install>\resources\app.asar`, so `dirname(app.getPath('exe'))` IS the install directory.
 *    `app.getAppPath()` alone is wrong here: it is `<install>\resources\app.asar`, which would put
 *    user data inside `resources` next to the bundled engine and llama binaries.
 *  - Dev: electron-vite runs `electron .` from the repo root, so `app.getAppPath()` is the repo
 *    root (it holds `package.json` and `out/`). The exe is
 *    `node_modules\electron\dist\electron.exe`, so `dirname(exe)` is the Electron *binary* folder,
 *    not the project.
 *
 * Sniffing for a sibling `resources` directory instead of branching on `isPackaged` looks
 * layout-agnostic but is not: `node_modules\electron\dist\resources` exists in dev too, so that
 * rule would resolve a dev run into the Electron binary folder.
 */
export function defaultDataRoot(): string {
  if (app.isPackaged) {
    try {
      return dirname(app.getPath('exe'))
    } catch (error) {
      // A path lookup must never take startup down. Falling through to `getAppPath()` is wrong for
      // a packaged build (`<install>\resources\app.asar`), but it is absolute and writable, and a
      // visible warning is better than a launch that never opens.
      console.warn('the exe path is unavailable; falling back to the app path for the data root', error)
    }
  }
  return app.getAppPath()
}

function dataLocationFile(): string {
  return join(defaultDataRoot(), POINTER_FILE)
}

/**
 * The user-chosen data root, or `null` when there is no usable pointer.
 *
 * **A corrupt pointer falls back to the default; it never throws.** This runs during startup,
 * before a window exists, so an unreadable or hand-edited file has to degrade to "the default
 * install" and still open the app. A missing or relative `dataRoot` must especially not slip
 * through: `join(undefined, 'models')` hands the Python engine the literal path `undefined\models`,
 * and a relative path would resolve against whatever the process cwd happens to be.
 */
export function readDataRootPointer(): string | null {
  const file = dataLocationFile()
  // Absent is the normal state, not a fault: the pointer is only written when the user overrides
  // the root, so a default install carries no extra file at all.
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
  // `version` is deliberately not enforced here: an unversioned (or newer) file still yields its
  // path, so a downgrade cannot strand the data behind a version check that fails.
  return normalize(candidate)
}

/**
 * The root an **existing** install already keeps its data in, or `null` when this is a fresh
 * install with nothing to keep.
 *
 * Before this module existed, every byte of app data lived in Electron's `userData`
 * (`settings.json`, `credentials.json`, `meetings/`, and — through `modelStoragePath`'s empty
 * default — `models/`, `cache/`, `runtimes/`). Switching the stores over to the data root without
 * this check would make every current user's meetings, settings and API keys vanish on upgrade:
 * the new root would be empty and the app would silently start over. Silently moving gigabytes of
 * their recordings at first launch is no better — an unattended copy that is interrupted halfway
 * leaves two half-populated roots and no way to tell which is authoritative.
 *
 * So an install that already holds data **keeps it where it is**. The install directory only becomes
 * the default for an install that has nothing yet. A user who wants the data elsewhere moves it
 * deliberately from the settings page, where they are watching, rather than having it happen to
 * them on a version bump.
 */
function existingUserDataRoot(): string | null {
  const userData = app.getPath('userData')
  for (const marker of ['settings.json', 'credentials.json', 'meetings']) {
    if (existsSync(join(userData, marker))) return userData
  }
  return null
}

/**
 * What the app resolves to when there is no pointer file — the second and third tiers of
 * `resolveDataRoot()` below.
 *
 * Exported because that answer is needed on its own, not only inside the resolve. When a migration
 * is cancelled for want of space, the entire point is to send the next launch back to the directory
 * that still holds the data, and whether that means *deleting* the pointer or *writing it back*
 * turns on this value alone (`index.ts`). Spelling the two tiers out a second time over there would
 * be a second copy of a rule that decides whether a user's settings and API keys are still
 * reachable, so the tiers live here and the resolve reads them.
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
 * Points the app at another data root. Throws on a relative path: that is a programming error
 * rather than a runtime condition, and the caller (a settings flow over a directory the user just
 * picked) has to hear about it instead of silently writing a pointer that `readDataRootPointer`
 * would reject on the next launch.
 *
 * `version` earns its place because the file lives next to an installed executable and outlives
 * both app upgrades and reinstalls: a future layout change needs to tell "written by an older
 * build" from "written by a newer one" rather than inferring it from which keys happen to be
 * present.
 *
 * Sync `node:fs` on purpose — this must be callable before `app.whenReady()`, where there is no
 * ready loop to await on, and a half-written pointer is worse than a failed one.
 */
export function writeDataRootPointer(root: string): void {
  if (!isAbsolute(root)) throw new Error('The data root must be an absolute path')
  const file = dataLocationFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ version: POINTER_VERSION, dataRoot: normalize(root) }, null, 2)}\n`, 'utf8')
}

/*
 * ── 待迁移标记 ────────────────────────────────────────────────────────
 *
 * 换数据根**不在用户点「浏览」的那一瞬间搬数据**，只写指针 + 标记，然后要求重启；
 * 真正的搬运发生在下一次启动、任何 store 打开句柄之前。
 *
 * 理由是句柄：那一刻会议库正持有录音文件，密钥库正持有 credentials.json，而一次搬迁
 * 要动几个 GB（`build/runtime-catalog.json` 声明运行时合计约 687 MB）。在运行中的进程里
 * 搬自己的文件，是把"迁移失败"和"边搬边被写入"绑在一起。启动时则没有任何句柄，而且
 * 中途断电只需要下次启动重跑一遍——`data-migration.ts` 的暂存+rename 拷贝设计正是为
 * 重复执行准备的。
 *
 * 标记放在**旧根**旁边、也就是指针旁边，而不是新根里：新根可能还不存在。
 */

const PENDING_MIGRATION_FILE = 'data-migration-pending.json'

/**
 * 标记读回来的样子：旧根 + 必须一起搬走的遗留目录。
 *
 * 是结构而不是一个字符串，因为启动时的迁移缺一不可：旧根决定"从哪儿搬、删谁的原件"，
 * 遗留目录（旧版 `modelStoragePath` 指的那个文件夹）决定"还有什么在正常遍历之外"。
 */
export type PendingDataMigration = {
  /** 旧数据根。 */
  from: string
  /** 落在数据根之外、也要一起搬走的遗留目录；没有就是空数组。 */
  extra: string[]
}

/**
 * 记下"下次启动要把 `from` 搬到当前数据根"，`extraSources` 是数据根之外、必须跟着走的遗留目录。
 *
 * 相对路径直接拒绝，同 `writeDataRootPointer`：`normalize` 和 `join` 都不会把相对路径变成绝对
 * 路径，而迁移的每一处都拿它去 `join`、去 `lstat`，一个按进程 cwd 解析的源目录只会把数据
 * 写进一个没人找得到的地方。
 */
export function writePendingDataMigration(from: string, extraSources: readonly string[] = []): void {
  if (!isAbsolute(from)) throw new Error('The migration source must be an absolute path')
  for (const extra of extraSources) {
    if (!isAbsolute(extra)) throw new Error('A legacy migration source must be an absolute path')
  }
  const file = join(defaultDataRoot(), PENDING_MIGRATION_FILE)
  mkdirSync(dirname(file), { recursive: true })
  // `extra` 无条件写出，哪怕它是空的：缺键和空数组在读侧同义（老标记没有这个键），
  // 写全了才能让"这是一次完整的记录"和"文件写了一半"在内容上就长得不一样。
  const marker = { version: POINTER_VERSION, from: normalize(from), extra: extraSources.map((extra) => normalize(extra)) }
  writeFileSync(file, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
}

/**
 * 读出待迁移的旧根和遗留目录；没有标记、或标记坏了，都返回 `null` —— 坏标记绝不能挡住启动。
 *
 * **老标记没有 `extra` 键，读回来是 `[]` 而不是失败。** 这个字段是后来才加的，那之前的
 * 标记文件此刻正躺在用户的安装目录里，把它判成损坏等于让一次升级把这些人永久卡在"标记
 * 损坏、下次启动不搬"上，而旧根本身是完全好的。
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
  // 一个手改坏的 `extra` 条目只该让那个遗留文件夹不跟着走，不该连一个完好的 `from` 一起作废：
  // 逐条判定、逐条告警，而不是让整个标记失败。
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
 * 迁移成功后清掉标记。
 *
 * **只在迁移确实成功时调用。** 标记留着只是下次启动再搬一遍（幂等），标记被清掉而数据还
 * 留在旧根，则用户永远不会再有人来搬它——所以失败路径绝不能走到这里。
 */
export function clearPendingDataMigration(): void {
  rmSync(join(defaultDataRoot(), PENDING_MIGRATION_FILE), { force: true })
}

/**
 * 撤销一次换根：删掉指针，让下一次启动回到默认/既有根。
 *
 * **存在的理由只有一个：目标盘装不下时的回退。** 迁移到一半撞上 ENOSPC 才是最坏的结果 ——
 * 旧根已经被删掉一部分，新根只搬进去一部分，而标记会让它每次启动再试一次，永远停在中间态。
 * 启动时的空间预检发现装不下，就该**整件事撤销**：删指针、清标记，应用照旧在旧根上启动，
 * 数据一根汗毛没动，用户腾出空间后重新选一次目录即可。
 *
 * `force: true`，指针不存在（本来就是默认安装）时不报错。
 *
 * **只在"没有指针时本来就会解析到旧根"时才删。** 旧根有三种来历，其中一种是用户之前就用指针
 * 选过的目录：那种情况下删掉指针就再没有任何东西指向那个装着会议记录和 API key 的文件夹了。
 * 判定交给 `fallbackDataRoot()`，见 `index.ts` 的取消分支。
 */
export function clearDataRootPointer(): void {
  rmSync(dataLocationFile(), { force: true })
}
