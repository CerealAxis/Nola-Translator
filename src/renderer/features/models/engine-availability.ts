import type { RuntimeSnapshot } from '../../../shared/compute'
import type { InferenceEngine } from '../../../shared/model-engines'

/** Keep a still-loading runtime snapshot neutral; only a confirmed missing loader disables an engine. */
export function isEngineAvailable(engine: InferenceEngine, local: RuntimeSnapshot['local'] | null): boolean {
  if (!local) return true
  const component = engine === 'pytorch' ? local.engine : engine === 'llama' ? local.llama : local.crisp
  return component?.status === 'ready'
}
