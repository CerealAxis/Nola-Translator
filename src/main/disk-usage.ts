import { statfsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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
