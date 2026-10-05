import { constants } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * `credentials.json` is the one file this migration refuses to carry over.
 *
 * On Windows, safeStorage is DPAPI: the key comes from the logon credential and
 * is not bound to the path or the product name, so a renamed product or a moved
 * directory does not by itself invalidate the ciphertext. The exclusion stays
 * because `get()` destroys any ciphertext it cannot decrypt (see
 * `secure-store.ts`), so a copy from another machine or another Windows user
 * carries no usable information.
 *
 * The data-root migration does carry this file byte-for-byte
 * (`data-migration.ts`), which is safe because that move stays within one
 * Windows account.
 */
export const MIGRATION_EXCLUDED_FILES = new Set(['credentials.json'])

/**
 * Best-effort copy of a whole directory tree, skipping files that already exist.
 *
 * Known limitations: `COPYFILE_EXCL` treats any existing
 * destination file as done, and the recursion has no depth bound and no symlink
 * handling, so a junction is silently dropped because `isFile()` and
 * `isDirectory()` are both false for one. The source is never deleted, so the
 * worst case is a stale copy at the destination. `data-migration.ts` does not
 * reuse this: that module destroys the source afterwards, so it stages every
 * write and refuses links outright.
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
  await copyMissingFiles(legacyUserData, userData).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') console.error('legacy userData was not migrated, it is still at', legacyUserData, error)
  })
}
