import type { ComputeSettings, ComputeSnapshot } from '../../../shared/compute'
import type { ResourceRecord } from '../../../shared/contracts'
import type { InferenceEngine } from '../../../shared/model-engines'

export type ModelFit = 'recommended' | 'tryable' | 'notRecommended'

const MB = 1024 * 1024
const EXTRA_HEADROOM_MB = 1024

/** Mirrors the engine's planning estimate so the catalog does not promise a model the loader will reject. */
export function estimatedVramMb(record: Pick<ResourceRecord, 'provider' | 'downloadBytes' | 'installedBytes'>,
  engine: InferenceEngine, compute: ComputeSettings): number | null {
  const bytes = record.downloadBytes ?? record.installedBytes
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  const weightMb = bytes / MB
  let factor = 1
  if (record.provider === 'qwen3-asr' && engine === 'pytorch' && (compute.quantization === 'auto' || compute.quantization === 'nf4')) factor = 0.5
  else if (record.provider === 'qwen3-asr' && engine === 'pytorch' && compute.quantization === '8bit') factor = 0.75
  else if (compute.precision === 'fp32' && engine !== 'llama') factor = 2
  const overhead = engine === 'llama' ? 512 + compute.contextSize / 4 : 1024
  return Math.ceil(Math.max(256, weightMb * factor) + overhead)
}

function supportsGpu(device: ComputeSnapshot['devices'][number], engine: InferenceEngine): boolean {
  if (device.totalMemoryMb <= 0 || device.backend === 'cpu') return false
  if (engine === 'llama') return device.llamaDevice !== null
  if (engine === 'pytorch') return device.torchDevice !== null
  return device.backend === 'vulkan' || device.llamaDevice !== null
}

function availableVramMb(snapshot: ComputeSnapshot | null | undefined, engine: InferenceEngine): number | null {
  const capacities = snapshot?.devices
    .filter(device => supportsGpu(device, engine))
    .map(device => device.freeMemoryMb > 0 ? device.freeMemoryMb : device.totalMemoryMb)
    .filter(memory => memory > 0) ?? []
  return capacities.length ? Math.max(...capacities) : null
}

/** A missing inventory is intentionally neutral: CPU fallback or a later device check may still work. */
export function modelFit(record: Pick<ResourceRecord, 'provider' | 'downloadBytes' | 'installedBytes'>,
  engine: InferenceEngine, compute: ComputeSettings, snapshot?: ComputeSnapshot | null): ModelFit {
  const estimate = estimatedVramMb(record, engine, compute)
  const available = availableVramMb(snapshot, engine)
  if (estimate === null || available === null) return 'tryable'
  const required = estimate + compute.reservedVramMb
  if (available < required) return 'notRecommended'
  return available < required + EXTRA_HEADROOM_MB ? 'tryable' : 'recommended'
}
