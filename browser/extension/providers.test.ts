import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProvider, parseProviders, providerSchema, requestProviderAccess } from './providers'
import { generateWith, translateWith, ProviderError, safeProviderError, readProviderBytes, readProviderJson } from './provider-execution'
import { buildTranslationPrompt, providerMessageSchema, setupProviderRuntime } from './provider-runtime'
import { parseBatchResult } from './provider-batch'

beforeEach(() => { vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn().mockResolvedValue(true) } }); vi.restoreAllMocks() })
describe('provider trust boundaries', () => {
  it('never forwards response fragments or unknown exception messages as error codes', async () => {
    const secret = 'private-key-should-never-leave-background'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`upstream accidentally echoed ${secret}`)))
    let failure: unknown
    try { await generateWith({ ...createProvider('openai'), model: 'test' }, 'Hello', new AbortController().signal) } catch (error) { failure = error }
    expect(safeProviderError(failure)).toBe('providerInvalid')
    expect(String(failure)).not.toContain(secret)
    expect(safeProviderError(new SyntaxError(secret))).toBe('providerRequestFailed')
    expect(safeProviderError(new ProviderError(secret))).toBe('providerRequestFailed')
    expect(safeProviderError(new Error('modelDisabled'))).toBe('modelDisabled')
  })
  it('cancels an oversized response while streaming even without a truthful length header', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)) }, cancel,
    }), { headers: { 'content-length': '1' } })
    await expect(readProviderBytes(response, 6)).rejects.toThrow('providerResponseSize')
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects declared oversized bodies before reading and cancels stalled readers on abort', async () => {
    const cancel = vi.fn()
    const declared = new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '1000' } })
    await expect(readProviderBytes(declared, 10)).rejects.toThrow('providerResponseSize')
    expect(cancel).toHaveBeenCalledOnce()
    const controller = new AbortController()
    const stalled = new Response(new ReadableStream({ cancel }))
    const pending = readProviderJson(stalled, controller.signal)
    controller.abort(new ProviderError('providerTimeout'))
    await expect(pending).rejects.toThrow('providerTimeout')
    expect(cancel).toHaveBeenCalledTimes(2)
  })
  it('rejects duplicate identities, impersonated native connections and credential-bearing URLs', () => {
    const connection = createProvider('google-translate')
    expect(() => parseProviders([connection, connection])).toThrow()
    expect(providerSchema.safeParse({ ...connection, id: 'desktop' }).success).toBe(false)
    for (const baseUrl of ['https://user:secret@example.com', 'https://example.com?key=secret', 'javascript:alert(1)']) expect(providerSchema.safeParse({ ...connection, baseUrl }).success).toBe(false)
  })
  it('does not accept arbitrary credentials or URLs from a content request', () => {
    const request = { id: 'a', type: 'translate', text: 'Hi', sourceLanguage: 'en', targetLanguage: 'zh', purpose: 'web' }
    expect(providerMessageSchema.safeParse(request).success).toBe(true)
    expect(providerMessageSchema.safeParse({ ...request, apiKey: 'secret', baseUrl: 'https://example.com' }).success).toBe(false)
  })
  it('authorizes derived voice hosts explicitly', async () => {
    const connection = createProvider('alibaba')
    connection.options = { workspaceId: 'workspace', region: 'ap-southeast-1' }
    await requestProviderAccess(connection)
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: expect.arrayContaining(['https://workspace.ap-southeast-1.maas.aliyuncs.com/*']) })
  })
  it('rejects an invalid edited address before opening a permission prompt', async () => {
    await expect(requestProviderAccess({ ...createProvider('openai'), baseUrl: 'not a URL' })).rejects.toThrow('providerInvalid')
    expect(chrome.permissions.request).not.toHaveBeenCalled()
  })
})
describe('provider execution', () => {
  it('leaves speed and volume to the player instead of applying preferences twice', async () => {
    const providers = await import('./providers')
    const execution = await import('./provider-execution')
    const provider = createProvider('edge-tts')
    vi.spyOn(providers, 'getProvider').mockResolvedValue(provider)
    const synthesize = vi.spyOn(execution, 'synthesizeWith').mockResolvedValue({ audioBase64: 'AA==', contentType: 'audio/mpeg' })
    const event = () => ({ addListener: vi.fn() })
    const runtime = { onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
    vi.stubGlobal('chrome', { runtime, storage: { onChanged: event(), local: { get: vi.fn().mockResolvedValue({ ttsRate: 1.5, ttsVolume: 0.4, ttsPitch: 1.2 }) } } })
    setupProviderRuntime()
    const port = { name: 'nola-provider', sender: { url: runtime.getURL('options.html') }, onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() }
    runtime.onConnect.addListener.mock.calls[0][0](port)
    port.onMessage.addListener.mock.calls[0][0]({ type: 'synthesize', id: 'speech', text: 'Hello', language: 'en' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalled())
    expect(synthesize).toHaveBeenCalledWith(provider, 'Hello', 'en', '', 1, expect.any(AbortSignal), 1.2, 1)
  })
  it('translates with Microsoft without connecting to the desktop', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ translations: [{ text: '你好' }] }]), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await translateWith(createProvider('microsoft-translate'), 'Hello', 'auto', 'zh', '', new AbortController().signal)).toBe('你好')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(['Hello'])
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
  })
  it('keeps model output aligned and refuses missing/duplicated batch IDs', () => {
    expect(parseBatchResult('[{"id":1,"text":"B"},{"id":0,"text":"A"}]', 2)).toEqual(['A', 'B'])
    expect(() => parseBatchResult('[{"id":0,"text":"A"},{"id":0,"text":"B"}]', 2)).toThrow()
    expect(() => parseBatchResult('[{"id":0,"text":"A"}]', 2)).toThrow()
  })
  it('interpolates language prompts and adds matching terminology', () => {
    const prompt = buildTranslationPrompt('API', 'en', 'zh', '{{sourceLanguage}} -> {{targetLanguage}}: {{text}}', [{ source: 'API', target: '接口' }])
    expect(prompt).toContain('en -> zh: API')
    expect(prompt).toContain('["API","接口"]')
  })
  it('normalizes permission and authentication errors without echoing credentials', async () => {
    vi.mocked(chrome.permissions.contains).mockResolvedValueOnce(false)
    await expect(translateWith(createProvider('google-translate'), 'Hello', 'en', 'zh', '', new AbortController().signal)).rejects.toThrow('providerPermission')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive response', { status: 401 })))
    const provider = { ...createProvider('openai'), apiKey: 'secret', model: 'custom' }
    await expect(generateWith(provider, 'Hello', new AbortController().signal)).rejects.toThrow('providerAuthentication')
  })
  it('parses Gemini text parts and uses its own authentication header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'answer' }] } }] })))
    vi.stubGlobal('fetch', fetcher)
    expect(await generateWith({ ...createProvider('google'), apiKey: 'test-key', model: 'example' }, 'Hello', new AbortController().signal)).toBe('answer')
    expect(fetcher.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key')
  })
})
