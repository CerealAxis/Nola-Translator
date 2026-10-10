import { lstat, readdir, readFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

export async function renameRuntimeDirectory(source: string, destination: string): Promise<void> {
  // Windows can briefly retain native-library handles after a component probe exits.
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return }
    catch (error) {
      if (attempt === 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await setTimeout(250 * (attempt + 1))
    }
  }
}

/** Cleanup is restricted to children of the runtime root; junctions never grant recursive ownership. */
export async function removeRuntimeArtifact(directory: string, path: string): Promise<void> {
  const root = resolve(directory)
  const target = resolve(path)
  const child = relative(root, target)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('组件清理路径无效')
  const entry = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!entry || entry.isSymbolicLink()) return
  await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
}

/** Run after backup recovery, before any install starts. Unknown folders and selected components stay intact. */
export async function cleanupRuntimeArtifacts(directory: string, ids: readonly string[], python = false): Promise<void> {
  const names = await readdir(directory).catch(() => [] as string[])
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
  const knownIds = new Set(ids)
  // Installation markers retain ownership when a later release removes a legacy catalog entry.
  for (const name of names) {
    try {
      const entry = await lstat(join(directory, name))
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const marker = JSON.parse(await readFile(join(directory, name, 'runtime-installed.json'), 'utf8'))
      if (marker.id === name && ['python', 'llama'].includes(marker.kind)) knownIds.add(name)
    } catch { /* A folder name without an installation marker grants no cleanup ownership. */ }
  }
  for (const name of names) {
    let owned = python && ['wheel-cache', 'pip-temp'].includes(name)
    for (const id of knownIds) {
      if (name === `${id}-0.zip.partial` || name === `${id}-1.zip.partial` || name === `${id}-2.zip.partial`) owned = true
      for (const prefix of [`staging-${id}-`, `staging-${id}-dll-`]) {
        if (name.startsWith(prefix) && uuid.test(name.slice(prefix.length))) owned = true
      }
      const prefix = `backup-${id}-`
      if (name.startsWith(prefix) && uuid.test(name.slice(prefix.length))) {
        try {
          const [backup, current] = await Promise.all([
            readFile(join(directory, name, 'runtime-installed.json'), 'utf8'),
            readFile(join(directory, id, 'runtime-installed.json'), 'utf8'),
          ])
          const a = JSON.parse(backup), b = JSON.parse(current)
          if (a.id === id && b.id === id && a.kind === b.kind && ['python', 'llama'].includes(a.kind)) owned = true
        } catch { /* A missing replacement keeps the backup available for recovery. */ }
      }
    }
    if (owned) {
      await removeRuntimeArtifact(directory, join(directory, name)).catch(error => console.warn('runtime artifact cleanup failed', name, error))
    }
  }
}
