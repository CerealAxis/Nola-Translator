import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPUTE_SETTINGS, type ComputeSnapshot } from '../../../shared/compute'
import { modelFit } from './model-fit'

const snapshot: ComputeSnapshot = {
  devices: [{
    id: 'cuda:0', name: 'Test GPU', backend: 'cuda', torchDevice: 'cuda:0', llamaDevice: 'CUDA0',
    totalMemoryMb: 8192, freeMemoryMb: 7100, integrated: false, stableId: true,
    recognition: true, translation: true, reason: '', score: 1,
  }],
  notes: [], torchVersion: '', activePlan: null,
}

describe('model fit estimate', () => {
  it('recommends a quantized Qwen model when the detected GPU has headroom', () => {
    expect(modelFit({ provider: 'qwen3-asr', downloadBytes: 4_087_646_324, installedBytes: 0 }, 'pytorch', DEFAULT_COMPUTE_SETTINGS, snapshot)).toBe('recommended')
  })

  it('marks a model as not recommended when the selected loader cannot fit it', () => {
    expect(modelFit({ provider: 'hymt2', downloadBytes: 16 * 1024 * 1024 * 1024, installedBytes: 0 }, 'llama', DEFAULT_COMPUTE_SETTINGS, snapshot)).toBe('notRecommended')
  })

  it('stays neutral when no GPU inventory is available', () => {
    expect(modelFit({ provider: 'qwen3-asr', downloadBytes: 4_087_646_324, installedBytes: 0 }, 'pytorch', DEFAULT_COMPUTE_SETTINGS, null)).toBe('tryable')
  })
})
