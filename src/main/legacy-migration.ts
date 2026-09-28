import { constants } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * safeStorage 的密钥绑定在应用身份（userData 路径）上：改 productName、换电脑、
 * 换 Windows 用户都会让旧密文失效，而密钥无从恢复。跨身份搬 credentials.json
 * 只会搬来一份读不出的密文，让 startSession 每次都抛解密错误——迁移时直接丢弃。
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
