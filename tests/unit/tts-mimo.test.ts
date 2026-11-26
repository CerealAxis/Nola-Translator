import { expect, it } from 'vitest'
import { mimoSynthesisPayload } from '../../src/main/tts/adapters/mimo'
import type { DirectModelRequest } from '../../src/shared/agent-workspace'

const request: DirectModelRequest = { id: crypto.randomUUID(), model: 'cloud:mimo', kind: 'tts', text: 'Hello', target: 'en' }
it('maps MiMo model-specific conditioning without leaking preset fields', () => {
  expect(mimoSynthesisPayload(request, 'mimo-v2.5-tts', 'Mia').audio.voice).toBe('Mia')
  const design = mimoSynthesisPayload({ ...request, conditioning: { kind: 'design', description: 'A deep voice',
    recipe: {}, recipeSchema: 'v1', authoringModelBinding: 'cloud:mimo' } }, 'mimo-v2.5-tts-voicedesign', 'Mia')
  expect(design.audio).not.toHaveProperty('voice')
  expect(design.messages[0]).toEqual({ role: 'user', content: 'A deep voice' })
  expect(design.messages[1]).toEqual({ role: 'assistant', content: 'Hello' })
})
it('requires reference data and limits encoded bytes for MiMo cloning', () => {
  const clone: DirectModelRequest = { ...request, conditioning: { kind: 'reference-audio', assetId: 'ref', sha256: 'a'.repeat(64), purpose: 'human-reference' }, audio: 'data:audio/wav;base64,UklGRg==' }
  expect(mimoSynthesisPayload(clone, 'mimo-v2.5-tts-voiceclone', '').audio.voice).toBe(clone.audio)
  expect(() => mimoSynthesisPayload(request, 'mimo-v2.5-tts-voiceclone', 'Mia')).toThrow('mimoReferenceRequired')
  expect(() => mimoSynthesisPayload({ ...clone, audio: 'data:audio/wav;base64,' + 'A'.repeat(10_000_004) }, 'mimo-v2.5-tts-voiceclone', '')).toThrow('mimoReferenceInvalid')
})
