import { expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import { mergeSettings } from './settingsStore'

it('preserves gateway and synthesis siblings during optimistic updates', () => {
  const base = structuredClone(DEFAULT_SETTINGS)
  base.synthesis = { modelId: 'tts-selected', voice: 'voice-a' }
  base.modelGateway.asr = true
  const next = mergeSettings(base, { modelGateway: { tts: true }, synthesis: { voice: 'voice-b' }, closeBehavior: 'quit' })
  expect(next.modelGateway).toEqual({ ...base.modelGateway, tts: true })
  expect(next.synthesis).toEqual({ modelId: 'tts-selected', voice: 'voice-b' })
  expect(next.closeBehavior).toBe('quit')
  expect(base.synthesis.voice).toBe('voice-a')
})
