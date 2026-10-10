import { rename } from 'node:fs/promises'
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
