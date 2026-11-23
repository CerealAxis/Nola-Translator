import { generateText } from 'ai'
import { afterEach, expect, it, vi } from 'vitest'
import { createGatewayLanguageModel } from '../../src/main/gateway-language-model'
import { astrBotChatPresets, type AstrBotChatService } from '../../src/shared/astrbot-chat-presets'
import { DEFAULT_SETTINGS } from '../../src/shared/settings'

async function run(service: AstrBotChatService, model: string, endpoint?: string) {
  const preset = astrBotChatPresets.find(item => item.id === service)!
  const protocol = 'protocol' in preset ? preset.protocol : 'chat-completions'
  const profile = { id: 'test-profile', name: model, model, endpoint: endpoint ?? preset.endpoint,
    apiFormat: protocol === 'anthropic' ? protocol : 'chat-completions' as const,
    languages: ['zh'], contextWindow: 4096, maxOutputTokens: 256 }
  const settings = {
    ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] },
    modelWorkspace: { localSources: {}, connections: [{
      id: 'test-connection', capability: 'LLM' as const, service, name: preset.name,
      endpoint: profile.endpoint, protocol, workspace: '2024-05-01-preview', region: '',
      models: [{ id: model, name: model, enabled: true, profileId: profile.id }],
    }] },
  }
  const signal = new AbortController().signal
  const runtime = await createGatewayLanguageModel({ getSettings: () => settings, getCredential: async () => 'fake-key' },
    'custom:' + profile.id, signal)
  try {
    await generateText({ model: runtime.model('auto'), prompt: 'Test', maxRetries: 0, abortSignal: signal }).catch(() => {})
  } finally {
    await runtime.close()
  }
}

afterEach(() => vi.unstubAllGlobals())

it('uses the saved context, output limit and reasoning mode for local chat', async () => {
  const id = 'qwen35-0.8b-q4-k-m'
  const settings = { ...DEFAULT_SETTINGS, modelWorkspace: { connections: [], localSources: {},
    localChat: { [id]: { contextWindow: 8192, maxOutputTokens: 1024, reasoningLevels: ['enabled' as const] } } } }
  const openLocalLanguageModel = vi.fn(async () => ({
    endpoint: 'http://127.0.0.1:5000/v1', headers: {}, contextWindow: 8192, release: async () => {},
  }))
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  const runtime = await createGatewayLanguageModel({ getSettings: () => settings, getCredential: async () => '', openLocalLanguageModel }, `resource:${id}`, signal)
  try {
    expect(openLocalLanguageModel).toHaveBeenCalledExactlyOnceWith(id, signal, 8192)
    expect(runtime.profile).toMatchObject({ contextWindow: 8192, maxOutputTokens: 1024 })
    await generateText({ model: runtime.model('auto'), prompt: 'Test', maxOutputTokens: runtime.profile.maxOutputTokens, maxRetries: 0 }).catch(() => {})
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({
      max_tokens: 1024, chat_template_kwargs: { enable_thinking: true },
    })
  } finally {
    await runtime.close()
  }
})

it('routes native Gemini to generateContent with AstrBot safety and thinking defaults', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await run('gemini-native', 'gemini-2.5-flash')
  expect(fetch).toHaveBeenCalledOnce()
  const [url, init] = fetch.mock.calls[0]
  expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
  expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('fake-key')
  expect(JSON.parse(init!.body as string)).toMatchObject({
    safetySettings: expect.arrayContaining([{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }]),
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
  })
})

it('uses the Azure deployment path, API version and api-key header', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await run('azure-openai', 'my-deployment', 'https://example.openai.azure.com')
  expect(fetch).toHaveBeenCalledOnce()
  const [url, init] = fetch.mock.calls[0]
  expect(String(url)).toBe('https://example.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-05-01-preview')
  expect(new Headers(init?.headers).get('api-key')).toBe('fake-key')
  expect(new Headers(init?.headers).has('authorization')).toBe(false)
})

it.each([
  ['kimi-code', 'https://api.kimi.com/coding/v1/messages', 'User-Agent', 'astrbot/4.29.4'],
  ['kimi-code-global', 'https://api.kimi.ai/coding/v1/messages', 'User-Agent', 'astrbot/4.29.4'],
  ['minimax-token-plan', 'https://api.minimax.cn/anthropic/v1/messages', 'Authorization', 'Bearer fake-key'],
  ['minimax-token-plan-global', 'https://api.minimax.io/anthropic/v1/messages', 'Authorization', 'Bearer fake-key'],
  ['minimax-chat', 'https://api.minimax.cn/v1/chat/completions', 'Authorization', 'Bearer fake-key'],
  ['minimax-chat-global', 'https://api.minimax.io/v1/chat/completions', 'Authorization', 'Bearer fake-key'],
  ['moonshot-global', 'https://api.moonshot.ai/v1/chat/completions', 'Authorization', 'Bearer fake-key'],
  ['qwencloud', 'https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1/chat/completions', 'Authorization', 'Bearer fake-key'],
  ['xiaomi-token-plan', 'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages', 'Authorization', 'Bearer fake-key'],
  ['ssycloud', 'https://router.shengsuanyun.com/api/v1/chat/completions', 'X-Title', 'AstrBot'],
] as const)('applies the protocol and required header for %s', async (service, endpoint, header, value) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await run(service, 'test-model')
  expect(fetch).toHaveBeenCalledOnce()
  const [url, init] = fetch.mock.calls[0]
  expect(String(url)).toBe(endpoint)
  expect(new Headers(init?.headers).get(header)).toContain(value)
})

it.each(['minimax-token-plan', 'minimax-token-plan-global', 'xiaomi-token-plan'] as const)('honors the address saved for %s', async service => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await run(service, 'test-model', 'https://proxy.example/anthropic')
  expect(fetch).toHaveBeenCalledOnce()
  expect(String(fetch.mock.calls[0][0])).toBe('https://proxy.example/anthropic/v1/messages')
})
