import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProvider, DEFAULT_PROVIDERS, parseProviders, providerSchema, requestProviderAccess, visibleProviderConnections } from './providers'
import { generateWith, translateImageWith, translateWith, ProviderError, safeProviderError, readProviderBytes, readProviderJson } from './provider-execution'
import { buildTranslationPrompt, providerMessageSchema, runLimitedTranslation, scheduleProviderTranslation, setupProviderRuntime } from './provider-runtime'
import { parseBatchResult } from './provider-batch'
import { DEFAULT_PREFERENCES } from './preferences'
import { emptyGlossary } from '../../src/shared/glossary'

beforeEach(() => { vi.stubGlobal('chrome', { runtime: { id: 'test-extension' }, declarativeNetRequest: { updateSessionRules: vi.fn().mockResolvedValue(undefined) }, permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn().mockResolvedValue(true) } }); vi.restoreAllMocks() })
describe('provider trust boundaries', () => {
  it('rejects document translation requests from ordinary webpage senders', () => {
    const event = () => ({ addListener: vi.fn() })
    const runtime = { ...chrome.runtime, onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
    vi.stubGlobal('chrome', { ...chrome, runtime })
    setupProviderRuntime()
    const port = { name: 'nola-provider', sender: { url: 'https://example.com/article', tab: { id: 2 } }, onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() }
    runtime.onConnect.addListener.mock.calls[0][0](port)
    port.onMessage.addListener.mock.calls[0][0]({ type: 'translate', id: 'doc', text: 'Hello', sourceLanguage: 'en', targetLanguage: 'zh', purpose: 'document' })
    expect(port.postMessage).toHaveBeenCalledWith({ id: 'doc', error: 'providerPermission' })
  })
  it('adds the stable built-in Index connection to new and existing profiles without replacing user connections', () => {
    const builtin = DEFAULT_PROVIDERS.find(item => item.id === 'index-translate')!
    expect(builtin).toMatchObject({ preset: 'index-translate', apiKey: '', baseUrl: 'https://index-translate.bilibili.com/v1', model: 'Index-Translate-35B-A3B', translationConcurrency: 16 })
    const custom = { ...createProvider('index-translate'), baseUrl: 'https://example.com/v1', apiKey: 'custom-secret' }
    const restored = parseProviders([custom])
    expect(restored).toContainEqual(builtin)
    expect(restored).toContainEqual(custom)
    expect(parseProviders(restored)).toEqual(restored)
    expect(visibleProviderConnections(restored, custom.id)).toContainEqual(builtin)
    expect(parseProviders([{ ...builtin, translationConcurrency: undefined }]).find(item => item.id === builtin.id)?.translationConcurrency).toBe(16)
    expect(parseProviders([{ ...builtin, translationConcurrency: 5 }]).find(item => item.id === builtin.id)?.translationConcurrency).toBe(5)
  })
  it('preserves an existing conflicting provider ID instead of overwriting its configuration', () => {
    const conflicting = { ...createProvider('openai'), id: 'index-translate', model: 'existing', apiKey: 'preserved' }
    expect(parseProviders([conflicting])).toContainEqual(conflicting)
  })
  it('keeps a full legacy provider list valid after injecting the bundled service', () => {
    const old = Array.from({ length: 100 }, () => createProvider('google-translate'))
    const restored = parseProviders(old)
    expect(restored).toHaveLength(102)
    expect(parseProviders(restored)).toEqual(restored)
  })
  it('shows identical bundled connections once and keeps the bound ID and custom endpoints', () => {
    const bundled = createProvider('google-translate')
    const bound = createProvider('google-translate')
    const custom = { ...createProvider('google-translate'), baseUrl: 'https://example.com' }
    expect(visibleProviderConnections([bundled, bound, custom], bound.id)).toEqual([bound, custom])
  })
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
    expect(safeProviderError(new ProviderError('providerDisabled'))).toBe('providerDisabled')
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
  it('uses the configured concurrency for the bundled Index service', async () => {
    vi.useFakeTimers()
    try {
      const provider = DEFAULT_PROVIDERS.find(item => item.id === 'index-translate')!
      const controller = new AbortController()
      let started = 0
      const release: Array<() => void> = []
      const jobs = Array.from({ length: 5 }, () => scheduleProviderTranslation(provider, { ...DEFAULT_PREFERENCES, requestRate: 60 }, controller.signal, () => {
        started++
        return new Promise<string>(resolve => release.push(() => resolve('ok')))
      }))
      await vi.advanceTimersByTimeAsync(100)
      expect(started).toBe(5)
      release.forEach(resolve => resolve())
      await Promise.all(jobs)
    } finally { vi.useRealTimers() }
  })
  it('does not reserve rate-limit time for canceled requests that never started', async () => {
    vi.useFakeTimers()
    try {
      const provider = { ...createProvider('openai-compatible'), translationConcurrency: 3 }
      const settings = { ...DEFAULT_PREFERENCES, requestRate: 2 }
      const run = (signal: AbortSignal, perform: () => Promise<string>) =>
        scheduleProviderTranslation(provider, settings, signal, perform)
      const controller = new AbortController()
      const canceled = new AbortController()
      await expect(run(controller.signal, async () => 'first')).resolves.toBe('first')
      const stale = vi.fn(async () => 'stale')
      const discarded = Promise.allSettled([run(canceled.signal, stale), run(canceled.signal, stale)])
      await vi.advanceTimersByTimeAsync(100)
      canceled.abort()
      const fresh = vi.fn(async () => 'visible')
      const visible = run(controller.signal, fresh)
      await vi.advanceTimersByTimeAsync(399)
      expect(fresh).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(fresh).toHaveBeenCalledOnce()
      await expect(visible).resolves.toBe('visible')
      expect((await discarded).every(result => result.status === 'rejected')).toBe(true)
      expect(stale).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('shares a channel limit across requests, releases canceled waiters, and lets other channels run', async () => {
    const cancel = new AbortController()
    const signal = new AbortController().signal
    let finish!: (value: string) => void
    const first = runLimitedTranslation('first-channel', 1, signal, () => new Promise(resolve => { finish = resolve }))
    const runCanceled = vi.fn(async () => 'canceled')
    const canceled = expect(runLimitedTranslation('first-channel', 1, cancel.signal, runCanceled)).rejects.toThrow('canceled')
    const runNext = vi.fn(async () => 'next')
    const next = runLimitedTranslation('first-channel', 1, signal, runNext)
    await expect(runLimitedTranslation('other-channel', 1, signal, async () => 'other')).resolves.toBe('other')
    cancel.abort(new Error('canceled'))
    await canceled
    expect(runCanceled).not.toHaveBeenCalled()
    expect(runNext).not.toHaveBeenCalled()
    finish('first')
    await expect(first).resolves.toBe('first')
    await expect(next).resolves.toBe('next')
  })
  it('leaves speed and volume to the player instead of applying preferences twice', async () => {
    const providers = await import('./providers')
    const execution = await import('./provider-execution')
    const provider = createProvider('edge-tts')
    vi.spyOn(providers, 'getProvider').mockResolvedValue(provider)
    const synthesize = vi.spyOn(execution, 'synthesizeWith').mockResolvedValue({ audioBase64: 'AA==', contentType: 'audio/mpeg' })
    const event = () => ({ addListener: vi.fn() })
    const runtime = { onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
    vi.stubGlobal('chrome', { runtime, storage: { onChanged: event(), local: { get: vi.fn().mockResolvedValue({ ttsProvider: provider.id, ttsRate: 1.5, ttsVolume: 0.4, ttsPitch: 1.2 }) } } })
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
  it('uses the public Index-Translate model without desktop or API credentials', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] })))
    vi.stubGlobal('fetch', fetcher)
    const provider = { ...createProvider('index-translate'), apiKey: 'old-secret', headers: { 'X-Api-Key': 'old-header' } }
    await expect(Promise.all([1, 2].map(() => translateWith(provider, 'Hello', 'en', 'zh', 'Translate Hello to Chinese', new AbortController().signal)))).resolves.toEqual(['你好', '你好'])
    expect(fetcher.mock.calls[0][0]).toBe('https://index-translate.bilibili.com/v1/chat/completions')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ model: 'Index-Translate-35B-A3B', temperature: 0, chat_template_kwargs: { enable_thinking: false } })
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(fetcher.mock.calls[0][1].headers['X-Api-Key']).toBeUndefined()
    expect((chrome as unknown as { declarativeNetRequest: { updateSessionRules: unknown } }).declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith(expect.objectContaining({ addRules: [expect.objectContaining({ condition: expect.objectContaining({ initiatorDomains: ['test-extension'], resourceTypes: ['xmlhttprequest'] }) })] }))
    expect((chrome as unknown as { declarativeNetRequest: { updateSessionRules: unknown } }).declarativeNetRequest.updateSessionRules).toHaveBeenCalledOnce()
    expect(provider.apiKey).toBe('old-secret')
    expect(provider.headers['X-Api-Key']).toBe('old-header')
    await translateWith({ ...provider, baseUrl: 'https://example.com/v1' }, 'Hello', 'en', 'zh', 'Translate Hello to Chinese', new AbortController().signal)
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer old-secret')
    expect(fetcher.mock.calls[2][1].headers['X-Api-Key']).toBe('old-header')
  })
  it('sends only the requested PNG to Index-Translate as multimodal input', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] })))
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    const image = 'data:image/png;base64,aGVsbG8='
    expect(providerMessageSchema.safeParse({ id: 'test', type: 'translateImage', image, targetLanguage: 'zh' }).success).toBe(true)
    expect(providerMessageSchema.safeParse({ id: 'test', type: 'translateImage', image: 'https://example.com/image.png', targetLanguage: 'zh' }).success).toBe(false)
    expect(providerMessageSchema.safeParse({ id: 'test', type: 'translateImage', image: 'data:image/png;base64,' + 'A'.repeat(4000000), targetLanguage: 'zh' }).success).toBe(false)
    expect(await translateImageWith(createProvider('index-translate'), image, 'zh', signal)).toBe('你好')
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: image } })
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    await expect(translateImageWith(createProvider('google-translate'), image, 'zh', signal)).rejects.toThrow('providerImageUnsupported')
  })
  it('explains the Index-Translate public endpoint browser rejection without misclassifying other 412 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('blocked', { status: 412 })))
    const signal = new AbortController().signal
    const provider = createProvider('index-translate')
    await expect(translateWith(provider, 'Hello', 'en', 'zh', 'Translate Hello', signal)).rejects.toThrow('indexTranslateBrowserBlocked')
    expect(safeProviderError(new ProviderError('indexTranslateBrowserBlocked'))).toBe('indexTranslateBrowserBlocked')
    await expect(translateWith({ ...provider, baseUrl: 'http://127.0.0.1:8080/v1' }, 'Hello', 'en', 'zh', 'Translate Hello', signal)).rejects.toThrow('providerRequestFailed')
  })
  it('routes an Index webpage request through the public endpoint without a native connection', async () => {
    const providers = await import('./providers')
    const glossary = await import('./glossary-store')
    const cache = await import('./translation-cache')
    const index = DEFAULT_PROVIDERS.find(provider => provider.id === 'index-translate')!
    const getProvider = vi.spyOn(providers, 'getProvider').mockResolvedValue(index)
    vi.spyOn(glossary, 'recoverExtensionConfiguration').mockResolvedValue(undefined)
    vi.spyOn(glossary.extensionGlossary, 'snapshot').mockResolvedValue(emptyGlossary())
    vi.spyOn(cache, 'translationCacheKey').mockResolvedValue('index-web-test')
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Translated' } }] })))
    vi.stubGlobal('fetch', fetcher)
    const event = () => ({ addListener: vi.fn() })
    const runtime = { ...chrome.runtime, onConnect: event(), connectNative: vi.fn(), getURL: (path: string) => `chrome-extension://nola/${path}` }
    vi.stubGlobal('chrome', { ...chrome, runtime, storage: { onChanged: event(), local: { get: vi.fn().mockResolvedValue({ pageProvider: index.id }) } } })
    setupProviderRuntime()
    const port = { name: 'nola-provider', sender: { url: 'https://example.com/article', tab: { id: 2 } }, onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() }
    runtime.onConnect.addListener.mock.calls[0][0](port)
    port.onMessage.addListener.mock.calls[0][0]({ type: 'translate', id: 'web', text: 'Hello', sourceLanguage: 'en', targetLanguage: 'zh', purpose: 'web' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ id: 'web', result: { text: 'Translated' } }))
    expect(getProvider).toHaveBeenCalledWith(index.id, 'mt')
    expect(fetcher).toHaveBeenCalledWith('https://index-translate.bilibili.com/v1/chat/completions', expect.any(Object))
    expect(runtime.connectNative).not.toHaveBeenCalled()
  })
  it('keeps model output aligned and refuses missing/duplicated batch IDs', () => {
    expect(parseBatchResult('[{"id":1,"text":"B"},{"id":0,"text":"A"}]', 2)).toEqual(['A', 'B'])
    expect(() => parseBatchResult('[{"id":0,"text":"A"},{"id":0,"text":"B"}]', 2)).toThrow()
    expect(() => parseBatchResult('[{"id":0,"text":"A"}]', 2)).toThrow()
  })
  it('interpolates language prompts and adds matching terminology', () => {
    const prompt = buildTranslationPrompt('API', 'en', 'zh', '{{sourceLanguage}} -> {{targetLanguage}}: {{text}}', [{ source: 'API', target: '接口' }])
    expect(prompt).toContain('en -> zh: API')
    expect(prompt).toContain('"source":"API","target":"接口","mode":"fixed"')
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
