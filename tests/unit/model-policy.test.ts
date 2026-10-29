import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from '../../src/shared/settings'
import { defaultModelBinding, defaultModelPatch, isModelEnabled, modelEnablePatch, mergeModelPolicy, modelPolicyOf, sceneModelBinding, sceneModelPatch } from '../../src/shared/model-policy'
import { settingsPatchSchema } from '../../src/main/settings-schema'

const settings = (): AppSettings => structuredClone(DEFAULT_SETTINGS)

describe('model policy', () => {
  it('migrates saved scene and gateway bindings without enabling every configured interface', () => {
    const value = settings()
    value.modelGateway.asrModel = 'sensevoice-small'
    value.recognition.provider = 'minimax'
    const policy = modelPolicyOf(value)
    expect(policy.defaults.asr).toBe('resource:sensevoice-small')
    expect(policy.selections.asr).toBe('cloud:minimax')
    expect(isModelEnabled(value, 'asr', 'sensevoice-small')).toBe(true)
    expect(isModelEnabled(value, 'asr', 'cloud:minimax')).toBe(true)
    expect(isModelEnabled(value, 'mt', 'cloud:mymemory')).toBe(false)
    expect(isModelEnabled(value, 'llm', 'custom:legacy')).toBe(false)
  })

  it('keeps explicit disables authoritative over legacy settings and gateway bindings', () => {
    const value = settings()
    value.modelPolicy = { enabled: {}, defaults: {}, selections: {} }
    value.modelGateway.asrModel = value.recognition.modelId
    expect(isModelEnabled(value, 'asr', value.recognition.modelId)).toBe(false)
    expect(defaultModelBinding(value, 'asr')).toBe('')
    expect(sceneModelBinding(value, 'asr')).toBe('')
  })

  it('migrates explicitly selected backups without replacing the primary default', () => {
    const value = settings()
    value.modelGateway.mtFallbackModel = 'cloud:mymemory'
    value.translation.fallback.provider = 'google'
    expect(isModelEnabled(value, 'mt', 'cloud:mymemory')).toBe(true)
    expect(isModelEnabled(value, 'mt', 'cloud:google')).toBe(true)
    expect(defaultModelBinding(value, 'mt')).toBe(`resource:${value.translation.localModelId}`)
    value.translation.fallback.provider = 'cloud'
    value.translation.customModelId = 'unrelated-primary'
    expect(isModelEnabled(value, 'mt', 'mt-custom:legacy-fallback')).toBe(true)
    expect(isModelEnabled(value, 'mt', 'mt-custom:unrelated-primary')).toBe(false)
    value.modelPolicy = { enabled: {}, defaults: {}, selections: {} }
    expect(isModelEnabled(value, 'mt', 'cloud:google')).toBe(false)
  })

  it('enables independently and preserves disabled defaults and scene selections', () => {
    let value = settings()
    const previous = sceneModelBinding(value, 'asr')
    value.modelPolicy = mergeModelPolicy(value, modelEnablePatch(value, 'asr', 'sensevoice-small', true).modelPolicy)
    expect(sceneModelBinding(value, 'asr')).toBe(previous)
    value.modelPolicy = mergeModelPolicy(value, defaultModelPatch(value, 'asr', 'sensevoice-small').modelPolicy)
    expect(defaultModelBinding(value, 'asr')).toBe('resource:sensevoice-small')
    expect(sceneModelBinding(value, 'asr')).toBe(previous)
    value.modelPolicy = mergeModelPolicy(value, modelEnablePatch(value, 'asr', 'sensevoice-small', false).modelPolicy)
    expect(isModelEnabled(value, 'asr', 'sensevoice-small')).toBe(false)
    expect(defaultModelBinding(value, 'asr')).toBe('resource:sensevoice-small')
  })

  it('scene changes do not enable models or replace capability defaults', () => {
    let value = settings()
    const previous = defaultModelBinding(value, 'mt')
    value.modelPolicy = mergeModelPolicy(value, sceneModelPatch(value, 'mt', 'custom:profile').modelPolicy)
    expect(sceneModelBinding(value, 'mt')).toBe('mt-custom:profile')
    expect(defaultModelBinding(value, 'mt')).toBe(previous)
    expect(isModelEnabled(value, 'mt', 'mt-custom:profile')).toBe(false)
    expect(isModelEnabled(value, 'llm', 'custom:profile')).toBe(false)
  })


  it('merges concurrent scene selections generated from the same settings snapshot', () => {
    const value = settings()
    value.modelPolicy = {
      enabled: { 'asr:resource:sensevoice-small': true, 'mt:cloud:mymemory': true },
      defaults: { asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' },
      selections: { asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' },
    }
    const snapshot = structuredClone(value)
    const asrPatch = sceneModelPatch(snapshot, 'asr', 'cloud:aliyun').modelPolicy
    const mtPatch = sceneModelPatch(snapshot, 'mt', 'resource:index-translate').modelPolicy
    value.modelPolicy = mergeModelPolicy(value, asrPatch)
    value.modelPolicy = mergeModelPolicy(value, mtPatch)

    expect(value.modelPolicy.selections).toEqual({ asr: 'cloud:aliyun', mt: 'resource:index-translate' })
    expect(value.modelPolicy.defaults).toEqual({ asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' })
    expect(value.modelPolicy.enabled).toEqual({ 'asr:resource:sensevoice-small': true, 'mt:cloud:mymemory': true })
  })

  it('validates the policy IPC contract and rejects nonboolean enable flags', () => {
    expect(settingsPatchSchema.safeParse(defaultModelPatch(settings(), 'tts', 'voice-model')).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ modelPolicy: { enabled: { 'asr:resource:a': 'true' }, defaults: {}, selections: {} } }).success).toBe(false)
  })
})
