import { constants } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * `credentials.json` is the one file this migration refuses to carry over.
 *
 * The reason recorded here used to be that safeStorage binds its key to the app
 * identity — the userData path — so ciphertext from the old productName, another
 * machine, or another Windows user cannot be read again. That is right for the
 * macOS Keychain and Linux libsecret backends, where the key genuinely is bound
 * to the app and the account. It is **wrong for this Windows-only build**:
 * Electron's safeStorage there is DPAPI, whose key comes from the logon
 * credential on the machine and is not path-bound, so a renamed product or a
 * moved directory does not by itself invalidate the ciphertext. `get()` still
 * destroys any ciphertext it fails to decrypt (see `secure-store.ts`), so the
 * exclusion stays — the copy just carries no information either way.
 *
 * A sibling change now makes the *data root* migration carry this file
 * byte-for-byte instead (`data-migration.ts`), which is safe precisely because
 * the move is within one Windows account.
 */
export const MIGRATION_EXCLUDED_FILES = new Set(['credentials.json'])

/**
 * Best-effort copy of a whole directory tree, skipping files that already exist.
 *
 * Known limitations, deliberately left as they are: `COPYFILE_EXCL` treats any
 * existing destination file as done (a file truncated by a half-finished copy
 * is never re-copied), and the recursion has no depth bound and no symlink
 * handling, so a junction is silently dropped because `isFile()` and
 * `isDirectory()` are both false for one. This function serves its original
 * purpose — a one-shot sweep of a legacy directory that is never deleted, where
 * the worst case is a stale copy at the destination — so widening it here would
 * be churn. `data-migration.ts` does not reuse it: that module destroys the
 * source afterwards, so it stages every write and refuses links outright.
 */
export async function copyMissingFiles(source: string, destination: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true })
  await mkdir(destination, { recursive: true })
  for (const entry of entries) {
    if (MIGRATION_EXCLUDED_FILES.has(entry.name)) continue
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    if (entry.isDirectory()) {
      await copyMissingFiles(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
    }
  }
}

export async function migrateLegacyUserData(appData: string, userData: string): Promise<void> {
  const legacyUserData = join(appData, 'FluentCaptions')
  if (legacyUserData.toLowerCase() === userData.toLowerCase()) return
  // Nothing here may stop startup. This is called from the `whenReady` chain
  // (`index.ts`), where a rejection means the window never opens, and the only
  // thing at stake is a copy out of a legacy directory that this function never
  // deletes — so an EACCES or an EIO costs the user a stale import they can
  // retry, while aborting costs them the whole app. The catch is deliberately
  // wider than the `ENOENT` it used to special-case; `ENOENT` stays silent
  // because a fresh install legitimately has no legacy directory.
  await copyMissingFiles(legacyUserData, userData).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') console.error('legacy userData was not migrated, it is still at', legacyUserData, error)
  })
}
