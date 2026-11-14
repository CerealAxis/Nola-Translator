import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { File as NodeFile } from 'node:buffer'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { DEFAULT_SETTINGS, MIMO_TTS_BINDING } from '../../src/shared/settings'
import { mergeModelPolicy, modelEnablePatch } from '../../src/shared/model-policy'
import type { GatewayCapability } from '../../src/shared/model-gateway'
import type { AppSettings, CredentialProvider } from '../../src/shared/settings'
import type { ResourceRecord } from '../../src/shared/contracts'
import { ModelGateway, translationRequest, type ModelGatewayOptions } from '../../src/main/model-gateway'
import { createGatewayWorker, GatewayWorkerError, type GatewayWorker, type GatewayWorkerFactory, type GatewayWorkerResult } from '../../src/main/model-gateway-worker'
import type { createGatewayLanguageModel } from '../../src/main/gateway-language-model'

const gateways: ModelGateway[] = []

it('leases installed comic OCR without starting or changing the realtime gateway', async () => {
  const test = await fixture()
  test.resources.push({ resourceId: 'pp-ocrv5-mobile-ch-onnx', kind: 'ocrModel', provider: 'pp-ocrv5',
    name: 'PP OCR', installed: true } as ResourceRecord)
  const lease = await test.gateway.acquireComicOcr(async () => { lease.release() })
  expect(lease.resourceId).toBe('pp-ocrv5-mobile-ch-onnx')
  expect(test.gateway.resourceInUse(lease.resourceId)).toBe(true)
  expect(test.gateway.snapshot().state).toBe('stopped')
  expect(test.workers).toHaveLength(0)
  await test.gateway.stop()
  expect(test.gateway.resourceInUse(lease.resourceId)).toBe(false)
})

it('does not download missing comic OCR or lease an unrelated recognizer', async () => {
  const test = await fixture()
  test.resources.push({ resourceId: 'manga-ocr-onnx', kind: 'ocrModel', provider: 'manga-ocr',
    name: 'Manga OCR', installed: true } as ResourceRecord)
  await expect(test.gateway.acquireComicOcr(async () => {})).rejects.toThrow('ocrMissing')
})
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
function postTranscription(base: string, authorization: string, audio = wav()) {
  const boundary = 'nola-test-boundary'
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nnola-asr\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`), audio, Buffer.from(`\r\n--${boundary}--\r\n`)])
  return fetch(base + '/v2/audio/transcriptions', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body,
  })
}
async function fixture(factory?: GatewayWorkerFactory, createLanguageModel?: typeof createGatewayLanguageModel, getCredential?: (provider: CredentialProvider) => Promise<string>, inferBackend?: ModelGatewayOptions['inferBackend'], openBackendAsr?: ModelGatewayOptions['openBackendAsr']) {
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
  const gateway = new ModelGateway({ getSettings: () => settings, listResources: async () => resources, directLaunch: async () => ({ command: 'unused', args: [], cwd: process.cwd() }), getKey: async () => key, setKey: async value => { key = value }, createWorker: create, createLanguageModel, getCredential, inferBackend, openBackendAsr })
  gateways.push(gateway)
  const base = `http://127.0.0.1:${settings.modelGateway.port}`
  const headers = async () => ({ Authorization: `Bearer ${await gateway.revealKey()}`, 'Content-Type': 'application/json' })
  return { gateway, settings, resources, workers, base, headers }
}

it('routes public realtime PCM through the backend without a legacy ASR worker', async () => {
  const requests: GatewayWorkerResult[] = []
  const backendClosed = deferred<void>()
  const close = vi.fn(() => backendClosed.resolve(undefined))
  const test = await fixture(undefined, undefined, undefined, async () => undefined, async (binding, _signal, emit) => {
    expect(binding).toBe('resource:asr-test')
    return { close, closed: backendClosed.promise, request: async payload => {
      requests.push(payload)
      if (payload.op === 'session.commit') emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'backend' })
    } }
  })
  await test.gateway.start()
  const response = await fetch(test.base + '/v2/realtime/sessions', { method: 'POST', headers: await test.headers() })
  const { url } = await response.json()
  const client = new WebSocket(test.base.replace('http:', 'ws:') + url)
  const events: GatewayWorkerResult[] = []
  client.on('message', raw => events.push(JSON.parse(raw.toString())))
  await once(client, 'open')
  const audio = Buffer.alloc(640).toString('base64')
  client.send(JSON.stringify({ type: 'session.update', session: { turn_detection: null } }))
  client.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }))
  client.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
  client.send(JSON.stringify({ type: 'session.finish' }))
  await once(client, 'close')
  expect(requests.map(payload => payload.op)).toEqual(['session.open', 'session.append', 'session.commit', 'session.finish'])
  expect(requests[0].manual).toBe(true)
  expect(requests[1].audio).toBe(audio)
  expect(events.some(event => event.transcript === 'backend')).toBe(true)
  expect(test.workers).toHaveLength(0)
  expect(close).toHaveBeenCalled()
})

