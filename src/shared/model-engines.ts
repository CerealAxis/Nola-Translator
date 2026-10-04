import type { ComputeSettings } from './compute'
import type { ResourceRecord } from './contracts'

export type InferenceEngine = 'pytorch' | 'llama'
/** Compatibility follows the installed format and implemented loader, not the family name. */
export function modelEngines(model: Pick<ResourceRecord, 'provider'>): InferenceEngine[] {
  if (['qwen3-asr', 'sensevoice', 'm2m100', 'transformers', 'funasr'].includes(model.provider)) return ['pytorch']
  // 两条路径的 provider 词汇不同：内置 Hy-MT2 由引擎报 `hymt2`（resources.py 的
  // ResourceDefinition），Hub 自装的 GGUF 则透传适配器 id `llama.cpp`（hub.py 的 adapter_id）。
  // 少写任何一个都不会报错，只会让这张表静默返回空集，把模型判成"哪个引擎都不支持"。
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
