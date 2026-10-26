import { describe, expect, it } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import type { LocalRuntime, RuntimeSnapshot } from '../../../shared/compute'
import { isEngineAvailable } from './engine-availability'
import { familyOf, isQwen3TtsRecord } from './modelFamily'

const runtime = (status: LocalRuntime['status']): LocalRuntime => ({
  path: '', status, backend: '', version: '', gpuAvailable: false, reason: '',
})

const local: RuntimeSnapshot['local'] = {
  engine: runtime('missing'),
  llama: runtime('ready'),
  crisp: runtime('incompatible'),
}

describe('recommended model engine availability', () => {
  it('reports loader readiness for engine choices', () => {
    expect(isEngineAvailable('pytorch', local)).toBe(false)
    expect(isEngineAvailable('llama', local)).toBe(true)
    expect(isEngineAvailable('crisp', local)).toBe(false)
  })

  it('stays neutral while runtime inspection is still loading', () => {
    expect(isEngineAvailable('pytorch', null)).toBe(true)
  })
})

describe('Qwen3-TTS family membership', () => {
  const ttsRecord = (resourceId: string): ResourceRecord => ({
    resourceId,
    kind: 'ttsModel',
    provider: 'crisp-asr',
    name: resourceId,
    description: '',
    languages: [],
    installed: false,
    installedBytes: 0,
    state: 'idle',
    cancellable: false,
  })

  it('keeps synthesis families separate and recognizes Qwen-specific IDs', () => {
    const qwen = ttsRecord('tts-qwen3-tts-crisp-0.6b-base-q8-0')
    const piper = ttsRecord('tts-piper-en-us-lessac-medium-82m')

    expect(isQwen3TtsRecord(qwen)).toBe(true)
    expect(familyOf(qwen)).toBe('tts')
    expect(isQwen3TtsRecord(piper)).toBe(false)
    expect(familyOf(piper)).toBe('piper')
    expect(familyOf(ttsRecord('tts-kokoro-82m'))).toBe('kokoro')
    expect(familyOf(ttsRecord('tts-cosyvoice3-0.5b'))).toBe('cosyvoice3')
    expect(familyOf(ttsRecord('hub:owner/custom-voice'))).toBe('tts')
  })
})
