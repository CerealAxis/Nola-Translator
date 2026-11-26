import { ttsModelCatalog } from '../../src/shared/tts/model-catalog'
import { afterEach, expect, it, vi } from 'vitest'
import { inferAstrBotSpeech } from '../../src/main/astrbot-speech'
import { ProviderVoiceAdapter } from '../../src/main/tts/adapters/provider-voices'
import { TtsCapabilityRegistry } from '../../src/main/tts/tts-capability-registry'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'
import { voiceAccountScope } from '../../src/main/tts/voice-scope'
import type { WorkspaceConnection } from '../../src/shared/model-workspace'
import type { TtsVoiceProfile } from '../../src/shared/tts/voice-profile'

const connection = (service: WorkspaceConnection['service'] = 'mimo', model = 'mimo-v2.5-tts'): WorkspaceConnection => ({ id: 'account', service,
  capability: 'TTS', name: service, endpoint: service === 'mimo' ? 'https://api.xiaomimimo.com/v1' : 'https://api.elevenlabs.io/v1',
  protocol: '', workspace: '', region: '', models: [{ id: model, name: model, enabled: true }] })
const request = { id: crypto.randomUUID(), kind: 'tts' as const, model: 'cloud:test', target: 'en-US', text: 'Hello' }
const profile: TtsVoiceProfile = { schemaVersion: 1, id: 'profile', revision: 1, kind: 'clone', name: 'Voice', representations: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
afterEach(() => vi.unstubAllGlobals())

it.each(['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'])('maps the %s model into its own HTTP body', async model => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { audio: { data: 'UklGRg==' } } }] }))
  vi.stubGlobal('fetch', fetch)
  const conditioning = model.endsWith('voicedesign') ? { kind: 'design' as const, description: 'Warm narrator', recipe: {}, recipeSchema: 'v1', authoringModelBinding: 'cloud:test' }
    : model.endsWith('voiceclone') ? { kind: 'reference-audio' as const, assetId: 'recording', sha256: 'a'.repeat(64), purpose: 'human-reference' as const }
      : { kind: 'preset' as const, voiceId: 'Mia' }
  await inferAstrBotSpeech(connection('mimo', model), { ...request, conditioning, audio: 'data:audio/wav;base64,UklGRg==' }, 'key', new AbortController().signal)
  const body = JSON.parse(fetch.mock.calls[0][1].body)
  expect(body.model).toBe(model)
  expect(body.stream).toBe(false)
  if (model.endsWith('voicedesign')) { expect(body.audio.voice).toBeUndefined(); expect(body.messages[0].content).toBe('Warm narrator') }
  else expect(body.audio.voice).toBe(model.endsWith('voiceclone') ? 'data:audio/wav;base64,UklGRg==' : 'Mia')
  expect(ttsCatalogCapabilities('mimo', model, request.model).supports.streamingInput).toBe(false)
})

it('writes the target language and normalized controls to Azure SSML', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('token')).mockResolvedValueOnce(new Response('RIFF'))
  vi.stubGlobal('fetch', fetch)
  await inferAstrBotSpeech({ ...connection('azure-tts', 'neural'), endpoint: '', options: { region: 'eastus' } },
    { ...request, target: 'ja-JP', conditioning: { kind: 'preset', voiceId: 'ja-JP-NanamiNeural' }, controls: { speed: 1.2, pitch: 2, volume: 0.8 } }, 'key', new AbortController().signal)
  expect(fetch.mock.calls[1][1].body).toContain('xml:lang="ja-JP"')
  expect(fetch.mock.calls[1][1].body).toContain('pitch="+2st"')
  expect(fetch.mock.calls[1][1].body).not.toContain('xml:lang="zh-CN"')
})

it.each([[401, 'authentication_failed'], [402, 'quota_exceeded'], [403, 'permission_or_region_denied'], [429, 'rate_limited'], [500, 'provider_failed']])('preserves provider HTTP %s failure category', async (status, code) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: status as number })))
  const adapter = new ProviderVoiceAdapter(connection('elevenlabs-tts'), 'key', new AbortController().signal)
  await expect(adapter.inspect('voice')).rejects.toMatchObject({ code })
})

it('supports an empty delete response and verifies missing voice IDs', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response('{}', { status: 404 })))
  const adapter = new ProviderVoiceAdapter(connection('elevenlabs-tts'), 'key', new AbortController().signal)
  await expect(adapter.remove('voice', profile.kind)).resolves.toBeUndefined()
  await expect(adapter.inspect('voice')).resolves.toBe('remote-missing')
})

it('isolates inventory caches by model and credential revision', async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.endsWith('/models')
    ? [{ model_id: 'first', languages: [{ language_id: 'en' }] }, { model_id: 'second', languages: [{ language_id: 'ja' }] }]
    : { voices: [{ voice_id: 'premade', name: 'Preset', category: 'premade' }] })))
  vi.stubGlobal('fetch', fetch)
  const registry = new TtsCapabilityRegistry(), signal = new AbortController().signal, cloud = connection('elevenlabs-tts')
  expect((await registry.capabilities(cloud, 'first', 'first-binding', 'key', 'one', signal)).languages).toEqual({ mode: 'finite', values: ['en'] })
  expect((await registry.capabilities(cloud, 'second', 'second-binding', 'key', 'one', signal)).languages).toEqual({ mode: 'finite', values: ['ja'] })
  await registry.capabilities(cloud, 'first', 'first-binding', 'key', 'one', signal)
  expect(fetch).toHaveBeenCalledTimes(4)
  await registry.capabilities(cloud, 'first', 'first-binding', 'key2', 'two', signal)
  expect(fetch).toHaveBeenCalledTimes(6)
  expect(voiceAccountScope(cloud, 'key')).not.toBe(voiceAccountScope(cloud, 'key2'))
})

it('resolves cached capabilities without issuing a provider request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const value = await new TtsCapabilityRegistry().capabilities(connection('elevenlabs-tts'), 'eleven_multilingual_v2', 'binding', 'key', 'one', new AbortController().signal, false, true)
  expect(value.source).toBe('static-catalog')
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps the documented TTS model catalogs scoped to their provider and model', () => {
  for (const [providerId, entry] of Object.entries(ttsModelCatalog)) for (const modelId of entry.models) {
    const caps = ttsCatalogCapabilities(providerId, modelId, 'catalog-test')
    expect(caps.modelId).toBe(modelId)
    expect(new Set(caps.presetVoices.map(voice => voice.id)).size).toBe(caps.presetVoices.length)
    expect(entry.source).toMatch(/^https:\/\//)
  }
  expect(ttsCatalogCapabilities('openai-tts-api', 'tts-1', '').presetVoices.some(voice => voice.id === 'marin')).toBe(false)
  expect(ttsCatalogCapabilities('openai-tts-api', 'gpt-4o-mini-tts', '').presetVoices.some(voice => voice.id === 'marin')).toBe(true)
  expect(ttsCatalogCapabilities('dashscope-tts', 'qwen3-tts-flash', '').presetVoices).toHaveLength(48)
  expect(ttsCatalogCapabilities('dashscope-tts', 'cosyvoice-v2', '').presetVoices.some(voice => voice.id === 'longxiaochun_v2')).toBe(true)
  expect(ttsCatalogCapabilities('dashscope-tts', 'cosyvoice-v3.5-plus', '').presetVoices).toEqual([])
  expect(ttsCatalogCapabilities('edge-tts', 'edge-tts', '').presetVoices.find(voice => voice.locale === 'zh-HK')?.languages).toEqual(['yue-HK'])
})
