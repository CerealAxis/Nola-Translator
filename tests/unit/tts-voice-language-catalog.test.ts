import { afterEach, expect, it, vi } from 'vitest'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'
import { ttsModelCatalog } from '../../src/shared/tts/model-catalog'
import { ttsLanguageCompatibility, ttsLanguageMatches } from '../../src/shared/tts/compatibility'
import { mergeTtsCapabilities } from '../../src/shared/tts/capability-overrides'
import { TtsOrchestrator } from '../../src/main/tts/tts-orchestrator'
import type { VoiceLibrary } from '../../src/main/tts/voice-library'
import type { VoiceAssets } from '../../src/main/tts/voice-assets'

afterEach(() => vi.restoreAllMocks())

it.each(['Mia', 'Chloe', 'Milo', 'Dean'])('rejects the official English-only MiMo voice %s for Chinese before synthesis', async voiceId => {
  const capabilities = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'binding')
  const voice = capabilities.presetVoices.find(voice => voice.id === voiceId)!
  expect(voice.languages).toEqual(['en'])
  expect(ttsLanguageCompatibility(capabilities, 'zh-CN', voice)).toBe('incompatible')
  expect(ttsLanguageCompatibility(capabilities, 'zh-TW', voice)).toBe('incompatible')
  expect(ttsLanguageCompatibility(capabilities, 'en', voice)).toBe('compatible')
  const context = { capabilities: async () => capabilities, profile: async () => undefined, bindings: async () => [], asset: vi.fn(), scopeId: 'account' }
  const adapter = { capabilities: async () => capabilities, synthesize: vi.fn() }
  const orchestrator = new TtsOrchestrator(context, {} as VoiceLibrary, {} as VoiceAssets)
  await expect(orchestrator.synthesize({ schemaVersion: 1, requestId: crypto.randomUUID(), modelBinding: 'binding', text: '你好', targetLanguage: 'zh',
    voiceRef: { kind: 'preset', modelBinding: 'binding', voiceId } }, new AbortController().signal, adapter)).rejects.toMatchObject({ code: 'VOICE_LANGUAGE_UNSUPPORTED' })
  expect(adapter.synthesize).not.toHaveBeenCalled()
})

it('preserves official limits when old saved settings claim that an English voice supports Chinese', () => {
  const merged = mergeTtsCapabilities(ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'binding'), {
    languages: { mode: 'finite', values: ['zh-CN', 'ja'] }, presetVoices: [{ id: 'Mia', name: 'Mia', languages: ['zh-CN', 'en'] }],
  })
  expect(merged.languages).toEqual({ mode: 'finite', values: ['zh-CN'] })
  expect(merged.presetVoices.find(voice => voice.id === 'Mia')?.languages).toEqual(['en'])
  expect(ttsLanguageCompatibility(merged, 'zh-CN', merged.presetVoices.find(voice => voice.id === 'Mia'))).toBe('incompatible')
})

it('intersects locale limits without widening them or confusing Chinese script variants', () => {
  const base = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'binding')
  base.presetVoices = [{ id: 'regional', name: 'Regional', languages: ['en-US', 'zh-Hant'] }]
  const voice = mergeTtsCapabilities(base, { presetVoices: [{ id: 'regional', name: 'Regional', languages: ['en', 'zh-TW'] }] }).presetVoices[0]
  expect(voice.languages).toEqual(['en-US', 'zh-Hant-TW'])
  expect(ttsLanguageCompatibility(base, 'en-GB', voice)).toBe('incompatible')
  expect(ttsLanguageCompatibility(base, 'zh-CN', voice)).toBe('incompatible')
  expect(ttsLanguageCompatibility(base, 'zh-TW', voice)).toBe('compatible')
})

it.each(['qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash'])('keeps every official language restriction for %s', model => {
  const caps = ttsCatalogCapabilities('dashscope-tts', model, 'binding')
  expect(caps.presetVoices.length).toBeGreaterThan(500)
  expect(caps.presetVoices.every(voice => voice.languages?.length)).toBe(true)
  expect(caps.presetVoices.filter(voice => voice.languages?.includes('en') && !voice.languages.includes('zh')).length).toBeGreaterThan(0)
})

it('checks the documented Qwen-Audio 3.1 language groups independently', () => {
  const caps = ttsCatalogCapabilities('dashscope-tts', 'qwen-audio-3.1-tts-flash', 'binding')
  for (const [id, languages] of [['Emily_v3.1', ['en']], ['yuxiaoyun_v3.1', ['zh']], ['loongbella_v3.1', ['zh', 'en']], ['qwen-audio-3.1-tts-flash-zorza_pl', ['pl']]] as const)
    expect(caps.presetVoices.find(voice => voice.id === id)?.languages).toEqual(languages)
})

it('checks language-limited voices in every integrated provider catalog against the same target language rule', () => {
  let checked = 0
  for (const [provider, { models }] of Object.entries(ttsModelCatalog)) for (const model of models) {
    const caps = ttsCatalogCapabilities(provider, model, provider + ':' + model)
    for (const voice of caps.presetVoices.filter(voice => voice.languages?.length)) {
      if (voice.languages!.every(language => !ttsLanguageMatches(language, 'zh-CN')))
        expect(ttsLanguageCompatibility(caps, 'zh-CN', voice), `${provider}/${model}/${voice.id}`).toBe('incompatible')
      checked++
    }
  }
  expect(checked).toBeGreaterThan(2000)
})

it.each([
  ['openai-tts-api', 'gpt-4o-mini-tts'], ['minimax-tts', 'speech-2.8-hd'],
  ['elevenlabs-tts', 'eleven_multilingual_v2'], ['gemini-tts', 'gemini-2.5-flash-preview-tts'],
  ['qwen3-tts', 'Qwen3-TTS-12Hz-1.7B-CustomVoice'],
])('retains cross-language synthesis for %s voices', (provider, model) => {
  const caps = ttsCatalogCapabilities(provider, model, 'binding')
  expect(caps.presetVoices.length).toBeGreaterThan(0)
  for (const voice of caps.presetVoices) expect(ttsLanguageCompatibility(caps, 'zh-CN', voice)).toBe('compatible')
})