it('excludes workbench LLMs from both public API versions', async () => {
  const test = await fixture()
  test.settings.translation.customModels = [{ id: 'scene', name: 'Scene', model: 'fixture', endpoint: 'https://fixture.invalid/v1',
    apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512, languages: ['en'] }]
  Object.assign(test.settings.modelGateway, { llm: true, llmModel: 'custom:scene' })
  enable(test.settings, 'llm', 'custom:scene')
  await test.gateway.start()
  expect(test.gateway.snapshot().services.llm.state).toBe('ready')
  for (const version of ['v1', 'v2']) {
    const models = await fetch(`${test.base}/${version}/models`, { headers: await test.headers() }).then(response => response.json())
    expect(models.data.map((model: { id: string }) => model.id)).not.toContain('nola-llm')
    const response = await fetch(`${test.base}/${version}/chat/completions`, {
      method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-llm', messages: [{ role: 'user', content: 'Hello' }] }),
    })
    expect(response.status).toBe(404)
  }
})

it('rejects excess realtime streams before opening a backend connection', async () => {
  const closed = deferred<void>()
  const open = vi.fn<NonNullable<ModelGatewayOptions['openBackendAsr']>>(async () => ({
    close: () => closed.resolve(), closed: closed.promise, request: async () => {},
  }))
  const test = await fixture(undefined, undefined, undefined, async () => undefined, open)
  test.settings.modelGateway.concurrency = { asr: 1 }
  await test.gateway.start()
  const connect = async () => {
    const client = new WebSocket(test.base.replace('http:', 'ws:') + '/v2/realtime', { headers: await test.headers() })
    const events: Array<Record<string, unknown>> = []
    client.on('message', bytes => events.push(JSON.parse(bytes.toString())))
    await once(client, 'open')
    client.send(JSON.stringify({ type: 'session.update', session: { turn_detection: null } }))
    return { client, events }
  }
  const first = await connect()
  await vi.waitFor(() => expect(first.events.some(event => event.type === 'session.updated')).toBe(true))
  const second = await connect()
  await vi.waitFor(() => expect(second.events).toContainEqual(expect.objectContaining({ type: 'error', error: expect.objectContaining({ code: 'rate_limited' }) })))
  expect(open).toHaveBeenCalledOnce()
  second.client.close(); await once(second.client, 'close')
  first.client.close(); await once(first.client, 'close')
  await vi.waitFor(() => expect(test.gateway.snapshot().activeRequests).toBe(0))
})

