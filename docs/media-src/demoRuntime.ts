import catalog from '../../build/runtime-catalog.json'
import recipes from '../../build/runtime-recipes.json'
import { runtimePackageSchema, runtimeRecipeSchema } from '../../src/shared/compute'
import type { ComputeSnapshot, RuntimeSnapshot } from '../../src/shared/compute'

/** Catalog choices are real; installed state and hardware are fictional demo data. */
export function createDemoRuntime(): RuntimeSnapshot {
  const packages = catalog.packages.map(value => ({ ...runtimePackageSchema.parse(value), installed: false }))
  const choices = recipes.recipes.map(value => ({ ...runtimeRecipeSchema.parse(value), installed: false, available: true, reason: '' }))
  const engine = choices.find(value => value.backend === 'cpu')!
  const llama = packages.find(value => value.kind === 'llama' && value.backend === 'cpu')!
  engine.installed = true
  llama.installed = true
  return {
    packages, recipes: choices, hardware: { adapters: [], nvidiaDriver: null, notes: [] },
    recommendation: { engineId: engine.id, llamaId: llama.id, reasons: [] },
    local: {
      engine: { id: engine.id, path: 'Demo', status: 'ready', backend: engine.backend, version: engine.torchVersion, gpuAvailable: false, reason: '' },
      llama: { id: llama.id, path: 'Demo', status: 'ready', backend: llama.backend, version: llama.version, gpuAvailable: false, reason: '' },
      crisp: { id: 'bundled', path: 'Demo', status: 'ready', backend: 'cpu', version: '0.8.43', gpuAvailable: false, reason: '' },
    }, operation: null, lastError: null, directory: 'Demo',
  }
}

export const DEMO_COMPUTE: ComputeSnapshot = {
  devices: [{ id: 'cpu', name: 'CPU', backend: 'cpu', torchDevice: 'cpu', llamaDevice: 'cpu', llamaDeviceNative: 'cpu', totalMemoryMb: 0, freeMemoryMb: 0, integrated: false, stableId: true, recognition: true, translation: true, reason: '', score: 0 }],
  notes: [], torchVersion: '', activePlan: null,
}
