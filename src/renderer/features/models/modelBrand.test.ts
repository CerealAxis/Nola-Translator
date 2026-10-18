import { describe, expect, it } from 'vitest'

import { brandOf, brandOfRepo } from './modelBrand'

describe('model brand resolution', () => {
  it('recognizes built-in model families from their resource ids', () => {
    expect(brandOf({ resourceId: 'qwen3-asr-1.7b-hf', provider: 'qwen3-asr' })).toBe('qwen')
    expect(brandOf({ resourceId: 'vibevoice-asr-q4-k', provider: 'vibevoice-asr' })).toBe('microsoft')
    expect(brandOf({ resourceId: 'mimo-v2.5-asr-f16', provider: 'mimo-v2.5-asr' })).toBe('xiaomi-mimo')
  })

  it('recognizes imported hub models from the repository path', () => {
    expect(brandOf({ resourceId: 'hub:microsoft/VibeVoice-ASR-GGUF', provider: 'crisp' })).toBe('microsoft')
    expect(brandOf({ resourceId: 'hub:OpenMOSS/MiMo-V2.5-ASR-GGUF', provider: 'crisp' })).toBe('xiaomi-mimo')
    expect(brandOfRepo('facebook/m2m100_418M')).toBe('meta')
  })

  it('leaves unknown publishers on the generic fallback', () => {
    expect(brandOf({ resourceId: 'hub:example/unknown-model', provider: 'crisp' })).toBe('unknown')
  })
})