describe('local gateway', () => {
  it('shares a capability limit between leases and public calls and applies changes without interrupting leases', async () => {
    const test = await fixture()
    test.settings.modelGateway.concurrency = { mt: 2, tts: 1 }
    await test.gateway.start()
    const first = await test.gateway.leaseCapability('mt')
    const second = await test.gateway.leaseCapability('mt')
    test.settings.modelGateway.concurrency.mt = 1
    await expect(test.gateway.leaseCapability('mt')).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    const speech = await test.gateway.leaseCapability('tts')
    speech.release()
    first.release(); first.release()
    const rejected = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
    expect(rejected.status).toBe(429)
    expect(await rejected.json()).toMatchObject({ error: { code: 'rate_limited' } })
    second.release()
    const next = await test.gateway.leaseCapability('mt')
    next.release()
    expect(test.gateway.snapshot().activeRequests).toBe(0)
  })

  it('delegates concurrency admission to the backend and tracks cancelled calls', async () => {
    const infer = vi.fn<NonNullable<ModelGatewayOptions['inferBackend']>>(async (_request, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
    const test = await fixture(undefined, undefined, undefined, infer)
    test.settings.modelGateway.concurrency = { mt: 3 }
    await test.gateway.start()
    const controller = new AbortController()
    const request = { kind: 'mt' as const, model: 'resource:mt-test', id: randomUUID(), text: 'Hello', target: 'zh' }
    const first = test.gateway.infer(request, controller.signal)
    const second = test.gateway.infer(request, controller.signal)
    const settled = Promise.allSettled([first, second])
    expect(test.gateway.snapshot().activeRequests).toBe(2)
    expect(infer).toHaveBeenCalledTimes(2)
    expect(infer).toHaveBeenCalledWith(expect.anything(), expect.any(AbortSignal), { concurrency: 3 })
    controller.abort(new Error('cancelled'))
    expect((await settled).every(result => result.status === 'rejected')).toBe(true)
    expect(test.gateway.snapshot().activeRequests).toBe(0)
    infer.mockRejectedValueOnce(new Error('backend failed'))
    await expect(test.gateway.infer(request, new AbortController().signal)).rejects.toThrow('backend failed')
    infer.mockResolvedValueOnce({ text: 'translated' })
    await expect(test.gateway.infer(request, new AbortController().signal)).resolves.toEqual({ text: 'translated' })
    expect(test.gateway.snapshot().activeRequests).toBe(0)
  })

  it('routes the enabled MiMo default through the backend without a local TTS worker', async () => {
    const audio = `data:audio/wav;base64,${wav().toString('base64')}`
    const infer = vi.fn<NonNullable<ModelGatewayOptions['inferBackend']>>().mockResolvedValue({ text: '', audio })
    const test = await fixture(undefined, undefined, async slot => slot === 'mimo-tts' ? 'test-mimo-key' : '', infer)
    test.settings.modelGateway.asr = false
    test.settings.modelGateway.mt = false
    test.settings.synthesis = { modelId: MIMO_TTS_BINDING, voice: '' }
    enable(test.settings, 'tts', MIMO_TTS_BINDING)
    await test.gateway.start()
    const speech = await fetch(`${test.base}/v2/audio/speech`, {
      method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-tts', input: 'Hello', response_format: 'wav' }),
    })
    expect(speech.status).toBe(200)
    expect(Buffer.from(await speech.arrayBuffer())).toEqual(wav())
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tts', model: MIMO_TTS_BINDING }), expect.any(AbortSignal), { batchAsr: false, mp3: false, concurrency: 10 })
    expect(test.workers).toHaveLength(0)
  })

  it('shares backend inference with the workbench while keeping public response formats', async () => {
    vi.stubGlobal('File', NodeFile)
    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0])
    const infer = vi.fn<NonNullable<ModelGatewayOptions['inferBackend']>>(async (request, _signal, options) => {
      if (options?.inspect) return { text: '', voices: ['Voice'] }
      if (request.kind === 'tts') return { text: '', audio: options?.mp3
        ? `data:audio/mpeg;base64,${mp3.toString('base64')}`
        : `data:audio/wav;base64,${wav().toString('base64')}` }
      return { text: request.kind === 'asr' ? 'backend transcript' : 'backend translation' }
    })
    const test = await fixture(undefined, undefined, undefined, infer)
    await test.gateway.start()
    const post = async (path: string, data: unknown) => fetch(test.base + path, {
      method: 'POST', headers: await test.headers(), body: JSON.stringify(data),
    })
    const translation = { model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }
    const translated = await post('/v2/chat/completions', translation)
    expect((await translated.json()).choices[0].message.content).toBe('backend translation')

    const catalog = await fetch(test.base + '/v2/models', { headers: await test.headers() }).then(response => response.json())
    expect(catalog.data).toContainEqual(expect.objectContaining({ id: 'nola-tts', voices: ['Voice'] }))
    expect(test.gateway.snapshot().address).toBe(test.base + '/v2')
    expect(await fetch(test.base + '/v1/models', { headers: await test.headers() }).then(response => response.json())).toEqual(catalog)
    await expect(test.gateway.infer({ kind: 'tts', id: randomUUID(), model: 'resource:tts-test' },
      new AbortController().signal, true)).resolves.toEqual({ text: '', voices: ['Voice'] })
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tts' }),
      expect.any(AbortSignal), { inspect: true, concurrency: 1 })

    const speech = await post('/v2/audio/speech', { model: 'nola-tts', input: 'Hello' })
    expect(speech.headers.get('content-type')).toBe('audio/mpeg')
    expect(Buffer.from(await speech.arrayBuffer())).toEqual(mp3)
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tts', voice: 'Voice' }),
      expect.any(AbortSignal), { batchAsr: false, mp3: true, concurrency: 1 })
    const pcm = await post('/v2/audio/speech', { model: 'nola-tts', input: 'Hello', response_format: 'pcm' })
    expect(Buffer.from(await pcm.arrayBuffer())).toEqual(wav().subarray(44))

    const transcription = await postTranscription(test.base, (await test.headers()).Authorization)
    expect(await transcription.json()).toEqual({ text: 'backend transcript' })
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'asr' }), expect.any(AbortSignal), { batchAsr: true, mp3: false, concurrency: 1 })

    const request = { kind: 'mt' as const, id: randomUUID(), model: 'resource:mt-test', text: 'Hello', target: 'zh' }
    await expect(test.gateway.infer(request, new AbortController().signal)).resolves.toEqual({ text: 'backend translation' })
    infer.mockRejectedValueOnce(new Error('Backend inference failed'))
    expect((await post('/v2/chat/completions', translation)).status).toBe(500)
    expect(test.workers).toHaveLength(0)

    infer.mockResolvedValueOnce(undefined)
    const legacy = await post('/v2/chat/completions', translation)
    expect((await legacy.json()).choices[0].message.content).toBe('zh:Hello')
    expect(test.workers.map(worker => worker.kind)).toEqual(['mt'])
    expect(test.gateway.snapshot().activeRequests).toBe(0)
  })

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
    expect(initialized).toHaveLength(0)
    const lease = await test.gateway.leaseCapability('mt')
    lease.release()
    expect(initialized[0]).toMatchObject({ kind: 'mt', config: { translationProvider: 'index-translate' } })
    const models = await fetch(test.base + '/v2/models', { headers: await test.headers() }).then(response => response.json())
    expect(models.data.map((model: { id: string }) => model.id)).toEqual(['nola-mt'])
    const result = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'hello' }] }) }).then(response => response.json())
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
    const lease = await test.gateway.leaseCapability('mt')
    lease.release()
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
    expect((await fetch(test.base + '/v2/models')).status).toBe(401)
    expect((await fetch(test.base + '/v2/chat/completions', { method: 'OPTIONS', headers: { Origin: 'http://localhost' } })).status).toBe(401)
    const auth = await test.headers()
    const preflight = await fetch(test.base + '/v2/chat/completions', { method: 'OPTIONS', headers: { ...auth, Origin: 'http://localhost', 'Access-Control-Request-Headers': 'authorization,content-type' } })
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost')
    const hostilePreflight = await fetch(test.base + '/v2/chat/completions', { method: 'OPTIONS', headers: { ...auth, Origin: 'https://evil.example' } })
    expect(hostilePreflight.status).toBe(204); expect(hostilePreflight.headers.get('access-control-allow-origin')).toBeNull()
    const response = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: { ...await test.headers(), Origin: 'chrome-extension://translator' }, body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }], translation_options: { target_lang: 'ja' } }) })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect((await response.json()).choices[0].message.content).toBe('ja:Hello')
    const stream = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'Hi' }] }) })
    expect(await stream.text()).toContain('data: [DONE]')
    const wrong = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ model: 'nola-asr', messages: [{ role: 'user', content: 'Hi' }] }) })
    expect(wrong.status).toBe(404)
  })

  it('returns speech as binary MP3 by default and explicit WAV/PCM, and reads multipart audio', async () => {
    vi.stubGlobal('File', NodeFile)
    const test = await fixture(); await test.gateway.start()
    for (const [format, type, length] of [[undefined, 'audio/mpeg', 4], ['wav', 'audio/wav', 48], ['pcm', 'application/octet-stream', 4]] as const) {
      const response = await fetch(test.base + '/v2/audio/speech', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ input: 'Hello', response_format: format }) })
      expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe(type)
      const output = Buffer.from(await response.arrayBuffer()); expect(output.length).toBe(length)
      if (format === 'wav') expect(output.toString('ascii', 0, 4)).toBe('RIFF')
      if (!format) expect(output[0]).toBe(0xff)
    }
    const response = await postTranscription(test.base, (await test.headers()).Authorization)
    expect(await response.json()).toEqual({ text: 'recognized' })
  })

  it('issues single-use realtime tickets and invalidates them and old keys upon rotation', async () => {
    const test = await fixture(); await test.gateway.start()
    const oldHeaders = await test.headers()
    const ticketResponse = await fetch(test.base + '/v2/realtime/sessions', { method: 'POST', headers: oldHeaders })
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
    expect((await fetch(test.base + '/v2/models', { headers: oldHeaders })).status).toBe(401)
    expect((await fetch(test.base + '/v2/models', { headers: await test.headers() })).status).toBe(200)
  })

  it('reconfigures only affected models, pins running requests, and supports cloud defaults', async () => {
    const test = await fixture(); await test.gateway.start()
    const mt = test.workers.find(worker => worker.kind === 'mt')!
    const answer = deferred<GatewayWorkerResult>()
    vi.mocked(mt.request).mockImplementationOnce(() => answer.promise)
    const pending = fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }) })
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
    await expect(fetch(test.base + '/v2/models', { headers: await test.headers() })).rejects.toThrow()
    expect(await test.gateway.infer({ id: crypto.randomUUID(), model: 'nola-mt', kind: 'mt', text: 'Hello', target: 'ja' }, new AbortController().signal)).toMatchObject({ text: 'ja:Hello' })
    test.settings.modelGateway.externalEnabled = true
    await test.gateway.reconfigure()
    expect((await fetch(test.base + '/v2/models', { headers: await test.headers() })).status).toBe(200)
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

  it('owns loaded local LLM lifecycle independently and keeps active requests pinned until released', async () => {
    const runtimes: Array<{ close: ReturnType<typeof vi.fn> }> = []
    const test = await fixture(undefined, async (_services, binding) => {
      const runtime = { close: vi.fn(async () => {}), local: true, name: binding,
        profile: { id: binding, model: 'chat', endpoint: 'https://fixture.invalid/v1', apiFormat: 'chat-completions' as const, contextWindow: 4096, maxOutputTokens: 512 },
        model: () => 'fixture', redact: (value: string) => value }
      runtimes.push(runtime)
      return runtime
    })
    for (const id of ['first', 'second']) {
      test.resources.push({ resourceId: id, kind: 'translationModel', installed: true, name: id } as ResourceRecord)
      enable(test.settings, 'llm', `resource:${id}`)
    }
    test.settings.modelGateway.llm = true
    test.settings.modelGateway.llmModel = 'resource:first'
    await test.gateway.start()
    const first = test.gateway.languageModel('resource:first')
    test.settings.modelGateway.llmModel = 'resource:second'
    await test.gateway.reconfigure()
    expect(runtimes[0].close).not.toHaveBeenCalled()
    expect(first.signal.aborted).toBe(false)
    const second = test.gateway.languageModel('resource:second')
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
    test.settings.translation.fallback.cloudModel = 'backup-model'
    enable(test.settings, 'mt', provider === 'cloud' ? 'mt-custom:legacy-fallback' : 'cloud:google')
    await test.gateway.start()
    const lease = await test.gateway.leaseCapability('mt')
    lease.release()
    const config = initialized.find(init => init.kind === 'mt')!
    expect(config.fallbackUsesPrimary).toBe(true)
    if (provider === 'cloud') expect((config.config as any).translationOptions.apiKey).toBe('secret-for-fallback-cloud')
    else {
      expect((config.config as any).translationOptions).not.toHaveProperty('apiKey')
      expect(credentials).not.toHaveBeenCalledWith('google')
      expect(credentials).not.toHaveBeenCalledWith('fallback-google')
    }
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
  it('leases a configured cloud service without enablement and rejects it after its connection becomes invalid', async () => {
    const test = await fixture()
    test.settings.modelPolicy = { enabled: {}, defaults: {}, selections: {} }
    const lease = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
    Object.assign(test.settings, modelEnablePatch(test.settings, 'mt', 'cloud:mymemory', false))
    const shared = await test.gateway.leaseCapability('mt', 'cloud:mymemory')
    expect(shared.worker).toBe(lease.worker)
    shared.release()
    test.settings.translation.mymemoryEndpoint = 'file:///private'
    await expect(test.gateway.leaseCapability('mt', 'cloud:mymemory')).rejects.toMatchObject({ code: 'invalid_configuration' })
    expect(lease.worker.close).not.toHaveBeenCalled()
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
      externalModels: { mt: 'cloud:mymemory' }, externalCapabilities: { asr: false, mt: true, tts: false } }
    enable(test.settings, 'mt', 'cloud:mymemory')
    await test.gateway.start()
    expect(test.workers).toHaveLength(0)
    const models = await fetch(test.base + '/v2/models', { headers: await test.headers() }).then(response => response.json())
    expect(models.data.map((model: { id: string }) => model.id)).toEqual(['nola-mt'])
    const response = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
    expect(response.status).toBe(200)
    expect((await response.json()).choices[0].message.content).toBe('zh:Hello')
    expect(test.workers.map(worker => worker.kind)).toEqual(['mt'])
    test.settings.modelGateway.externalCapabilities!.mt = false
    const rejected = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(),
      body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
    expect(rejected.status).toBe(503)
    expect(await rejected.json()).toMatchObject({ error: { code: 'capability_disabled' } })
  })

  it('acquires a saved configured cloud LLM without starting or rebinding local services', async () => {
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
    const second = await test.gateway.acquireLanguageModel('custom:scene')
    expect(create).toHaveBeenCalledTimes(2)
    second.release()
    expect(close).toHaveBeenCalledTimes(2)
  })
})

