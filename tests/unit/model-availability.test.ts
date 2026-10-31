import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings, type CredentialProvider } from '../../src/shared/settings'
import { buildConfiguredCloudModels } from '../../src/shared/model-availability'

const credentials = {} as Record<CredentialProvider, boolean>
const settings = (): AppSettings => ({ ...structuredClone(DEFAULT_SETTINGS), modelPolicy: { enabled: {}, defaults: {}, selections: {} } })

describe('configured cloud catalog', () => {
  it('offers ready free interfaces without enablement and still validates endpoints', () => {
    const value = settings()
    expect(buildConfiguredCloudModels(value, credentials).mt.map(model => model.binding)).toEqual(['cloud:mymemory', 'cloud:index-translate'])
    value.modelPolicy!.enabled['mt:cloud:mymemory'] = false
    expect(buildConfiguredCloudModels(value, credentials).mt.map(model => model.binding)).toContain('cloud:mymemory')
    value.translation.mymemoryEndpoint = 'file:///tmp/private'
    expect(buildConfiguredCloudModels(value, credentials).mt.map(model => model.binding)).toEqual(['cloud:index-translate'])
  })

  it('requires complete credentials and connection fields for paid recognition services', () => {
    const value = settings()
    value.modelPolicy!.enabled['asr:cloud:aliyun'] = true
    expect(buildConfiguredCloudModels(value, { ...credentials, 'aliyun-asr': true }).asr).toEqual([])
    value.recognition.aliyunWorkspaceId = 'workspace'
    expect(buildConfiguredCloudModels(value, credentials).asr).toEqual([])
    expect(buildConfiguredCloudModels(value, { ...credentials, 'aliyun-asr': true }).asr[0].binding).toBe('cloud:aliyun')
  })

  it('offers configured custom profiles for translation and chat and enforces Anthropic keys', () => {
    const value = settings()
    value.translation.customModels = [{ id: 'custom', name: 'Custom', model: 'test', endpoint: 'https://example.com', apiFormat: 'anthropic', contextWindow: 32768, maxOutputTokens: 1024, languages: ['en'], sourceLanguages: ['auto', 'zh'] }]
    value.modelPolicy!.enabled['mt:mt-custom:custom'] = true
    expect(buildConfiguredCloudModels(value, credentials).mt.map(model => model.binding)).not.toContain('mt-custom:custom')
    const ready = buildConfiguredCloudModels(value, { ...credentials, 'cloud-model:custom': true })
    expect(ready.mt).toContainEqual(expect.objectContaining({ binding: 'mt-custom:custom', sourceLanguages: ['auto', 'zh'], targetLanguages: ['en'] }))
    expect(ready.llm[0].binding).toBe('custom:custom')
    value.modelPolicy!.enabled['llm:custom:custom'] = true
    expect(buildConfiguredCloudModels(value, { ...credentials, 'cloud-model:custom': true }).llm[0].binding).toBe('custom:custom')
  })

  it('does not advertise unsupported cloud synthesis', () => {
    const value = settings()
    value.modelPolicy!.enabled['tts:cloud:google'] = true
    expect(buildConfiguredCloudModels(value, { ...credentials, google: true }).tts).toEqual([])
  })
})
