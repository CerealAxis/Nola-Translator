import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPUTE_SETTINGS } from './compute'
import { supportsSelectedEngine, translationEngine } from './model-engines'

describe('model selected loader', () => {
  it('ignores a saved manual engine from older settings', () => {
    const oldSettings = { ...DEFAULT_COMPUTE_SETTINGS, recognitionEngine: 'pytorch' as const, translationEngine: 'llama' as const }
    expect(supportsSelectedEngine({ kind: 'recognitionModel', provider: 'crisp-asr' }, oldSettings)).toBe(true)
    expect(translationEngine(oldSettings, 'transformers-causal')).toBe('pytorch')
  })
})
