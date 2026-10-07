import { statfsSync } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** Depth of the `ENOENT` walk-up in `freeBytesForDirectory`. Bounds the number of ancestor probes. */
const MAX_ANCESTOR_PROBES = 4

/**
 * Free space of the volume that would hold `directory`, or `undefined` when it cannot be read.
 *
 * `bavail * bsize`, not `bfree * bsize`: the difference is blocks reserved for the system, and a
 * number the user cannot actually write into is the wrong thing to draw a "disk is full" warning
 * from.
 *
 * The directory usually does not exist yet — it is where models are *going* to be installed. So
 * `statfsSync` throws `ENOENT` and the walk climbs to the nearest existing ancestor. A sibling
 * directory on the same volume reports the same `statfs`, so an ancestor is a valid proxy — unless
 * the path crosses a junction or mount point, which can land on a different volume.
 */
export function freeBytesForDirectory(directory: string): number | undefined {
  let candidate = resolve(directory)
  for (let probe = 0; probe <= MAX_ANCESTOR_PROBES; probe += 1) {
    try {
      const stats = statfsSync(candidate)
      return stats.bavail * stats.bsize
    } catch {
      // Retry the parent; an exhausted walk returns undefined.
    }
    const parent = dirname(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
  return undefined
}

/**
 * Bytes occupied by everything under `directory`, or `undefined` when the folder itself cannot be
 * listed.
 *
 * Async and recursive: a data folder holding model weights is tens of thousands of files, and this
 * runs on every visit to the storage tab, so a synchronous walk would stall the main process for
 * as long as the scan takes.
 *
 * `undefined` is reserved for the root, which is what lets the UI tell "cannot read this folder"
 * apart from "this folder is empty". A subtree that cannot be listed is skipped rather than
 * failing the whole scan: models are downloaded and deleted while the app runs, so a file
 * vanishing between listing and stat is ordinary, and a slightly low total beats no total.
 *
 * `lstat`, and only regular files are counted. Following a symlink would walk a target out of the
 * tree — double-counting it when the target also lives inside the folder, or counting bytes on a
 * different volume entirely.
 */
export async function usedBytesForDirectory(directory: string): Promise<number | undefined> {
  let total = 0
  const walk = async (current: string, isRoot: boolean): Promise<boolean> => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return !isRoot
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), false)
        continue
      }
      if (!entry.isFile()) continue
      try {
        total += (await lstat(join(current, entry.name))).size
      } catch {
        // Gone between listing and stat; it contributes nothing.
      }
    }
    return true
  }
  return (await walk(resolve(directory), true)) ? total : undefined
}
