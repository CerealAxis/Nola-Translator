import { statfsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Depth of the `ENOENT` walk-up in `freeBytesForDirectory`. Capped so it always terminates. */
const MAX_ANCESTOR_PROBES = 4

/**
 * Free space of the volume that would hold `directory`, or `undefined` when it cannot be read.
 *
 * `bavail * bsize`, not `bfree * bsize`: the difference is the blocks reserved for the system,
 * and a number the user cannot actually write into is the wrong thing to draw a "disk is full"
 * warning from.
 *
 * The directory usually does not exist yet — it is where models are *going* to be installed, and
 * on a fresh install nothing has been created. `statfsSync` throws `ENOENT` for a missing path, so
 * walk up to the nearest existing ancestor: a volume on Windows is flat, so every directory on
 * that drive reports the same `statfs` answer and an ancestor is a valid proxy for the child.
 */
export function freeBytesForDirectory(directory: string): number | undefined {
  let candidate = resolve(directory)
  for (let probe = 0; probe <= MAX_ANCESTOR_PROBES; probe += 1) {
    try {
      const stats = statfsSync(candidate)
      return stats.bavail * stats.bsize
    } catch {
      // Fall through to the parent; only the return value below reports failure.
    }
    const parent = dirname(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
  return undefined
}
