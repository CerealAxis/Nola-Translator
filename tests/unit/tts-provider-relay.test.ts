import { afterEach, expect, it, vi } from 'vitest'
import { TtsProviderRelay } from '../../src/main/tts/tts-provider-relay'
import type { ResolvedTtsRequest } from '../../src/shared/tts/synthesis'

const relays: TtsProviderRelay[] = []
afterEach(async () => { for (const relay of relays.splice(0)) await relay.close() })
const snapshot = (targetLanguage = 'en'): ResolvedTtsRequest => ({ schemaVersion: 1, requestId: crypto.randomUUID(),
  modelBinding: 'cloud:voice', modelId: 'tts-1', providerId: 'openai-tts-api', capabilityRevision: 'v1',
  voiceRef: { kind: 'profile', profileId: 'profile', revision: 2 }, profileId: 'profile', profileRevision: 2,
  conditioning: { kind: 'provider-voice', voiceId: 'remote-voice', bindingId: 'binding', bindingRevision: 1, scopeId: 'account' },
  text: ' ', targetLanguage })
const result = { audio: 'data:audio/wav;base64,UklGRg==', mime: 'audio/wav' }

it('runs real private HTTP requests with the fixed profile revision and session language', async () => {
  const relay = new TtsProviderRelay(); relays.push(relay)
  const execute = vi.fn().mockResolvedValue(result)
  const original = snapshot(), grant = await relay.register(original, execute)
  original.profileRevision = 3
  const response = await fetch(grant.url, { method: 'POST', headers: { Authorization: `Bearer ${grant.token}` },
    body: JSON.stringify({ text: 'Hello', language: 'en' }) })
  expect(response.status).toBe(200)
  expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('RIFF')
  expect(execute.mock.calls[0][0]).toMatchObject({ profileRevision: 2, targetLanguage: 'en', text: 'Hello', conditioning: { voiceId: 'remote-voice' } })
  expect(JSON.stringify(execute.mock.calls[0][0])).not.toContain(grant.token)
})

it('rejects unknown leases, changed languages and submitted voice replacements before executing', async () => {
  const relay = new TtsProviderRelay(); relays.push(relay)
  const execute = vi.fn().mockResolvedValue(result), grant = await relay.register(snapshot(), execute)
  const post = (body: unknown, token = grant.token) => fetch(grant.url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  expect((await post({ text: 'Hello', language: 'en' }, 'invalid')).status).toBe(403)
  expect((await post({ text: 'Hello', language: 'ja' })).status).toBe(422)
  expect((await post({ text: 'Hello', language: 'en', conditioning: { kind: 'engine-default' } })).status).toBe(422)
  relay.release(grant.token)
  expect((await post({ text: 'Hello', language: 'en' })).status).toBe(403)
  expect(execute).not.toHaveBeenCalled()
})

it('combines meeting directions while retaining a separate target snapshot for each direction', async () => {
  const relay = new TtsProviderRelay(); relays.push(relay)
  const english = vi.fn().mockResolvedValue(result), chinese = vi.fn().mockResolvedValue(result)
  const first = await relay.register(snapshot('en'), english), second = await relay.register(snapshot('zh'), chinese)
  const grant = await relay.combine([first.token, second.token])
  for (const language of ['en', 'zh']) expect((await fetch(grant.url, { method: 'POST', headers: { Authorization: `Bearer ${grant.token}` },
    body: JSON.stringify({ text: 'test', language }) })).status).toBe(200)
  expect(english).toHaveBeenCalledTimes(1); expect(chinese).toHaveBeenCalledTimes(1)
  expect((await fetch(first.url, { method: 'POST', headers: { Authorization: `Bearer ${first.token}` } })).status).toBe(403)
})
