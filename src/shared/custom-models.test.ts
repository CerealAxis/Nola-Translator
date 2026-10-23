import { expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isCredentialProvider } from './settings'
import { customModelsOf, customModelPatch, customCredentialSlot, customModelSchema, synchronizeCustomModel } from './custom-models'

const first = { id: 'first', name: 'Fast translator', endpoint: 'https://example.com/v1', model: 'fast-model', apiFormat: 'chat-completions' as const, contextWindow: 32768, maxOutputTokens: 1024, languages: ['zh', 'en'] }
const second = { ...first, id: 'second', name: 'Second translator', endpoint: 'https://second.example/v1', languages: ['ja', 'en'] }

it('keeps independent configurations and selects the matching connection and languages', () => {
  const translation = { ...DEFAULT_SETTINGS.translation, customModels: [first, second] }
  expect(customModelsOf(translation)).toEqual([first, second])
  expect(customCredentialSlot(first.id)).not.toEqual(customCredentialSlot(second.id))
  expect(customModelPatch(translation, second)).toMatchObject({ provider: 'cloud', customModelId: 'second', cloudName: second.name, cloudEndpoint: second.endpoint, cloudLanguages: ['ja', 'en'], targetLanguage: 'ja' })
})

it('retains a legacy endpoint without treating shipped defaults as an installed custom model', () => {
  expect(customModelsOf(DEFAULT_SETTINGS.translation)).toEqual([])
  const legacy = customModelsOf({ ...DEFAULT_SETTINGS.translation, cloudEndpoint: 'https://api.example/v1', cloudName: 'Existing' })
  expect(legacy).toHaveLength(1)
  expect(legacy[0]).toMatchObject({ id: 'legacy', name: 'Existing' })
  expect(customCredentialSlot('legacy')).toBe('cloud')
  expect(customModelsOf({ ...DEFAULT_SETTINGS.translation, cloudName: 'Deleted', customModels: [] })).toEqual([])
})

it('rejects secret material, invalid endpoints and empty translation-language selections', () => {
  expect(customModelSchema.safeParse(first).success).toBe(true)
  expect(customModelSchema.safeParse({ ...first, apiKey: 'secret' }).success).toBe(false)
  expect(customModelSchema.safeParse({ ...first, endpoint: 'file:///tmp' }).success).toBe(false)
  expect(customModelSchema.safeParse({ ...first, languages: [] }).success).toBe(false)
})

it('accepts only bounded profile credential slots', () => {
  expect(isCredentialProvider('cloud-model:abc-123')).toBe(true)
  expect(isCredentialProvider('cloud-model:')).toBe(false)
  expect(isCredentialProvider('cloud-model:../settings')).toBe(false)
  expect(isCredentialProvider('anything')).toBe(false)
})

it('keeps saved profiles when an incomplete edit or unrelated provider change arrives', () => {
  const translation = { ...DEFAULT_SETTINGS.translation, ...customModelPatch(DEFAULT_SETTINGS.translation, first), customModels: [first], customModelId: first.id }
  const incomplete = synchronizeCustomModel({ ...translation, cloudName: '' }, { cloudName: '' })
  expect(incomplete.customModels).toEqual([first])
  expect(incomplete.cloudName).toBe(first.name)
  expect(synchronizeCustomModel({ ...translation, provider: 'google' }).provider).toBe('google')
  expect(synchronizeCustomModel({ ...translation, targetLanguage: 'none' }).targetLanguage).toBe('none')
})