it('pins external MT admission and drains cancellation before unloading its model', async () => {
  const test = await fixture()
  test.settings.modelGateway.concurrency = { mt: 1 }
  await test.gateway.start()
  const drained = deferred<void>(), stopping = deferred<void>()
  const worker = test.workers.find(item => item.kind === 'mt')!
  const lease = await test.gateway.acquireExternalMt('resource:mt-test', async () => {
    stopping.resolve(undefined)
    expect(worker.close).not.toHaveBeenCalled()
    await drained.promise
    lease.release()
  })
  expect(test.gateway.resourceInUse('mt-test')).toBe(true)
  expect(() => test.gateway.assertSettingsChange({ compute: { translationDevice: 'cpu' } })).toThrow('RESOURCE_IN_USE')
  await expect(test.gateway.leaseCapability('mt')).rejects.toMatchObject({ code: 'rate_limited' })
  const stop = test.gateway.stop()
  await stopping.promise
  expect(test.gateway.snapshot().activeRequests).toBe(1)
  expect(worker.close).not.toHaveBeenCalled()
  await expect(test.gateway.acquireExternalMt('cloud:mymemory', async () => {})).rejects.toMatchObject({ code: 'gateway_not_running' })
  drained.resolve(undefined)
  await stop
  lease.release()
  expect(worker.close).toHaveBeenCalledOnce()
  expect(test.gateway.snapshot().requests[0].status).toBe('cancelled')
  expect(test.gateway.snapshot().activeRequests).toBe(0)
})

