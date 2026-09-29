import { constants } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * safeStorage binds its key to the app identity, which is the userData path:
 * renaming productName, moving to another machine, or switching Windows users
 * all invalidate old ciphertext, and the key itself cannot be recovered.
 * Copying credentials.json across identities only imports ciphertext nobody
 * can read, so startSession would fail on every launch — the migration drops
 * the file instead.
 */
export const MIGRATION_EXCLUDED_FILES = new Set(['credentials.json'])

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
    if (error.code !== 'ENOENT') throw error
  })
}
