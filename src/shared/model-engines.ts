import type { ComputeSettings } from './compute'
import type { ResourceRecord } from './contracts'

export type InferenceEngine = 'pytorch' | 'llama' | 'crisp'
/** Compatibility follows the installed format and implemented loader, not the family name. */
export function modelEngines(model: Pick<ResourceRecord, 'provider'>): InferenceEngine[] {
  if (['crisp-asr', 'crisp-tts'].includes(model.provider)) return ['crisp']
  if (['qwen3-asr', 'sensevoice', 'm2m100', 'transformers-asr', 'transformers-causal', 'transformers-seq2seq', 'transformers-tts', 'index-translate-transformers', 'transformers', 'funasr'].includes(model.provider)) return ['pytorch']
  // `provider` arrives in two vocabularies: built-in Hy-MT2 reports `hymt2`, a hub GGUF passes
  // through its adapter id `llama.cpp`. Missing either yields an empty set with no error.
  if (['hymt2', 'llama.cpp', 'llama-asr', 'index-translate'].includes(model.provider)) return ['llama']
  return []
}
export function translationEngine(compute: ComputeSettings, provider?: string, modelId?: string): InferenceEngine {
  void compute
  const loader = provider ? modelEngines({ provider })[0] : undefined
  return loader === 'pytorch' || modelId === 'm2m100-418m' ? 'pytorch' : 'llama'
}
export function supportsSelectedEngine(model: Pick<ResourceRecord, 'provider' | 'kind'>, compute: ComputeSettings, modelId?: string): boolean {
  void compute
  void modelId
  return modelEngines(model).length > 0
}