it('validates external cloud MT without spawning workers and rejects late admission after stop', async () => {
  const credentials = deferred<string>()
  const test = await fixture(undefined, undefined, () => credentials.promise)
  const pending = test.gateway.acquireExternalMt('cloud:mymemory', async () => {})
  const rejected = expect(pending).rejects.toMatchObject({ code: 'gateway_not_running' })
  await test.gateway.stop()
  credentials.resolve('')
  await rejected
  const lease = await test.gateway.acquireExternalMt('cloud:mymemory', async () => { lease.release() })
  expect(test.workers).toHaveLength(0)
  lease.release()
  await expect(test.gateway.acquireExternalMt('mt-custom:deleted', async () => {})).rejects.toMatchObject({ code: 'invalid_configuration' })
  await expect(test.gateway.acquireExternalMt('resource:mt-test', async () => {})).rejects.toMatchObject({ code: 'gateway_not_running' })
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
    externalModels: { asr: 'cloud:aliyun' }, externalCapabilities: { asr: true, mt: false, tts: false } }
  enable(test.settings, 'asr', 'cloud:aliyun')
  await test.gateway.start()
  const response = await fetch(test.base + '/v2/realtime/sessions', { method: 'POST', headers: await test.headers() })
  expect(response.status).toBe(200)
  const ticket = await response.json()
  const client = new WebSocket(test.base.replace('http:', 'ws:') + ticket.url)
  const events: Array<Record<string, unknown>> = []
  client.on('message', bytes => events.push(JSON.parse(bytes.toString())))
  await once(client, 'open')
  client.send(JSON.stringify({ type: 'session.update', session: { model: 'nola-asr', turn_detection: null } }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'session.updated')).toBe(true))
  expect(test.workers).toHaveLength(1)
  const asr = test.workers[0]
  expect(asr.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'session.open', manual: true }))
  const audio = Buffer.alloc(640).toString('base64')
  client.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }))
  client.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'input_audio_buffer.committed')).toBe(true))
  expect(asr.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'session.append', audio }))
  expect(asr.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'session.commit' }))
  client.close(); await once(client, 'close')
  test.settings.modelGateway.externalCapabilities = { ...test.settings.modelGateway.externalCapabilities, asr: false }
  const rejected = await fetch(test.base + '/v2/realtime/sessions', { method: 'POST', headers: await test.headers() })
  expect(rejected.status).toBe(503)
  const unauthorized = new WebSocket(test.base.replace('http:', 'ws:') + '/v2/realtime', { headers: await test.headers() })
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
  const models = await fetch(test.base + '/v2/models', { headers: await test.headers() }).then(response => response.json())
  expect(models.data.map((model: { id: string }) => model.id)).toContain('nola-mt')
  const response = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(),
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
  const models = await fetch(test.base + '/v2/models', { headers: await test.headers() }).then(response => response.json())
  expect(models.data.map((model: { id: string }) => model.id)).not.toContain('nola-mt')
  const response = await fetch(test.base + '/v2/chat/completions', { method: 'POST', headers: await test.headers(),
    body: JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }] }) })
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error: { code: 'capability_disabled' } })
})


