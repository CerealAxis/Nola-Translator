import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { migrateLegacyVoice } from '../../src/shared/tts/migration'
import { parseVoiceRefKey, voiceRefKey, normalizeVoiceRef } from '../../src/shared/tts/voice-ref'
import { ttsLanguageCompatibility, ttsLanguageMatches } from '../../src/shared/tts/compatibility'
import { ttsPreviewLanguage } from '../../src/shared/tts/preview-language'
import { SessionVoices } from '../../src/main/tts/session-voices'
import type { TtsModelCapabilities } from '../../src/shared/tts/capabilities'
import { resolveTtsRequest, type TtsResolutionContext } from '../../src/main/tts/tts-request-resolver'
import type { TtsVoiceProfile } from '../../src/shared/tts/voice-profile'
import { resolvedVoiceConditioningSchema } from '../../src/shared/tts/synthesis'
import fixtures from '../../engine/contracts/v2/tts-fixtures.json'

const capabilities: TtsModelCapabilities = {
  schemaVersion: 1, modelBinding: 'resource:test', modelId: 'test', providerId: 'test',
  languages: { mode: 'finite', values: ['en', 'zh', 'yue'] }, languageInputMode: 'explicit',
  presetVoices: [{ id: 'english', name: 'English', languages: ['en'] }, { id: 'multi', name: 'Multi' }],
  supports: { cloning: true, voiceDesign: false, voiceConversion: false, emotion: false, styleInstruction: false,
    seed: false, speed: false, pitch: false, volume: false, pronunciation: false, ssml: false,
    streamingInput: false, streamingOutput: false }, instructVocabulary: 'none', outputFormats: ['wav'], source: 'static-catalog',
}
const profile: TtsVoiceProfile = { schemaVersion: 1, id: 'profile', revision: 2, name: 'Test', kind: 'clone',
  defaultLanguage: 'en', representations: [{ kind: 'reference-audio', assetId: 'recording', recordedLanguage: 'en' }],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
function context(overrides: Partial<TtsModelCapabilities> = {}, value = profile): TtsResolutionContext {
  return { capabilities: async () => ({ ...capabilities, ...overrides }), profile: async () => value,
    asset: async () => ({ sha256: 'a'.repeat(64), mime: 'audio/wav', bytes: 100 }), bindings: async () => [], scopeId: 'account' }
}
const request = () => ({ schemaVersion: 1 as const, requestId: randomUUID(), modelBinding: 'resource:test',
  voiceRef: { kind: 'engine-default' as const }, targetLanguage: 'zh-CN', text: '你好' })

describe('TTS contracts', () => {
  it('validates the shared Python and renderer conditioning fixtures', () => {
    expect(fixtures.schemaVersion).toBe(1)
    for (const fixture of fixtures.valid) expect(resolvedVoiceConditioningSchema.safeParse(fixture).success).toBe(true)
    for (const fixture of fixtures.invalid) expect(resolvedVoiceConditioningSchema.safeParse(fixture).success).toBe(false)
  })
  it('preserves legacy values and their connection', () => {
    expect(migrateLegacyVoice('', 'model').voiceRef).toEqual({ kind: 'engine-default' })
    expect(migrateLegacyVoice(' unknown:音色 ', 'model', [], { connectionId: 'account' })).toMatchObject({
      voiceRef: { kind: 'preset', modelBinding: 'model', voiceId: ' unknown:音色 ' },
      legacy: { rawVoice: ' unknown:音色 ', connectionId: 'account', verificationStatus: 'unverified' },
    })
  })
  it('roundtrips reference keys without parsing delimiters', () => {
    const ref = { kind: 'preset' as const, modelBinding: 'cloud:a:b', voiceId: '音色:%/?' }
    expect(parseVoiceRefKey(voiceRefKey(ref))).toEqual(ref)
    expect(() => normalizeVoiceRef({ kind: 'gallery', id: 'x' })).toThrow()
  })
  it('distinguishes Cantonese, Hong Kong and unknown languages', () => {
    expect(ttsLanguageCompatibility(capabilities, 'zh-HK')).toBe('incompatible')
    expect(ttsLanguageCompatibility(capabilities, 'yue')).toBe('compatible')
    expect(ttsLanguageCompatibility({ ...capabilities, languages: { mode: 'multi' } }, 'en')).toBe('unverified')
    expect(ttsLanguageCompatibility({ ...capabilities, languageInputMode: 'auto-detect', languages: { mode: 'unknown' } }, 'auto')).toBe('unverified')
    expect(ttsLanguageMatches('zh-CN', 'zh-Hant')).toBe(false)
    expect(ttsLanguageMatches('zh-TW', 'zh-Hant')).toBe(true)
  })
  it('uses the profile default only for independent preview', () => {
    expect(ttsPreviewLanguage('zh', profile, capabilities, { kind: 'profile', profileId: profile.id })).toBe('zh')
    expect(ttsPreviewLanguage(undefined, profile, capabilities, { kind: 'profile', profileId: profile.id })).toBe('en')
  })
  it('expires session speaker references without changing resolved snapshots', () => {
    const voices = new SessionVoices()
    voices.register('session', 'speaker', { kind: 'reference-audio', assetId: 'recording', sha256: 'a'.repeat(64), purpose: 'human-reference' })
    const fixed = voices.resolve('session', 'speaker')
    voices.close('session')
    expect(() => voices.resolve('session', 'speaker')).toThrow('VOICE_MISSING')
    expect(fixed.assetId).toBe('recording')
  })
  it('resolves default and rejects unsupported model language', async () => {
    expect((await resolveTtsRequest(request(), context())).conditioning).toEqual({ kind: 'engine-default' })
    await expect(resolveTtsRequest({ ...request(), targetLanguage: 'ja' }, context())).rejects.toMatchObject({ code: 'MODEL_LANGUAGE_UNSUPPORTED' })
  })
  it('checks preset language and model binding', async () => {
    await expect(resolveTtsRequest({ ...request(), voiceRef: { kind: 'preset', modelBinding: 'resource:test', voiceId: 'english' } }, context())).rejects.toMatchObject({ code: 'VOICE_LANGUAGE_UNSUPPORTED' })
    expect((await resolveTtsRequest({ ...request(), voiceRef: { kind: 'preset', modelBinding: 'resource:test', voiceId: 'multi' } }, context())).conditioning).toMatchObject({ voiceId: 'multi' })
    await expect(resolveTtsRequest({ ...request(), voiceRef: { kind: 'preset', modelBinding: 'other', voiceId: 'multi' } }, context())).rejects.toMatchObject({ code: 'VOICE_MODEL_MISMATCH' })
  })
  it('pins revision, preserves session language and freezes the result', async () => {
    const resolved = await resolveTtsRequest({ ...request(), voiceRef: { kind: 'profile', profileId: profile.id } }, context())
    expect(resolved).toMatchObject({ profileRevision: 2, targetLanguage: 'zh-CN', conditioning: { recordedLanguage: 'en' } })
    expect(Object.isFrozen(resolved.conditioning)).toBe(true)
  })
  it('rejects cloning on engines without cloning', async () => {
    await expect(resolveTtsRequest({ ...request(), voiceRef: { kind: 'profile', profileId: profile.id } }, context({ supports: { ...capabilities.supports, cloning: false } }))).rejects.toMatchObject({ code: 'VOICE_CONDITIONING_UNSUPPORTED' })
  })
  it('uses a designed sample on cloning engines and requires preparation without it', async () => {
    const design: TtsVoiceProfile = { ...profile, kind: 'design', lockedSampleAssetId: 'sample', representations: [] }
    const input = { ...request(), voiceRef: { kind: 'profile' as const, profileId: profile.id } }
    expect((await resolveTtsRequest(input, context({}, design))).conditioning).toMatchObject({ assetId: 'sample', purpose: 'designed-sample' })
    await expect(resolveTtsRequest(input, context({}, { ...design, lockedSampleAssetId: undefined }))).rejects.toMatchObject({ code: 'VOICE_PREPARATION_REQUIRED' })
    await expect(resolveTtsRequest(input, context({}, { ...profile, deletedAt: profile.updatedAt }))).rejects.toMatchObject({ code: 'VOICE_DELETED' })
  })
})

it('resolves engine default through the model clone profile and snapshots its revision', async () => {
  const ctx = context({ conditioning: ['reference-audio'] })
  ctx.defaultVoiceRef = { kind: 'profile', profileId: profile.id }
  const result = await resolveTtsRequest(request(), ctx)
  expect(result).toMatchObject({ voiceRef: { kind: 'profile', profileId: profile.id }, profileRevision: 2, targetLanguage: 'zh-CN', conditioning: { kind: 'reference-audio', assetId: 'recording' } })
  expect(Object.isFrozen(result)).toBe(true)
})
it('keeps an explicit voice selection ahead of the model default', async () => {
  const ctx = context()
  ctx.defaultVoiceRef = { kind: 'profile', profileId: profile.id }
  const result = await resolveTtsRequest({ ...request(), voiceRef: { kind: 'preset', modelBinding: 'resource:test', voiceId: 'multi' } }, ctx)
  expect(result.conditioning).toEqual({ kind: 'preset', voiceId: 'multi' })
})
