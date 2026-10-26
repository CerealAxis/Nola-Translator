import { createServer } from 'node:net'
import { File as NodeFile } from 'node:buffer'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { DEFAULT_SETTINGS } from '../../src/shared/settings'
import type { ResourceRecord } from '../../src/shared/contracts'
import { ModelGateway, translationRequest } from '../../src/main/model-gateway'
import { createGatewayWorker, type GatewayWorker, type GatewayWorkerFactory, type GatewayWorkerResult } from '../../src/main/model-gateway-worker'

const gateways: ModelGateway[] = []
afterEach(async () => { await Promise.all(gateways.splice(0).map(gateway => gateway.stop())); vi.unstubAllGlobals() })
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
async function fixture(factory?: GatewayWorkerFactory) {
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
  const gateway = new ModelGateway({ getSettings: () => settings, listResources: async () => resources, directLaunch: async () => ({ command: 'unused', args: [], cwd: process.cwd() }), getKey: async () => key, setKey: async value => { key = value }, createWorker: create })
  gateways.push(gateway)
  const base = `http://127.0.0.1:${settings.modelGateway.port}`
  const headers = async () => ({ Authorization: `Bearer ${await gateway.revealKey()}`, 'Content-Type': 'application/json' })
  return { gateway, settings, resources, workers, base, headers }
}

describe('local gateway', () => {
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

  it('reconfigures only affected models, pins running requests, and rejects cloud defaults explicitly', async () => {
    const test = await fixture(); await test.gateway.start()
    const mt = test.workers.find(worker => worker.kind === 'mt')!
    const answer = deferred<GatewayWorkerResult>()
    vi.mocked(mt.request).mockImplementationOnce(() => answer.promise)
    const pending = fetch(test.base + '/v1/chat/completions', { method: 'POST', headers: await test.headers(), body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }) })
    await vi.waitFor(() => expect(test.gateway.snapshot().activeRequests).toBe(1))
    test.settings.modelGateway.mt = false; await test.gateway.reconfigure()
    expect(mt.close).not.toHaveBeenCalled()
    answer.resolve({ text: 'old model result' }); expect((await (await pending).json()).choices[0].message.content).toBe('old model result')
    await vi.waitFor(() => expect(mt.close).toHaveBeenCalledOnce())
    expect(test.workers.filter(worker => worker.kind === 'asr')).toHaveLength(1)
    test.settings.modelGateway.mt = true; test.settings.translation.provider = 'cloud'; await test.gateway.reconfigure()
    expect(test.gateway.snapshot().services.mt.error).toContain('cloud provider')
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
})