describe('OCR capability ownership', () => {
  async function ocrFixture() {
    const test = await fixture()
    const runtime = { load: vi.fn(async () => {}), release: vi.fn(async () => {}),
      infer: vi.fn(async () => ({ width: 200, height: 80, blocks: [] })) }
    test.settings.modelGateway = { ...test.settings.modelGateway, externalEnabled: false, asr: false, mt: false, tts: false,
      ocr: true, ocrModel: 'resource:pp-ocrv5-mobile-onnx' }
    enable(test.settings, 'ocr', 'resource:pp-ocrv5-mobile-onnx')
    test.resources.push({ resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', name: 'PP-OCRv5 mobile', installed: true, languages: ['zh', 'en', 'ja', 'ko'] } as ResourceRecord)
    const gateway = new ModelGateway({ getSettings: () => test.settings, listResources: async () => test.resources,
      directLaunch: vi.fn(), getKey: async () => 'fixture-key', setKey: vi.fn(), ocr: runtime })
    gateways.push(gateway)
    return { ...test, gateway, runtime }
  }
  const input = { image: 'data:image/png;base64,fixture', language: 'auto' as const }
  it('loads OCR only from the gateway and keeps weights loaded after a screen lease ends', async () => {
    const { gateway, runtime } = await ocrFixture()
    await expect(gateway.inferOcr(input, new AbortController().signal)).rejects.toThrow('ocrNotReady')
    expect(runtime.load).not.toHaveBeenCalled()
    await gateway.start()
    expect(gateway.snapshot().services.ocr).toMatchObject({ state: 'ready', name: 'PP-OCRv5 mobile' })
    expect(gateway.snapshot().availableModels?.ocr?.[0].binding).toBe('resource:pp-ocrv5-mobile-onnx')
    const release = gateway.acquireOcr()
    release(); release()
    expect(runtime.release).not.toHaveBeenCalled()
    await gateway.inferOcr(input, new AbortController().signal)
    expect(gateway.snapshot().requests[0]).toMatchObject({ kind: 'ocr', status: 'completed' })
    expect(runtime.load).toHaveBeenCalledOnce()
    expect(gateway.resourceInUse('pp-ocrv5-mobile-onnx')).toBe(true)
    await gateway.stop()
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(gateway.resourceInUse('pp-ocrv5-mobile-onnx')).toBe(false)
    await expect(gateway.inferOcr(input, new AbortController().signal)).rejects.toThrow('ocrNotReady')
  })
  it('rejects disruptive capability edits while a screen session holds the model', async () => {
    const { gateway } = await ocrFixture()
    await gateway.start()
    const release = gateway.acquireOcr()
    expect(() => gateway.assertSettingsChange({ modelGateway: { ocr: false } })).toThrow('RESOURCE_IN_USE')
    release()
    expect(() => gateway.assertSettingsChange({ modelGateway: { ocr: false } })).not.toThrow()
  })
  it('cleans up a model whose cold load completes after stop was requested', async () => {
    const { gateway, runtime } = await ocrFixture()
    const pending = deferred<void>()
    runtime.load.mockImplementation(() => pending.promise)
    const starting = gateway.start()
    await vi.waitFor(() => expect(runtime.load).toHaveBeenCalledOnce())
    const stopping = gateway.stop()
    pending.resolve()
    await starting; await stopping
    expect(gateway.snapshot().services.ocr?.state).toBe('stopped')
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(gateway.snapshot().availableModels?.ocr).toEqual([])
  })
  it('switches OCR language packs through the gateway and validates each pack language', async () => {
    const { gateway, runtime, settings, resources } = await ocrFixture()
    await gateway.start()
    const binding = 'resource:pp-ocrv5-mobile-latin-onnx'
    settings.modelGateway.ocrModel = binding
    enable(settings, 'ocr', binding)
    resources.push({ resourceId: binding.slice(9), kind: 'ocrModel', name: 'Latin', installed: true, languages: ['fr', 'de', 'es'] } as ResourceRecord)
    await gateway.reconfigure()
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(runtime.load).toHaveBeenLastCalledWith('pp-ocrv5-mobile-latin-onnx')
    await gateway.inferOcr({ ...input, language: 'fr' }, new AbortController().signal)
    await expect(gateway.inferOcr({ ...input, language: 'ja' }, new AbortController().signal)).rejects.toThrow('invalidConfig')
    expect(runtime.infer).toHaveBeenCalledOnce()
  })
  it('releases native weights after a failed or timed-out load', async () => {
    const { gateway, runtime } = await ocrFixture()
    runtime.load.mockRejectedValueOnce(new Error('Load timed out'))
    await gateway.start()
    expect(gateway.snapshot().services.ocr?.state).toBe('failed')
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(gateway.resourceInUse('pp-ocrv5-mobile-onnx')).toBe(false)
  })
  it('does not load missing weights or automatically reload a crashed backend during inference', async () => {
    const { gateway, runtime, resources } = await ocrFixture()
    resources.find(resource => resource.kind === 'ocrModel')!.installed = false
    await gateway.start()
    expect(gateway.snapshot().services.ocr?.state).toBe('failed')
    expect(runtime.load).not.toHaveBeenCalled()
    resources.find(resource => resource.kind === 'ocrModel')!.installed = true
    await gateway.reconfigure()
    runtime.infer.mockRejectedValueOnce(new Error('ocrNotReady'))
    await expect(gateway.inferOcr(input, new AbortController().signal)).rejects.toThrow('ocrNotReady')
    expect(gateway.snapshot().services.ocr?.state).toBe('failed')
    await expect(gateway.inferOcr(input, new AbortController().signal)).rejects.toThrow('ocrNotReady')
    expect(runtime.load).toHaveBeenCalledOnce()
  })
})


it('leases an enabled local LLM on demand without starting the public gateway and releases it on stop', async () => {
  const close = vi.fn(async () => {})
  const create = vi.fn<typeof createGatewayLanguageModel>(async (_services, binding) => ({ close, local: true, name: binding,
    profile: { id: binding, model: 'local-test', endpoint: 'http://127.0.0.1:1234/v1', apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 512 },
    model: () => 'fixture', redact: value => value }))
  const test = await fixture(undefined, create)
  enable(test.settings, 'llm', 'resource:local-test')
  const lease = await test.gateway.acquireLanguageModel('resource:local-test')
  expect(test.gateway.snapshot().state).toBe('stopped')
  expect(create).toHaveBeenCalledOnce()
  expect(test.gateway.snapshot().activeRequests).toBe(1)
  await test.gateway.stop()
  expect(lease.signal.aborted).toBe(true)
  expect(close).toHaveBeenCalledOnce()
  expect(test.gateway.snapshot().activeRequests).toBe(0)
  lease.release()
  expect(close).toHaveBeenCalledOnce()
  Object.assign(test.settings, modelEnablePatch(test.settings, 'llm', 'resource:local-test', false))
  await expect(test.gateway.acquireLanguageModel('resource:local-test')).rejects.toMatchObject({ code: 'model_disabled' })
})
