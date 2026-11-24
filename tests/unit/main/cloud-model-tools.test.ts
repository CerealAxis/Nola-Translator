import { describe, expect, it, vi } from 'vitest'
import { cloudModelProbeError, fetchCloudChatModels, probeCloudLanguageModel } from '../../../src/main/cloud-model-tools'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { CloudModelListRequest } from '../../../src/shared/cloud-model-tools'

const connection: CloudModelListRequest = {
  sourceId: 'provider_test', service: 'minimax-token-plan', protocol: 'anthropic',
  endpoint: 'https://api.minimaxi.com/anthropic', key: '',
}
const signal = new AbortController().signal

describe('cloud speech probe failures', () => {
  it.each([
    [new TypeError('fetch failed'), 'NETWORK_UNAVAILABLE'],
    [new Error('request timed out'), 'REQUEST_TIMEOUT'],
    [new SyntaxError('Unexpected end of JSON input'), 'SYNTHESISFAILED'],
  ])('classifies %s as %s', (error, code) => {
    expect(cloudModelProbeError(error)).toMatchObject({ code })
  })

  it('keeps a known cloud-model error instead of replacing it with a generic synthesis failure', () => {
    const error = Object.assign(new Error('Provider returned HTTP 401'), { code: 'CLOUD_MODEL_KEY_REQUIRED' })
    expect(cloudModelProbeError(error)).toBe(error)
  })
})

describe('cloud chat model discovery', () => {
  it('asks for an API key before calling the official OpenAI endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(fetchCloudChatModels({ ...connection, service: 'openai', protocol: 'chat-completions',
      endpoint: 'https://api.openai.com/v1' }, '', signal, fetcher)).rejects.toMatchObject({ code: 'CLOUD_MODEL_KEY_REQUIRED' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    [401, '', 'CLOUD_MODEL_KEY_REQUIRED'],
    [401, 'token', 'AUTHENTICATION_FAILED'],
    [403, 'token', 'CLOUD_MODEL_ACCESS_DENIED'],
    [404, 'token', 'CLOUD_MODEL_LIST_UNAVAILABLE'],
    [429, 'token', 'CLOUD_MODEL_RATE_LIMITED'],
    [503, 'token', 'CLOUD_MODEL_PROVIDER_UNAVAILABLE'],
  ])('classifies HTTP %s for the model list', async (status, key, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))
    await expect(fetchCloudChatModels(connection, key, signal, fetcher)).rejects.toMatchObject({ code })
  })

  it('uses the configured MiniMax endpoint and account auth, and merges cursor pages', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'MiniMax-M3' }], has_more: true, last_id: 'MiniMax-M3' }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'MiniMax-M3' }, { id: 'MiniMax-M2.7' }] }))
    const models = await fetchCloudChatModels(connection, 'token', signal, fetcher)
    expect(models.map(model => model.id)).toEqual(['MiniMax-M3', 'MiniMax-M2.7'])
    expect(fetcher.mock.calls[0][0].toString()).toBe('https://api.minimaxi.com/anthropic/v1/models')
    expect(fetcher.mock.calls[1][0].toString()).toContain('after_id=MiniMax-M3')
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token')
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error')
  })

  it('keeps Gemini generation models and their provider token limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ models: [
      { name: 'models/gemini-test', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 4096, outputTokenLimit: 1024 },
      { name: 'models/embedding-test', supportedGenerationMethods: ['embedContent'] },
    ] }))
    await expect(fetchCloudChatModels({ ...connection, service: 'gemini-native', protocol: 'google-native',
      endpoint: 'https://generativelanguage.googleapis.com/' }, 'key', signal, fetcher)).resolves.toEqual([
      { id: 'gemini-test', contextWindow: 4096, maxOutputTokens: 1024 },
    ])
  })
})

it('requires an API key before probing a standard OpenAI model', async () => {
  const profile = { id: 'profile', name: 'Model', model: 'model', endpoint: 'https://api.openai.com/v1',
    apiFormat: 'chat-responses' as const, contextWindow: 4096, maxOutputTokens: 1024, languages: ['en'] }
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } }
  const acquire = vi.fn()
  await expect(probeCloudLanguageModel('custom:profile', settings, async () => '', acquire, signal))
    .rejects.toMatchObject({ code: 'CLOUD_MODEL_KEY_REQUIRED' })
  expect(acquire).not.toHaveBeenCalled()
})
