import { createServer } from 'node:net'
import { File as NodeFile } from 'node:buffer'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { DEFAULT_SETTINGS } from '../../src/shared/settings'
import { mergeModelPolicy, modelEnablePatch } from '../../src/shared/model-policy'
import type { GatewayCapability } from '../../src/shared/model-gateway'
import type { AppSettings, CredentialProvider } from '../../src/shared/settings'
import type { ResourceRecord } from '../../src/shared/contracts'
import { ModelGateway, translationRequest } from '../../src/main/model-gateway'
import { createGatewayWorker, GatewayWorkerError, type GatewayWorker, type GatewayWorkerFactory, type GatewayWorkerResult } from '../../src/main/model-gateway-worker'
import type { createGatewayLanguageModel } from '../../src/main/gateway-language-model'

const gateways: ModelGateway[] = []
afterEach(async () => { await Promise.all(gateways.splice(0).map(gateway => gateway.dispose())); vi.unstubAllGlobals() })
function enable(settings: AppSettings, kind: GatewayCapability, binding: string): void {
  settings.modelPolicy = mergeModelPolicy(settings, modelEnablePatch(settings, kind, binding, true).modelPolicy)
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
async function freePort(): Promise<number> {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>(resolve => server.close(() => resolve())); return port
}
function wav(): Buffer {
  const output = Buffer.alloc(48); output.write('RIFF'); output.writeUInt32LE(40, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(16000, 24); output.writeUInt32LE(32000, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(4, 40); return output
}
async function fixture(factory?: GatewayWorkerFactory, createLanguageModel?: typeof createGatewayLanguageModel, getCredential?: (provider: CredentialProvider) => Promise<string>) {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.modelGateway = { host: '127.0.0.1', port: await freePort(), asr: true, mt: true, tts: true, targetLanguage: 'zh' }
  settings.recognition.provider = 'local'; settings.recognition.modelId = 'asr-test'; settings.translation.provider = 'local'; settings.translation.localModelId = 'mt-test'; settings.synthesis = { modelId: 'tts-test', voice: 'Voice' }
  const resources = ['asr', 'mt', 'tts'].map(kind => ({ resourceId: `${kind}-test`, kind: kind === 'asr' ? 'recognitionModel' : kind === 'mt' ? 'translationModel' : 'ttsModel', name: kind, installed: true } as ResourceRecord))
  const workers: Array<GatewayWorker & { kind: string; fail(message: string): void }> = []
  let key = ''
  const create: GatewayWorkerFactory = factory ?? ((_launch, init, fail) => {
    const listeners = new Set<(event: GatewayWorkerResult) => void>()
    const worker = { kind: String(init.kind), fail, ready: Promise.resolve({ voices: ['Voice'] }), close: vi.fn(async () => undefined),
      subscribe: (listener: (event: GatewayWorkerResult) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      request: vi.fn(async (payload: GatewayWorkerResult) => {
        if (payload.op === 'session.commit' || payload.op === 'session.finish') for (const listener of listeners) listener({ session: payload.session, event: { type: 'conversation.item.input_audio_transcription.completed', transcript: 'recognized' } })
        if (payload.op !== 'infer') return {}
        if (init.kind === 'tts') return { audio: payload.response_format === 'mp3' ? 'data:audio/mpeg;base64,' + Buffer.from([0xff, 0xfb, 0x90, 0x00]).toString('base64') : 'data:audio/wav;base64,' + wav().toString('base64') }
        return { text: init.kind === 'asr' ? 'recognized' : `${payload.target}:${payload.text}` }
      }),
    }
    workers.push(worker); return worker
  })
  const gateway = new ModelGateway({ getSettings: () => settings, listResources: async () => resources, directLaunch: async () => ({ command: 'unused', args: [], cwd: process.cwd() }), getKey: async () => key, setKey: async value => { key = value }, createWorker: create, createLanguageModel, getCredential })
  gateways.push(gateway)
  const base = `http://127.0.0.1:${settings.modelGateway.port}`
  const headers = async () => ({ Authorization: `Bearer ${await gateway.revealKey()}`, 'Content-Type': 'application/json' })
  return { gateway, settings, resources, workers, base, headers }
}

describe('local gateway', () => {
  it('internally routes cloud translation while keeping public model IDs fixed', async () => {
    const initialized: GatewayWorkerResult[] = []
    const test = await fixture((_launch, init) => {
      initialized.push(init)
      return { ready: Promise.resolve({}), request: async () => ({ text: 'translated' }), subscribe: () => () => undefined, close: async () => undefined }
    })
    test.settings.modelGateway.asr = false; test.settings.modelGateway.tts = false
    test.settings.translation.provider = 'index-translate'
    await test.gateway.start()
    expect(test.gateway.snapshot().services.mt.state).toBe('ready')
    expect(initialized[0]).toMatchObject({ kind: 'mt', config: { translationProvider: 'index-translate' } })
    const models = await fetch(test.base + '/v1/models', { headers: await test.headers() }).then(response => response.json())
    expect(models.data.map((model: { id: string }) => model.id)).toEqual(['nola-mt'])
    const result = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'hello' }] }) }).then(response => response.json())
    expect(result.model).toBe('nola-mt')
    expect(result.choices[0].message.content).toBe('translated')
  })
  it('checks readiness only for the capabilities a session requests', async () => {
    const test = await fixture()
    expect(() => test.gateway.requireCapabilities(true)).toThrow('Start it in Model Gateway')
    await test.gateway.start()
    // A native-translation preference with no target languages starts recognition alone.
    expect(() => test.gateway.requireCapabilities(false, true)).not.toThrow()
    expect(() => test.gateway.requireCapabilities(true, true)).toThrow('does not provide native translation')
    expect(() => test.gateway.requireCapabilities(true)).not.toThrow()
    test.settings.modelGateway.mt = false
    await test.gateway.reconfigure()
    expect(() => test.gateway.requireCapabilities(true)).toThrow('MT service is not ready')
  })
  it('prefers the explicit gateway fallback over the native session backup', async () => {
    const initialized: GatewayWorkerResult[] = []
    const test = await fixture((_launch, init) => {
      initialized.push(init)
      return { ready: Promise.resolve({}), request: async () => ({}), subscribe: () => () => {}, close: async () => {} }
    })
    test.settings.modelGateway.asr = false
    test.settings.modelGateway.tts = false
    test.settings.translation.provider = 'recognition'
    test.settings.translation.fallback.provider = 'google'
    test.settings.modelGateway.mtFallbackModel = 'cloud:mymemory'
    enable(test.settings, 'mt', 'cloud:google')
    enable(test.settings, 'mt', 'cloud:mymemory')
    await test.gateway.start()
    expect(initialized[0]).toMatchObject({ config: { translationProvider: 'google' }, fallbackConfig: { translationProvider: 'mymemory' } })
    expect(initialized[0].fallbackUsesPrimary).not.toBe(true)
  })

  it('leases two explicitly enabled cloud bindings without local startup and reuses each instance', async () => {
    const test = await fixture()
    enable(test.settings, 'mt', 'cloud:mymemory')
    enable(test.settings, 'mt', 'cloud:index-translate')
    const [first, second, shared] = await Promise.all([
      test.gateway.leaseCapability('mt', 'cloud:mymemory'),
      test.gateway.leaseCapability('mt', 'cloud:index-translate'),
      test.gateway.leaseCapability('mt', 'cloud:mymemory'),
    ])
    expect(first.worker).not.toBe(second.worker)
    expect(first.worker).toBe(shared.worker)
    expect(test.workers.filter(worker => worker.kind === 'mt')).toHaveLength(2)
    expect(test.gateway.snapshot().state).toBe('stopped')
    first.release(); second.release(); shared.release()
  })

  it('keeps cloud leases alive and closes an idle instance exactly once', async () => {
    const test = await fixture()
    enable(test.settings, 'mt', 'cloud:mymemory')
    await test.gateway.start()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const first = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
      const second = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
      first.release()
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(first.worker.close).not.toHaveBeenCalled()
      second.release()
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
      const renewed = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
      await vi.advanceTimersByTimeAsync(60 * 1000)
      expect(first.worker.close).not.toHaveBeenCalled()
      renewed.release()
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(first.worker.close).toHaveBeenCalledOnce()
      await test.gateway.stop()
      expect(first.worker.close).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('starts all enabled models concurrently and retains successful capabilities after an OOM', async () => {
    const started: string[] = []; const hydration = deferred<GatewayWorkerResult>()
    const test = await fixture((_launch, init) => {
      started.push(String(init.kind))
      return { ready: init.kind === 'tts' ? Promise.reject(new Error('out of memory')) : hydration.promise, request: async () => ({}), subscribe: () => () => undefined, close: vi.fn(async () => undefined) }
    })
    const startup = test.gateway.start()
    await vi.waitFor(() => expect(started).toEqual(['asr', 'mt', 'tts']))
    expect(test.gateway.snapshot().state).toBe('starting')
    hydration.resolve({})
    const snapshot = await startup
    expect(snapshot.state).toBe('running'); expect(snapshot.services.asr.state).toBe('ready'); expect(snapshot.services.mt.state).toBe('ready'); expect(snapshot.services.tts.state).toBe('failed')
  })

  it('authenticates routes, supports browser preflight, and returns OpenAI translation responses', async () => {
    const test = await fixture(); await test.gateway.start()
    expect((await fetch(test.base + '/v1/models')).status).toBe(401)
    const preflight = await fetch(test.base + '/v1/chat/completions', { method: 'OPTIONS', headers: { Origin: 'https://reader.example', 'Access-Control-Request-Headers': 'authorization,content-type' } })
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe('https://reader.example')
    const response = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: { ...await test.headers(), Origin: 'chrome-extension://translator' }, body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }], translation_options: { target_lang: 'ja' } }) })
    expect(response.headers.get('access-control-allow-origin')).toBe('chrome-extension://translator')
    expect((await response.json()).choices[0].message.content).toBe('ja:Hello')
    const stream = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'Hi' }] }) })
    expect(await stream.text()).toContain('data: [DONE]')
    const wrong = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ model: 'nola-asr', messages: [{ role: 'user', content: 'Hi' }] }) })
    expect(wrong.status).toBe(404)
  })

  it('returns speech as binary MP3 by default and explicit WAV/PCM, and reads multipart audio', async () => {
    vi.stubGlobal('File', NodeFile)
    const test = await fixture(); await test.gateway.start()
    for (const [format, type, length] of [[undefined, 'audio/mpeg', 4], ['wav', 'audio/wav', 48], ['pcm', 'application/octet-stream', 4]] as const) {
      const response = await fetch(test.base + '/v1/audio/speech', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ input: 'Hello', response_format: format }) })
      expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe(type)
      const output = Buffer.from(await response.arrayBuffer()); expect(output.length).toBe(length)
      if (format === 'wav') expect(output.toString('ascii', 0, 4)).toBe('RIFF')
      if (!format) expect(output[0]).toBe(0xff)
    }
    const boundary = 'nola-test-boundary'
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nnola-asr\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`), wav(), Buffer.from(`\r\n--${boundary}--\r\n`)])
    const response = await fetch(test.base + '/v1/audio/transcriptions', { method: 'POST', headers: { ...await test.headers(), 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
    expect(await response.json()).toEqual({ text: 'recognized' })
  })

  it('issues single-use realtime tickets and invalidates them and old keys upon rotation', async () => {
    const test = await fixture(); await test.gateway.start()
    const oldHeaders = await test.headers()
    const ticketResponse = await fetch(test.base + '/v1/realtime/sessions', { method: 'POST', headers: oldHeaders })
    const ticket = await ticketResponse.json()
    expect(ticket.client_secret.value).not.toBe(await test.gateway.revealKey())
    const client = new WebSocket(test.base.replace('http:', 'ws:') + ticket.url)
    const events: Array<Record<string, unknown>> = []
    client.on('message', bytes => events.push(JSON.parse(bytes.toString())))
    await once(client, 'open')
    client.send(JSON.stringify({ type: 'session.update', session: { model: 'nola-asr', turn_detection: null } }))
    client.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: Buffer.alloc(640).toString('base64') }))
    client.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    await vi.waitFor(() => expect(events.some(event => event.type === 'conversation.item.input_audio_transcription.completed')).toBe(true))
    const reused = new WebSocket(test.base.replace('http:', 'ws:') + ticket.url)
    const reuseError = await new Promise<Error>(resolve => reused.once('error', resolve))
    expect(reuseError.message).toContain('401')
    const closed = once(client, 'close'); await test.gateway.rotateKey(); await closed
    expect((await fetch(test.base + '/v1/models', { headers: oldHeaders })).status).toBe(401)
    expect((await fetch(test.base + '/v1/models', { headers: await test.headers() })).status).toBe(200)
  })

  it('reconfigures only affected models, pins running requests, and supports cloud defaults', async () => {
    const test = await fixture(); await test.gateway.start()
    const mt = test.workers.find(worker => worker.kind === 'mt')!
    const answer = deferred<GatewayWorkerResult>()
    vi.mocked(mt.request).mockImplementationOnce(() => answer.promise)
    const pending = fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }) })
    await vi.waitFor(() => expect(test.gateway.snapshot().activeRequests).toBe(1))
    test.resources.push({ ...test.resources.find(resource => resource.resourceId === 'mt-test')!, resourceId: 'mt-next' })
    test.settings.translation.localModelId = 'mt-next'; await test.gateway.reconfigure()
    expect(mt.close).not.toHaveBeenCalled()
    answer.resolve({ text: 'old model result' }); expect((await (await pending).json()).choices[0].message.content).toBe('old model result')
    await vi.waitFor(() => expect(mt.close).toHaveBeenCalledOnce())
    expect(test.workers.filter(worker => worker.kind === 'asr')).toHaveLength(1)
    test.settings.modelGateway.mt = true; test.settings.translation.provider = 'cloud'; await test.gateway.reconfigure()
    expect(test.gateway.snapshot().services.mt.state).toBe('ready')
    expect(test.gateway.snapshot().services.asr.state).toBe('ready')
  })

  // Real worker startup and Windows process-tree cleanup need more than the default 5s budget.
  it('cancels one client without killing its persistent worker or another request', async () => {
    const script = `// nola_translator_engine.gateway_worker\nconst r=require('readline').createInterface({input:process.stdin});r.on('line',line=>{const v=JSON.parse(line);setTimeout(()=>process.stdout.write(JSON.stringify({id:v.id,result:{text:v.text||'ready'}})+'\\n'),v.op==='init'?0:80)})`
    const worker = createGatewayWorker({ command: process.execPath, args: ['-e', script], cwd: process.cwd() }, {}, vi.fn())
    try {
      await worker.ready
      const controller = new AbortController()
      const first = worker.request({ op: 'infer', text: 'cancel' }, controller.signal)
      const second = worker.request({ op: 'infer', text: 'survives' })
      controller.abort()
      await expect(first).rejects.toMatchObject({ name: 'AbortError' })
      expect(await second).toEqual({ text: 'survives' })
      expect(await worker.request({ op: 'infer', text: 'still loaded' })).toEqual({ text: 'still loaded' })
    } finally { await worker.close() }
  }, 20_000)

  it('understands common translation prompts and explicit language overrides', () => {
    expect(translationRequest({ messages: [{ role: 'system', content: 'Translate the following text into Japanese.' }, { role: 'user', content: 'Hello' }] }, 'zh')).toMatchObject({ text: 'Hello', target: 'ja' })
    expect(translationRequest({ messages: [{ role: 'user', content: 'Translate into English: 你好' }], translation_options: { target_lang: 'fr' } }, 'zh')).toMatchObject({ text: '你好', target: 'fr' })
  })

  it('keeps internal inference alive when the public listener is disabled or reconfigured', async () => {
    const test = await fixture()
    test.settings.modelGateway.externalEnabled = false
    await test.gateway.start()
    const environment = test.gateway.sessionEnvironment()
    const headers = { Authorization: `Bearer ${environment.NOLA_GATEWAY_KEY}`, 'Content-Type': 'application/json' }
    const address = environment.NOLA_GATEWAY_ADDRESS!
    expect((await fetch(address + '/internal/status', { headers })).status).toBe(200)
    expect((await fetch(address + '/internal/status', { headers: await test.headers() })).status).not.toBe(200)
    await expect(fetch(test.base + '/v1/models', { headers: await test.headers() })).rejects.toThrow()
    expect(await test.gateway.infer({ id: crypto.randomUUID(), model: 'nola-mt', kind: 'mt', text: 'Hello', target: 'ja' }, new AbortController().signal)).toMatchObject({ text: 'ja:Hello' })
    test.settings.modelGateway.externalEnabled = true
    await test.gateway.reconfigure()
    expect((await fetch(test.base + '/v1/models', { headers: await test.headers() })).status).toBe(200)
    expect(test.gateway.sessionEnvironment()).toEqual(environment)
    expect(test.workers).toHaveLength(3)
    await test.gateway.rotateKey()
    expect((await fetch(address + '/internal/status', { headers })).status).toBe(200)
  })

  it('preserves streamed translation events, semantic cloud errors and readiness over the private API', async () => {
    const test = await fixture()
    await test.gateway.start()
    const environment = test.gateway.sessionEnvironment()
    const headers = { Authorization: `Bearer ${environment.NOLA_GATEWAY_KEY}`, 'Content-Type': 'application/json' }
    const mt = test.workers.find(worker => worker.kind === 'mt')!
    mt.request = vi.fn(async (_payload, _signal, onEvent) => {
      onEvent?.({ event: { type: 'translation.delta', text: 'partial' } })
      return { text: 'complete', path: ['en', 'zh'] }
    })
    const response = await fetch(environment.NOLA_GATEWAY_ADDRESS + '/internal/mt', { method: 'POST', headers, body: JSON.stringify({ text: 'Hello', source: 'en', target: 'zh', stream: true }) })
    expect((await response.text()).trim().split('\n').map(line => JSON.parse(line))).toEqual([{ text: 'partial' }, { text: 'complete', path: ['en', 'zh'], done: true }])
    mt.request = vi.fn(async () => { throw new GatewayWorkerError('rate_limited', 'Cloud rate limit or quota exceeded') })
    const failed = await fetch(environment.NOLA_GATEWAY_ADDRESS + '/internal/mt', { method: 'POST', headers, body: JSON.stringify({ text: 'Hello', source: 'en', target: 'zh', stream: true }) })
    expect(await failed.json()).toMatchObject({ error: { code: 'rate_limited' } })
    expect(test.gateway.snapshot().services.asr.state).toBe('ready')
    expect(test.gateway.snapshot().activeRequests).toBe(0)
  })

  it('pins ASR and MT for each business socket, including reset after a model switch', async () => {
    const test = await fixture()
    await test.gateway.start()
    const environment = test.gateway.sessionEnvironment()
    const client = new WebSocket(environment.NOLA_GATEWAY_ADDRESS!.replace('http:', 'ws:') + '/internal/asr', { headers: { Authorization: `Bearer ${environment.NOLA_GATEWAY_KEY}` } })
    await once(client, 'open')
    const rpc = async (payload: GatewayWorkerResult) => {
      const message = once(client, 'message')
      client.send(JSON.stringify(payload))
      return JSON.parse(String((await message)[0]))
    }
    expect(await rpc({ id: 'open', op: 'session.open', session: 'business', language: 'auto', targetLanguages: ['zh'] })).toMatchObject({ id: 'open', result: {} })
    const oldAsr = test.workers.find(worker => worker.kind === 'asr')!
    const oldMt = test.workers.find(worker => worker.kind === 'mt')!
    for (const kind of ['asr', 'mt'] as const) test.resources.push({ ...test.resources.find(resource => resource.resourceId === `${kind}-test`)!, resourceId: `${kind}-new` })
    test.settings.recognition.modelId = 'asr-new'
    test.settings.translation.localModelId = 'mt-new'
    await test.gateway.reconfigure()
    expect(oldAsr.close).not.toHaveBeenCalled()
    expect(oldMt.close).not.toHaveBeenCalled()
    await rpc({ id: 'reset', op: 'session.reset', session: 'business' })
    expect(oldAsr.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'session.reset' }))
    const translated = await fetch(environment.NOLA_GATEWAY_ADDRESS + '/internal/mt', { method: 'POST', headers: { Authorization: `Bearer ${environment.NOLA_GATEWAY_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session: 'business', text: 'Hello', target: 'zh' }) })
    expect((await translated.json()).text).toBe('zh:Hello')
    expect(oldMt.request).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello' }), expect.any(AbortSignal), expect.any(Function))
    const closed = once(client, 'close')
    client.close(); await closed
    await vi.waitFor(() => { expect(oldAsr.close).toHaveBeenCalledOnce(); expect(oldMt.close).toHaveBeenCalledOnce() })
  })

  it('owns LLM lifecycle independently and keeps active requests pinned until released', async () => {
    const runtimes: Array<{ close: ReturnType<typeof vi.fn> }> = []
    const test = await fixture(undefined, async (_services, binding) => {
      const runtime = { close: vi.fn(async () => {}), local: false, name: binding,
        profile: { id: binding, model: 'chat', endpoint: 'https://fixture.invalid/v1', apiFormat: 'chat-completions' as const, contextWindow: 4096, maxOutputTokens: 512 },
        model: () => 'fixture', redact: (value: string) => value }
      runtimes.push(runtime)
      return runtime
    })
    test.settings.modelGateway.llm = true
    test.settings.modelGateway.llmModel = 'custom:first'
    await test.gateway.start()
    const first = test.gateway.languageModel('custom:first')
    test.settings.modelGateway.llmModel = 'custom:second'
    await test.gateway.reconfigure()
    expect(runtimes[0].close).not.toHaveBeenCalled()
    expect(first.signal.aborted).toBe(false)
    const second = test.gateway.languageModel('custom:second')
    test.settings.modelGateway.llm = false
    await test.gateway.reconfigure()
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
    expect(() => test.gateway.languageModel()).toThrow('LLM service is not ready')
    first.release(); second.release()
    await vi.waitFor(() => { expect(runtimes[0].close).toHaveBeenCalledOnce(); expect(runtimes[1].close).toHaveBeenCalledOnce() })
    expect(test.gateway.snapshot().services.mt.state).toBe('ready')
  })

  it('does not validate or fail an unconfigured LLM capability while it is disabled', async () => {
    const test = await fixture()
    test.settings.modelGateway.llm = false
    test.settings.modelGateway.llmModel = 'custom:missing'
    await test.gateway.start()
    expect(test.gateway.snapshot().state).toBe('running')
    expect(test.gateway.snapshot().services.llm).toMatchObject({ state: 'stopped', model: 'custom:missing' })
  })

  it.each(['cloud', 'google'] as const)('uses the independent %s fallback credential for native speech translation', async provider => {
    const initialized: GatewayWorkerResult[] = []
    const credentials = vi.fn(async (slot: CredentialProvider) => `secret-for-${slot}`)
    const test = await fixture((_launch, init) => {
      initialized.push(init)
      return { ready: Promise.resolve({}), request: async () => ({}), subscribe: () => () => {}, close: async () => {} }
    }, undefined, credentials)
    test.settings.modelGateway.asr = false
    test.settings.modelGateway.tts = false
    test.settings.translation.provider = 'recognition'
    test.settings.translation.customModelId = 'unrelated-primary'
    test.settings.translation.fallback.provider = provider
    test.settings.translation.fallback.cloudEndpoint = 'https://fallback.invalid/v1'
    enable(test.settings, 'mt', provider === 'cloud' ? 'mt-custom:legacy-fallback' : 'cloud:google')
    await test.gateway.start()
    const config = initialized.find(init => init.kind === 'mt')!
    expect(config.fallbackUsesPrimary).toBe(true)
    expect((config.config as any).translationOptions.apiKey).toBe(`secret-for-fallback-${provider}`)
    expect(credentials).not.toHaveBeenCalledWith('cloud-model:unrelated-primary')
    expect(JSON.stringify(test.gateway.snapshot())).not.toContain('secret-for-')
  })

  it('closes every retired capability generation when that capability is disabled', async () => {
    const test = await fixture()
    await test.gateway.start()
    const lease = await test.gateway.leaseCapability('asr')
    const old = test.workers.find(worker => worker.kind === 'asr')!
    test.resources.push({ ...test.resources[0], resourceId: 'asr-replacement' })
    test.settings.recognition.modelId = 'asr-replacement'
    await test.gateway.reconfigure()
    expect(old.close).not.toHaveBeenCalled()
    test.settings.modelGateway.asr = false
    await test.gateway.reconfigure()
    expect(old.close).toHaveBeenCalledOnce()
    lease.release()
    expect(old.close).toHaveBeenCalledOnce()
    expect(test.gateway.snapshot().services.mt.state).toBe('ready')
  })

  it('marks a stopped local LLM failed and can restart the same binding', async () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modelGateway = { ...settings.modelGateway, externalEnabled: false, asr: false, mt: false, tts: false, llm: true, llmModel: 'resource:qwen35-fixture' }
    const script = `require('readline').createInterface({input:process.stdin}).on('line',line=>{const v=JSON.parse(line);process.stdout.write(JSON.stringify({id:v.id,endpoint:'http://127.0.0.1:12345/v1',contextWindow:4096})+'\\n');setTimeout(()=>process.exit(0),150)})`
    const launch = vi.fn(async () => ({ command: process.execPath, args: ['-e', script], cwd: process.cwd() }))
    const gateway = new ModelGateway({ getSettings: () => settings, getCredential: async () => '', directLaunch: launch,
      listResources: async () => [], getKey: async () => 'fixture-key', setKey: async () => {} })
    gateways.push(gateway)
    await gateway.start()
    const lease = gateway.languageModel()
    await vi.waitFor(() => expect(gateway.snapshot().services.llm.state).toBe('failed'))
    expect(lease.signal.aborted).toBe(true)
    lease.release()
    await gateway.reconfigure()
    expect(gateway.snapshot().services.llm.state).toBe('ready')
    expect(launch).toHaveBeenCalledTimes(2)
  }, 20_000)
})

describe('independent cloud consumers', () => {
  it('rejects a disabled cloud binding server-side, including one disabled after an active lease', async () => {
    const test = await fixture()
    test.settings.modelPolicy = { enabled: {}, defaults: {}, selections: {} }
    await expect(test.gateway.leaseCapability('mt', 'cloud:mymemory')).rejects.toMatchObject({ code: 'model_disabled' })
    expect(test.workers).toHaveLength(0)
    enable(test.settings, 'mt', 'cloud:mymemory')
    const lease = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
    Object.assign(test.settings, modelEnablePatch(test.settings, 'mt', 'cloud:mymemory', false))
    await expect(test.gateway.leaseCapability('mt', 'cloud:mymemory')).rejects.toMatchObject({ code: 'model_disabled' })
    lease.release()
  })

  it('prepares cloud ASR and MT on the private transport without loading local weights', async () => {
    const test = await fixture(undefined, undefined, async () => 'fixture-key')
    test.settings.recognition.aliyunWorkspaceId = 'fixture-workspace'
    enable(test.settings, 'asr', 'cloud:aliyun')
    enable(test.settings, 'mt', 'cloud:mymemory')
    await test.gateway.prepareSession({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'en', targetLanguages: ['zh'],
      recognitionProvider: 'aliyun', recognitionBinding: 'cloud:aliyun', translationProvider: 'mymemory', translationBinding: 'cloud:mymemory' })
    expect(test.gateway.snapshot().state).toBe('stopped')
    expect(test.workers.map(worker => worker.kind)).toEqual(['asr', 'mt'])
    const environment = test.gateway.sessionEnvironment()
    const headers = { Authorization: `Bearer ${environment.NOLA_GATEWAY_KEY}`, 'Content-Type': 'application/json' }
    const response = await fetch(environment.NOLA_GATEWAY_ADDRESS + '/internal/mt', { method: 'POST', headers,
      body: JSON.stringify({ model: 'cloud:mymemory', text: 'Hello', target: 'zh' }) })
    expect(await response.json()).toMatchObject({ text: 'zh:Hello' })
    await test.gateway.stop()
    expect((await fetch(environment.NOLA_GATEWAY_ADDRESS + '/internal/status', { headers })).status).toBe(200)
    const lease = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
    expect(lease.worker).toBe(test.workers.find(worker => worker.kind === 'mt'))
    lease.release()
  })

  it('exposes a cloud-only API binding independently of local loading switches and defaults', async () => {
    const test = await fixture()
    test.settings.modelGateway = { ...test.settings.modelGateway, asr: false, mt: false, tts: false, llm: false,
      externalModels: { mt: 'cloud:mymemory' }, externalCapabilities: { asr: false, mt: true, tts: false, llm: false } }
    enable(test.settings, 'mt', 'cloud:mymemory')
    await test.gateway.start()
    expect(test.workers).toHaveLength(0)
    const models = await fetch(test.base + '/v1/models', { headers: await test.headers() }).then(response => response.json())
    expect(models.data.map((model: { id: string }) => model.id)).toEqual(['nola-mt'])
    const response = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
    expect(response.status).toBe(200)
    expect((await response.json()).choices[0].message.content).toBe('zh:Hello')
    expect(test.workers.map(worker => worker.kind)).toEqual(['mt'])
    Object.assign(test.settings, modelEnablePatch(test.settings, 'mt', 'cloud:mymemory', false))
    const rejected = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
    expect(rejected.status).toBe(503)
    expect(await rejected.json()).toMatchObject({ error: { code: 'model_disabled' } })
  })

  it('acquires a saved enabled cloud LLM without starting or rebinding local services', async () => {
    const close = vi.fn(async () => {})
    const create = vi.fn<typeof createGatewayLanguageModel>(async (_services, binding) => ({ close, local: false, name: binding,
      profile: { id: 'scene', model: 'fixture', endpoint: 'https://fixture.invalid/v1', apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512 },
      model: () => 'fixture', redact: value => value }))
    const test = await fixture(undefined, create)
    test.settings.translation.customModels = [{ id: 'scene', name: 'Scene', model: 'fixture', endpoint: 'https://fixture.invalid/v1',
      apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512, languages: ['en'] }]
    enable(test.settings, 'llm', 'custom:scene')
    const lease = await test.gateway.acquireLanguageModel('custom:scene')
    expect(create).toHaveBeenCalledOnce()
    expect(test.settings.modelGateway.llmModel).toBeUndefined()
    expect(test.gateway.snapshot().state).toBe('stopped')
    expect(test.workers).toHaveLength(0)
    expect(test.gateway.snapshot().activeRequests).toBe(1)
    lease.release()
    expect(close).toHaveBeenCalledOnce()
    expect(test.gateway.snapshot().activeRequests).toBe(0)
    Object.assign(test.settings, modelEnablePatch(test.settings, 'llm', 'custom:scene', false))
    await expect(test.gateway.acquireLanguageModel('custom:scene')).rejects.toMatchObject({ code: 'model_disabled' })
    expect(create).toHaveBeenCalledOnce()
  })
})

it('rejects changes that unload or replace an in-use local model before settings are persisted', async () => {
  const test = await fixture()
  await test.gateway.start()
  const lease = await test.gateway.leaseCapability('mt', 'resource:mt-test')
  expect(() => test.gateway.assertSettingsChange({ modelGateway: { mtModel: 'resource:mt-other' } })).toThrow('RESOURCE_IN_USE')
  expect(() => test.gateway.assertSettingsChange({ modelGateway: { mt: false } })).toThrow('RESOURCE_IN_USE')
  expect(() => test.gateway.assertSettingsChange(modelEnablePatch(test.settings, 'mt', 'resource:mt-test', false))).toThrow('RESOURCE_IN_USE')
  expect(() => test.gateway.assertSettingsChange({ compute: { translationDevice: 'cpu' } })).toThrow('RESOURCE_IN_USE')
  expect(() => test.gateway.assertSettingsChange(modelEnablePatch(test.settings, 'mt', 'cloud:mymemory', true))).not.toThrow()
  expect(test.settings.modelGateway.mtModel).toBeUndefined()
  lease.release()
  expect(() => test.gateway.assertSettingsChange({ modelGateway: { mtModel: 'resource:mt-other' } })).not.toThrow()
})

it('disposes an acquired cloud LLM once and aborts its pending inference signal', async () => {
  const close = vi.fn(async () => {})
  const test = await fixture(undefined, async (_services, binding) => ({ close, local: false, name: binding,
    profile: { id: 'cloud-active', model: 'fixture', endpoint: 'https://fixture.invalid/v1', apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512 },
    model: () => 'fixture', redact: value => value }))
  test.settings.translation.customModels = [{ id: 'cloud-active', name: 'Active', model: 'fixture', endpoint: 'https://fixture.invalid/v1',
    apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512, languages: ['en'] }]
  enable(test.settings, 'llm', 'custom:cloud-active')
  const lease = await test.gateway.acquireLanguageModel('custom:cloud-active')
  await test.gateway.dispose()
  expect(lease.signal.aborted).toBe(true)
  expect(close).toHaveBeenCalledOnce()
  lease.release()
  expect(close).toHaveBeenCalledOnce()
  expect(test.gateway.snapshot().activeRequests).toBe(0)
})

it('keeps independent cloud leases alive when local loading is disabled during public API startup and reconfiguration', async () => {
  const test = await fixture()
  test.settings.modelGateway = { ...test.settings.modelGateway, asr: false, mt: false, tts: false }
  enable(test.settings, 'mt', 'cloud:mymemory')
  const lease = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
  await test.gateway.start()
  expect(lease.worker.close).not.toHaveBeenCalled()
  test.settings.modelGateway.targetLanguage = 'ja'
  await test.gateway.reconfigure()
  expect(lease.worker.close).not.toHaveBeenCalled()
  await test.gateway.stop()
  expect(lease.worker.close).not.toHaveBeenCalled()
  lease.release()
  await test.gateway.dispose()
  expect(lease.worker.close).toHaveBeenCalledOnce()
})

it('replaces a warm cloud adapter after its saved connection and credential change while pinning the active caller', async () => {
  const initialized: GatewayWorkerResult[] = []
  let key = 'key-before'
  const test = await fixture((_launch, init) => {
    initialized.push(init)
    return { ready: Promise.resolve({}), request: vi.fn(async () => ({ text: 'translated' })), subscribe: () => () => {}, close: vi.fn(async () => {}) }
  }, undefined, async () => key)
  test.settings.translation.customModels = [{ id: 'saved', name: 'Saved', model: 'before', endpoint: 'https://before.invalid/v1',
    apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512, languages: ['en'] }]
  enable(test.settings, 'mt', 'mt-custom:saved')
  const first = await test.gateway.leaseCapability('mt', 'mt-custom:saved')
  test.settings.translation.customModels[0] = { ...test.settings.translation.customModels[0], endpoint: 'https://after.invalid/v1', model: 'after' }
  key = 'key-after'
  const second = await test.gateway.leaseCapability('mt', 'mt-custom:saved')
  expect(second.worker).not.toBe(first.worker)
  expect(initialized[1]).toMatchObject({ config: { translationOptions: { endpoint: 'https://after.invalid/v1', model: 'after', apiKey: 'key-after' } } })
  expect(first.worker.close).not.toHaveBeenCalled()
  first.release()
  expect(first.worker.close).toHaveBeenCalledOnce()
  second.release()
})

it('maps public realtime ASR to its independent cloud binding and refuses disabled exposure', async () => {
  const test = await fixture(undefined, undefined, async () => 'fixture-key')
  test.settings.recognition.aliyunWorkspaceId = 'fixture-workspace'
  test.settings.modelGateway = { ...test.settings.modelGateway, asr: false, mt: false, tts: false,
    externalModels: { asr: 'cloud:aliyun' }, externalCapabilities: { asr: true, mt: false, tts: false, llm: false } }
  enable(test.settings, 'asr', 'cloud:aliyun')
  await test.gateway.start()
  const response = await fetch(test.base + '/v1/realtime/sessions', { method: 'POST', headers: await test.headers() })
  expect(response.status).toBe(200)
  const ticket = await response.json()
  const client = new WebSocket(test.base.replace('http:', 'ws:') + ticket.url)
  const events: Array<Record<string, unknown>> = []
  client.on('message', bytes => events.push(JSON.parse(bytes.toString())))
  await once(client, 'open')
  client.send(JSON.stringify({ type: 'session.update', session: { model: 'nola-asr' } }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'session.updated')).toBe(true))
  expect(test.workers).toHaveLength(1)
  const asr = test.workers[0]
  expect(asr.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'session.open' }))
  client.close(); await once(client, 'close')
  test.settings.modelGateway.externalCapabilities = { ...test.settings.modelGateway.externalCapabilities, asr: false }
  const rejected = await fetch(test.base + '/v1/realtime/sessions', { method: 'POST', headers: await test.headers() })
  expect(rejected.status).toBe(503)
  const unauthorized = new WebSocket(test.base.replace('http:', 'ws:') + '/v1/realtime', { headers: await test.headers() })
  const errors: Array<Record<string, unknown>> = []
  unauthorized.on('message', bytes => errors.push(JSON.parse(bytes.toString())))
  await once(unauthorized, 'open')
  unauthorized.send(JSON.stringify({ type: 'session.update', session: { model: 'nola-asr' } }))
  await vi.waitFor(() => expect(errors.some(event => event.type === 'error')).toBe(true))
  expect(errors.some(event => event.type === 'session.updated')).toBe(false)
  unauthorized.close(); await once(unauthorized, 'close')
})


it('uses the gateway binding for public aliases before the model management default', async () => {
  const test = await fixture()
  enable(test.settings, 'mt', 'cloud:mymemory')
  test.settings.modelPolicy!.defaults.mt = 'cloud:index-translate'
  test.settings.modelGateway.mtModel = 'cloud:mymemory'
  await test.gateway.start()
  const models = await fetch(test.base + '/v1/models', { headers: await test.headers() }).then(response => response.json())
  expect(models.data.map((model: { id: string }) => model.id)).toContain('nola-mt')
  const response = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(),
    body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
  expect(response.status).toBe(200)
  expect((await response.json()).choices[0].message.content).toBe('zh:Hello')
})


it('does not expose a disabled capability through its cloud default', async () => {
  const test = await fixture()
  enable(test.settings, 'mt', 'cloud:mymemory')
  test.settings.modelPolicy!.defaults.mt = 'cloud:mymemory'
  test.settings.modelGateway.mt = false
  test.settings.modelGateway.mtModel = ''
  await test.gateway.start()
  const models = await fetch(test.base + '/v1/models', { headers: await test.headers() }).then(response => response.json())
  expect(models.data.map((model: { id: string }) => model.id)).not.toContain('nola-mt')
  const response = await fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(),
    body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error: { code: 'capability_disabled' } })
})
