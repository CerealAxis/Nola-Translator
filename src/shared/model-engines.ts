import type { ComputeSettings } from './compute'
import type { ResourceRecord } from './contracts'

export type InferenceEngine = 'pytorch' | 'llama'
/** Compatibility follows the installed format and implemented loader, not the family name. */
export function modelEngines(model: Pick<ResourceRecord, 'provider'>): InferenceEngine[] {
  if (['qwen3-asr', 'sensevoice', 'm2m100', 'transformers', 'funasr'].includes(model.provider)) return ['pytorch']
  // `provider` arrives in two vocabularies: built-in Hy-MT2 reports `hymt2`, a hub GGUF passes
  // through its adapter id `llama.cpp`. Missing either yields an empty set with no error.
  if (['hymt2', 'llama.cpp'].includes(model.provider)) return ['llama']
  return []
}
export function translationEngine(compute: ComputeSettings, provider?: string, modelId?: string): InferenceEngine {
  if (compute.translationEngine !== 'auto') return compute.translationEngine
  return provider === 'm2m100' || modelId === 'm2m100-418m' ? 'pytorch' : 'llama'
}
export function supportsSelectedEngine(model: Pick<ResourceRecord, 'provider' | 'kind'>, compute: ComputeSettings, modelId?: string): boolean {
  return modelEngines(model).includes(model.kind === 'recognitionModel'
    ? compute.recognitionEngine : translationEngine(compute, model.provider, modelId))
}
