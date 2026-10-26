import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import type { ResourceRecord } from '../shared/contracts'
import { recognitionFieldsOf, translationOptionsOf } from '../shared/cloud-config'
import { customCredentialSlot } from '../shared/custom-models'
import type { AppSettings, CredentialProvider } from '../shared/settings'
import { DEFAULT_MODEL_GATEWAY, modelGatewaySettingsSchema, type GatewayCapability, type GatewayRequestSnapshot, type ModelGatewaySnapshot } from '../shared/model-gateway'
import type { EngineLaunchSpec } from './engine-process'
import { createGatewayWorker, GatewayWorkerError, type GatewayWorker, type GatewayWorkerFactory, type GatewayWorkerResult } from './model-gateway-worker'

const KINDS: GatewayCapability[] = ['asr', 'mt', 'tts']
const RESOURCE_KIND = { asr: 'recognitionModel', mt: 'translationModel', tts: 'ttsModel' } as const
const MAX_BODY = 24 * 1024 * 1024
const MAX_TEXT = 64_000
interface WorkerSlot { worker: GatewayWorker; model: string; signature: string; refs: number; retired: boolean }
export interface ModelGatewayOptions {
  getSettings(): AppSettings
  directLaunch(model: string): Promise<EngineLaunchSpec>
  listResources(): Promise<ResourceRecord[]>
  getCredential?(provider: CredentialProvider): Promise<string>
  getKey(): Promise<string>
  setKey(value: string): Promise<void>
  onChanged?(snapshot: ModelGatewaySnapshot): void
  createWorker?: GatewayWorkerFactory
}
class GatewayError extends Error { constructor(readonly status: number, message: string, readonly code = 'invalid_request_error') { super(message) } }
const clientError = (error: unknown): unknown => error instanceof GatewayWorkerError && error.code === 'invalid_request' ? new GatewayError(400, error.message) : error
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function text(value: unknown, name: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GatewayError(400, `Invalid ${name}`)
  return value
}

/** One authenticated listener, three independently loaded and independently disposable models. */
export class ModelGateway {
  private state: ModelGatewaySnapshot['state'] = 'stopped'
  private error?: string
  private server?: Server
  private webSockets?: WebSocketServer
  private readonly sockets = new Set<Socket>()
  private readonly clients = new Set<WebSocket>()
  private readonly controllers = new Set<AbortController>()
  private readonly slots = new Map<GatewayCapability, WorkerSlot>()
  private readonly retiring = new Set<WorkerSlot>()
  private services: ModelGatewaySnapshot['services'] = { asr: { state: 'stopped', model: '', name: '' }, mt: { state: 'stopped', model: '', name: '' }, tts: { state: 'stopped', model: '', name: '' } }
  private readonly requests: GatewayRequestSnapshot[] = []
  private key = ''
  private keyLoading?: Promise<string>
  private readonly tickets = new Map<string, number>()
  private lifecycle: Promise<unknown> = Promise.resolve()
  private host = DEFAULT_MODEL_GATEWAY.host
  private port = DEFAULT_MODEL_GATEWAY.port
  private stopping = false
  private stopVersion = 0

  constructor(private readonly options: ModelGatewayOptions) {}

  snapshot(): ModelGatewaySnapshot {
    return { state: this.state, address: `http://${this.host}:${this.port}/v1`, port: this.port, connections: this.clients.size,
      activeRequests: this.requests.filter(request => request.status === 'running').length,
      services: structuredClone(this.services), requests: this.requests.map(request => ({ ...request })), ...(this.error ? { error: this.error } : {}) }
  }
  private changed(): void { this.options.onChanged?.(this.snapshot()) }
  revealKey(): Promise<string> {
    if (this.key) return Promise.resolve(this.key)
    this.keyLoading ??= (async () => {
      this.key = await this.options.getKey()
      if (!this.key) { this.key = this.generateKey(); await this.options.setKey(this.key) }
      return this.key
    })().finally(() => { this.keyLoading = undefined })
    return this.keyLoading
  }
  private generateKey(): string { return 'nola-' + randomBytes(32).toString('base64url') }
  async rotateKey(): Promise<string> {
    await this.revealKey()
    const key = this.generateKey(); await this.options.setKey(key); this.key = key
    this.tickets.clear()
    for (const client of this.clients) client.close(1008, 'API key rotated')
    return key
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.lifecycle.catch(() => undefined).then(operation); this.lifecycle = task; return task
  }
  start(): Promise<ModelGatewaySnapshot> { const version = this.stopVersion; return this.serialize(() => this.startInternal(version)) }
  reconfigure(): Promise<ModelGatewaySnapshot> { return this.serialize(async () => {
    if (this.state !== 'running') return this.snapshot()
    const settings = modelGatewaySettingsSchema.parse(this.options.getSettings().modelGateway)
    if (settings.host !== this.host || settings.port !== this.port) { await this.stopInternal(); return this.startInternal() }
    await this.configureWorkers(); return this.snapshot()
  }) }
  stop(): Promise<ModelGatewaySnapshot> {
    // Abort immediately even if startup is waiting on a cold model load.
    this.stopping = true
    this.stopVersion++
    for (const slot of this.slots.values()) void slot.worker.close()
    return this.serialize(() => this.stopInternal())
  }
  async dispose(): Promise<void> { await this.stop() }

  private async startInternal(version = this.stopVersion): Promise<ModelGatewaySnapshot> {
    if (version !== this.stopVersion) return this.snapshot()
    if (this.state === 'running') return this.snapshot()
    this.stopping = false; this.state = 'starting'; this.error = undefined; this.changed()
    try {
      await this.revealKey()
      const config = modelGatewaySettingsSchema.parse(this.options.getSettings().modelGateway)
      this.host = config.host; this.port = config.port
      this.server = createServer((request, response) => { void this.http(request, response) })
      this.server.requestTimeout = 30_000; this.server.headersTimeout = 10_000; this.server.keepAliveTimeout = 5000
      this.server.on('connection', socket => { this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket)) })
      this.webSockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false })
      this.server.on('upgrade', (request, socket, head) => {
        try {
          const ticket = new URL(request.url ?? '/', 'http://localhost').searchParams.get('ticket')
          if (ticket) { const expires = this.tickets.get(ticket) ?? 0; this.tickets.delete(ticket); if (expires < Date.now()) throw new GatewayError(401, 'Invalid realtime ticket') }
          else this.authorize(request)
          if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/v1/realtime') throw new GatewayError(404, 'Unknown endpoint')
          if (this.state !== 'running') throw new GatewayError(503, 'Gateway is loading')
          if (this.clients.size >= 8) throw new GatewayError(429, 'Too many realtime sessions')
          this.webSockets!.handleUpgrade(request, socket, head, client => this.realtime(client, request))
        } catch (error) {
          const status = error instanceof GatewayError ? error.status : 400
          socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
        }
      })
      await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(this.port, this.host, () => { this.server!.removeListener('error', reject); resolve() }) })
      this.server.on('error', () => { this.error = 'Gateway listener failed'; this.state = 'failed'; this.changed(); void this.stop() })
      await this.configureWorkers()
      if (this.stopping) return this.snapshot()
      this.state = 'running'; this.changed()
    } catch {
      await this.stopInternal(); this.state = 'failed'; this.error = 'Gateway could not start. Check the address, port and installed runtime.'; this.changed()
    }
    return this.snapshot()
  }

  private async configureWorkers(): Promise<void> {
    const settings = this.options.getSettings()
    const config = modelGatewaySettingsSchema.parse(settings.modelGateway)
    const usesLocal = (kind: GatewayCapability) => kind === 'tts' || (kind === 'asr' ? (settings.recognition.provider ?? 'local') === 'local' : settings.translation.provider === 'local')
    const resources = KINDS.some(kind => config[kind] && usesLocal(kind)) ? await this.options.listResources() : []
    await Promise.all(KINDS.map(async kind => {
      const local = usesLocal(kind)
      const modelId = kind === 'asr' ? settings.recognition.modelId : kind === 'mt' ? settings.translation.localModelId : settings.synthesis.modelId
      const provider = kind === 'asr' ? settings.recognition.provider ?? 'local' : settings.translation.provider
      const model = local ? `resource:${modelId}` : kind === 'mt' && provider === 'cloud'
        ? `mt-custom:${settings.translation.customModelId || 'legacy'}` : `cloud:${provider}`
      const name = local ? resources.find(item => item.resourceId === modelId)?.name ?? modelId
        : kind === 'mt' && provider === 'cloud' ? settings.translation.cloudName || settings.translation.cloudModel
          : kind === 'asr' ? provider === 'aliyun' ? settings.recognition.aliyunModel : settings.recognition.minimaxModel : provider
      let slot: WorkerSlot | undefined
      const previous = this.slots.get(kind)
      try {
        const workerConfig: GatewayWorkerResult = { compute: settings.compute,
          recognitionProvider: kind === 'asr' ? settings.recognition.provider ?? 'local' : 'aliyun',
          recognitionModelId: kind === 'asr' && local ? modelId : undefined,
          translationProvider: kind === 'mt' ? settings.translation.provider : 'local',
          translationModelId: kind === 'mt' && local ? modelId : undefined,
          sourceLanguage: 'auto', targetLanguages: kind === 'mt' ? [config.targetLanguage] : [],
          max_segment_ms: settings.recognition.max_segment_ms, silence_end_ms: settings.recognition.silence_end_ms }
        if (config[kind] && !local) {
          if (kind === 'asr') {
            Object.assign(workerConfig, recognitionFieldsOf(settings.recognition))
            const key = await this.options.getCredential?.(provider === 'aliyun' ? 'aliyun-asr' : 'minimax-asr')
            if (!key) throw new Error('The configured default requires a cloud recognition API key.')
            workerConfig.recognitionOptions = { ...workerConfig.recognitionOptions as object, apiKey: key }
          } else {
            if (provider === 'recognition') throw new Error('The configured default returns translation with audio. Select a text translation provider for nola-mt.')
            const credential: CredentialProvider | undefined = provider === 'cloud'
              ? customCredentialSlot(settings.translation.customModelId || 'legacy') : provider === 'microsoft' || provider === 'google' ? provider : undefined
            const key = credential ? await this.options.getCredential?.(credential) : undefined
            workerConfig.translationOptions = { ...translationOptionsOf(settings.translation), ...(key ? { apiKey: key } : {}) }
          }
        }
        // Secrets influence reloads but must never appear in snapshots, diagnostics or model IDs.
        const signature = createHash('sha256').update(JSON.stringify([model, workerConfig])).digest('hex')
        if (config[kind] && previous?.signature === signature && this.services[kind].state === 'ready') return
        this.slots.delete(kind)
        if (previous) this.retire(previous)
        this.services[kind] = { state: config[kind] ? 'loading' : 'stopped', model, name: name ?? '' }
        this.changed()
        if (!config[kind] || this.stopping) return
        if (local) {
          const record = resources.find(item => item.resourceId === modelId)
          if (!record?.installed || record.kind !== RESOURCE_KIND[kind]) throw new Error('Select an installed model with the correct capability.')
        }
        const launch = await this.options.directLaunch(model)
        if (this.stopping) return
        const worker = (this.options.createWorker ?? createGatewayWorker)(launch, { kind,
          ...(local ? { resourceId: modelId } : {}), config: workerConfig }, message => {
          if (this.slots.get(kind) === slot && !this.stopping) { this.services[kind].state = 'failed'; this.services[kind].error = message; this.changed() }
        })
        slot = { worker, model, signature, refs: 0, retired: false }; this.slots.set(kind, slot)
        const ready = await worker.ready
        if (this.stopping || this.slots.get(kind) !== slot) return
        this.services[kind] = { ...this.services[kind], state: 'ready', ...(Array.isArray(ready.voices) ? { voices: ready.voices.filter((voice): voice is string => typeof voice === 'string') } : {}) }
      } catch (error) {
        if (slot) { this.slots.delete(kind); await slot.worker.close() }
        else if (previous && this.slots.get(kind) === previous) { this.slots.delete(kind); this.retire(previous) }
        if (!this.stopping) this.services[kind] = { state: 'failed', model, name: name ?? '', error: error instanceof Error && /^(Select an installed|The configured default)/.test(error.message) ? error.message : 'Model could not load. Check the model configuration, runtime and connection.' }
      }
      this.changed()
    }))
  }

  private retire(slot: WorkerSlot): void {
    slot.retired = true; this.retiring.add(slot)
    if (!slot.refs) { this.retiring.delete(slot); void slot.worker.close() }
  }
  private async stopInternal(): Promise<ModelGatewaySnapshot> {
    this.stopping = true; this.state = 'stopping'; this.changed()
    for (const controller of this.controllers) controller.abort()
    for (const client of this.clients) client.terminate()
    this.clients.clear()
    this.webSockets?.close(); this.webSockets = undefined
    const server = this.server; this.server = undefined
    for (const socket of this.sockets) socket.destroy()
    await Promise.all([server ? new Promise<void>(resolve => server.close(() => resolve())) : Promise.resolve(), ...[...this.slots.values(), ...this.retiring].map(slot => slot.worker.close())])
    this.slots.clear(); this.retiring.clear()
    this.tickets.clear()
    for (const kind of KINDS) this.services[kind] = { ...this.services[kind], state: 'stopped', error: undefined }
    this.state = 'stopped'; this.error = undefined; this.changed(); return this.snapshot()
  }

  private authorize(request: IncomingMessage): void {
    const header = request.headers.authorization ?? ''
    const offered = header.startsWith('Bearer ') ? header.slice(7) : ''
    const left = Buffer.from(offered); const right = Buffer.from(this.key)
    if (!right.length || left.length !== right.length || !timingSafeEqual(left, right)) throw new GatewayError(401, 'Invalid API key', 'authentication_error')
  }
  private acquire(kind: GatewayCapability, model: unknown): { slot: WorkerSlot; release(): void } {
    const slot = this.slots.get(kind)
    if (!slot || this.services[kind].state !== 'ready') throw new GatewayError(503, `${kind.toUpperCase()} model is not ready`, 'model_unavailable')
    if (model !== undefined && model !== '' && !(slot.model.startsWith('resource:') && (model === slot.model || model === slot.model.slice(9))) && model !== kind && model !== `nola-${kind}`) throw new GatewayError(404, 'Model does not match the active capability', 'model_not_found')
    slot.refs++
    let released = false
    return { slot, release: () => { if (released) return; released = true; slot.refs--; if (slot.retired && !slot.refs) { this.retiring.delete(slot); void slot.worker.close() } } }
  }
  private begin(kind: GatewayCapability, model: string): GatewayRequestSnapshot {
    if (this.requests.filter(request => request.status === 'running').length >= 16) throw new GatewayError(429, 'Too many active requests')
    const request: GatewayRequestSnapshot = { id: randomUUID(), kind, model, status: 'running', startedAt: Date.now() }
    this.requests.unshift(request)
    while (this.requests.length > 64) { const index = this.requests.map(item => item.status !== 'running').lastIndexOf(true); if (index < 0) break; this.requests.splice(index, 1) }
    this.changed(); return request
  }
  private finish(request: GatewayRequestSnapshot, error?: unknown, cancelled = false): void {
    if (request.status !== 'running') return
    request.status = error ? cancelled ? 'cancelled' : 'failed' : 'completed'; request.durationMs = Date.now() - request.startedAt
    if (error && !cancelled) request.error = error instanceof GatewayError ? error.message : 'Inference failed'
    this.changed()
  }
  private json(response: ServerResponse, status: number, data: unknown): void { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)) }
  private async body(request: IncomingMessage): Promise<Buffer> {
    if (Number(request.headers['content-length']) > MAX_BODY) throw new GatewayError(413, 'Request body is too large')
    const chunks: Buffer[] = []; let length = 0
    for await (const chunk of request) { length += chunk.length; if (length > MAX_BODY) throw new GatewayError(413, 'Request body is too large'); chunks.push(chunk) }
    return Buffer.concat(chunks)
  }
  private async http(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let entry: GatewayRequestSnapshot | undefined
    let release: (() => void) | undefined
    const controller = new AbortController(); this.controllers.add(controller)
    const abort = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', abort)
    try {
      const origin = request.headers.origin
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin') }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }); response.end(); return
      }
      this.authorize(request)
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      if (request.method === 'POST' && path === '/v1/realtime/sessions') {
        if (this.state !== 'running' || this.services.asr.state !== 'ready') throw new GatewayError(503, 'ASR model is not ready')
        for (const [ticket, expires] of this.tickets) if (expires < Date.now()) this.tickets.delete(ticket)
        if (this.tickets.size >= 64) throw new GatewayError(429, 'Too many unused realtime tickets')
        const ticket = randomBytes(24).toString('base64url'); const expires = Date.now() + 30_000; this.tickets.set(ticket, expires)
        this.json(response, 200, { client_secret: { value: ticket, expires_at: Math.floor(expires / 1000) }, url: `/v1/realtime?ticket=${ticket}` }); return
      }
      if (request.method === 'GET' && path === '/v1/models') {
        this.json(response, 200, { object: 'list', data: KINDS.filter(kind => this.services[kind].state === 'ready').map(kind => ({ id: `nola-${kind}`, object: 'model', created: 0, owned_by: 'nola', capabilities: [kind], ...(kind === 'tts' ? { voices: this.services[kind].voices ?? [] } : {}) })) }); return
      }
      if (request.method !== 'POST' || !['/v1/chat/completions', '/v1/audio/speech', '/v1/audio/transcriptions'].includes(path)) throw new GatewayError(404, 'Unknown endpoint')
      if (this.state !== 'running') throw new GatewayError(503, 'Gateway is loading')
      const bytes = await this.body(request)
      let data: Record<string, unknown>
      if (path === '/v1/audio/transcriptions') data = await parseMultipart(request.headers['content-type'] ?? '', bytes)
      else {
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new GatewayError(415, 'Expected application/json')
        try { data = object(JSON.parse(bytes.toString('utf8'))) } catch { throw new GatewayError(400, 'Invalid JSON') }
      }
      const kind: GatewayCapability = path === '/v1/chat/completions' ? 'mt' : path === '/v1/audio/speech' ? 'tts' : 'asr'
      const acquired = this.acquire(kind, data.model); release = acquired.release
      entry = this.begin(kind, acquired.slot.model)
      let payload: GatewayWorkerResult
      if (kind === 'mt') payload = translationRequest(data, this.options.getSettings().modelGateway.targetLanguage)
      else if (kind === 'tts') {
        if (data.response_format && !['mp3', 'wav', 'pcm'].includes(String(data.response_format))) throw new GatewayError(400, 'Supported speech formats are mp3, wav and pcm')
        if (data.speed !== undefined && data.speed !== 1) throw new GatewayError(400, 'Only speech speed 1 is supported')
        payload = { op: 'infer', text: text(data.input, 'input'), voice: data.voice === undefined ? this.options.getSettings().synthesis.voice : text(data.voice, 'voice', 256), response_format: data.response_format ?? 'mp3' }
      } else {
        if (!['json', 'text', undefined].includes(data.response_format as string | undefined)) throw new GatewayError(400, 'Supported transcription formats are json and text')
        payload = { op: 'infer', audio: data.audio, source: data.language === undefined ? 'auto' : text(data.language, 'language', 32) }
      }
      const result = await acquired.slot.worker.request(payload, controller.signal)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (kind === 'tts') {
        const format = data.response_format ?? 'mp3'; const prefix = format === 'mp3' ? 'data:audio/mpeg;base64,' : 'data:audio/wav;base64,'
        if (typeof result.audio !== 'string' || !result.audio.startsWith(prefix)) throw new Error('Invalid speech response')
        const bytes = Buffer.from(result.audio.slice(prefix.length), 'base64')
        const audio = format === 'pcm' ? wavPcm(bytes) : bytes
        response.writeHead(200, { 'Content-Type': format === 'pcm' ? 'application/octet-stream' : format === 'mp3' ? 'audio/mpeg' : 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store' }); response.end(audio)
      } else if (kind === 'asr') {
        if (data.response_format === 'text') { response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(String(result.text ?? '')) }
        else this.json(response, 200, { text: result.text ?? '' })
      } else {
        const id = `chatcmpl-${entry.id}`; const created = Math.floor(Date.now() / 1000)
        const content = String(result.text ?? '')
        if (data.stream === true) {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
          const send = (delta: unknown, finish: string | null) => response.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: `nola-${kind}`, choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n')
          send({ role: 'assistant', content }, null); send({}, 'stop'); response.end('data: [DONE]\n\n')
        } else this.json(response, 200, { id, object: 'chat.completion', created, model: `nola-${kind}`, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] })
      }
      this.finish(entry)
    } catch (cause) {
      const error = clientError(cause)
      if (entry) this.finish(entry, error, controller.signal.aborted)
      if (!response.headersSent && !response.destroyed) this.json(response, error instanceof GatewayError ? error.status : 500, { error: { message: error instanceof GatewayError ? error.message : 'Inference failed. Check the capability status in Nola.', type: error instanceof GatewayError ? error.code : 'server_error', code: error instanceof GatewayError ? error.code : 'inference_failed' } })
      else if (!response.writableEnded) response.end()
    } finally { release?.(); this.controllers.delete(controller); response.removeListener('close', abort) }
  }

  private realtime(client: WebSocket, request: IncomingMessage): void {
    const id = randomUUID(); let acquired: ReturnType<ModelGateway['acquire']> | undefined
    let entry: GatewayRequestSnapshot | undefined; let unsubscribe: (() => void) | undefined
    let opened = false; let finished = false; let queuedBytes = 0; let queue = Promise.resolve()
    const send = (event: Record<string, unknown>) => { if (client.readyState === WebSocket.OPEN) { if (client.bufferedAmount > MAX_BODY) { client.terminate(); return }; client.send(JSON.stringify({ event_id: `event_${randomUUID()}`, ...event })) } }
    const error = (message: string) => send({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_request', message } })
    const session: { id: string; object: string; model?: string; input_audio_format: string; sample_rate: number; input_audio_transcription: { language: string }; turn_detection: { type: string; silence_duration_ms: number } | null } = { id, object: 'realtime.session', model: new URL(request.url ?? '/', 'http://localhost').searchParams.get('model') ?? undefined, input_audio_format: 'pcm16', sample_rate: 16000, input_audio_transcription: { language: 'auto' }, turn_detection: { type: 'server_vad', silence_duration_ms: 800 } }
    this.clients.add(client); this.changed(); send({ type: 'session.created', session })
    const open = async () => {
      if (opened) return
      acquired = this.acquire('asr', session.model)
      entry = this.begin('asr', acquired.slot.model)
      unsubscribe = acquired.slot.worker.subscribe(event => {
        if (event.fatal) { error('ASR worker is unavailable'); client.close(1011, 'ASR worker failed'); return }
        if (event.session !== id || !event.event) return
        send(object(event.event))
      })
      await acquired.slot.worker.request({ op: 'session.open', session: id, language: session.input_audio_transcription.language, silenceMs: session.turn_detection?.silence_duration_ms ?? 800, manual: session.turn_detection === null })
      opened = true
    }
    client.on('message', (raw, binary) => {
      if (finished) { error('Session is finished'); return }
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw
      queuedBytes += bytes.length
      if (queuedBytes > 4 * 1024 * 1024) { client.close(1009, 'Too much pending audio'); return }
      const length = bytes.length
      queue = queue.then(async () => {
        if (client.readyState !== WebSocket.OPEN) return
        if (binary) throw new GatewayError(400, 'Use base64 PCM16 in input_audio_buffer.append')
        let message: Record<string, unknown>
        try { message = object(JSON.parse(bytes.toString())) } catch { throw new GatewayError(400, 'Invalid JSON') }
        if (message.type === 'session.update') {
          if (opened) throw new GatewayError(400, 'Update the session before sending audio')
          const update = object(message.session)
          if (update.input_audio_format !== undefined && !['pcm16', 'pcm'].includes(String(update.input_audio_format))) throw new GatewayError(400, 'Only PCM16 audio is supported')
          if (update.sample_rate !== undefined && update.sample_rate !== 16000) throw new GatewayError(400, 'Audio sample rate must be 16000')
          if (update.model !== undefined) session.model = text(update.model, 'model', 512)
          const transcription = object(update.input_audio_transcription)
          if (transcription.language !== undefined) session.input_audio_transcription.language = text(transcription.language, 'language', 32)
          const vad = object(update.turn_detection)
          if (update.turn_detection !== undefined && update.turn_detection !== null && vad.type !== 'server_vad') throw new GatewayError(400, 'Use server_vad or null turn detection')
          if (update.turn_detection === null) session.turn_detection = null
          if (vad.silence_duration_ms !== undefined) {
            if (typeof vad.silence_duration_ms !== 'number' || vad.silence_duration_ms < 300 || vad.silence_duration_ms > 2000) throw new GatewayError(400, 'Invalid silence_duration_ms')
            session.turn_detection = { type: 'server_vad', silence_duration_ms: vad.silence_duration_ms }
          }
          await open(); send({ type: 'session.updated', session }); return
        }
        await open()
        if (message.type === 'input_audio_buffer.append') {
          const audio = text(message.audio, 'audio', 1024 * 1024)
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio) || Buffer.from(audio, 'base64').length % 2) throw new GatewayError(400, 'Invalid PCM16 audio')
          await acquired!.slot.worker.request({ op: 'session.append', session: id, audio })
        } else if (message.type === 'input_audio_buffer.commit') {
          await acquired!.slot.worker.request({ op: 'session.commit', session: id }); send({ type: 'input_audio_buffer.committed' })
        } else if (message.type === 'session.finish') {
          await acquired!.slot.worker.request({ op: 'session.finish', session: id }); finished = true; this.finish(entry!); send({ type: 'session.finished', session }); client.close(1000, 'Finished')
        } else throw new GatewayError(400, 'Unknown realtime event')
      }).catch(reason => {
        const cause = clientError(reason)
        error(cause instanceof GatewayError ? cause.message : 'Realtime transcription failed')
        if (!(cause instanceof GatewayError)) { finished = true; if (entry) this.finish(entry, cause); client.close(1011, 'Transcription failed') }
      }).finally(() => { queuedBytes -= length })
    })
    client.once('close', () => {
      this.clients.delete(client); unsubscribe?.()
      void queue.finally(async () => { if (opened) await acquired?.slot.worker.request({ op: 'session.close', session: id }).catch(() => undefined); acquired?.release() })
      if (entry && !finished) this.finish(entry, new Error('Session closed'), true)
      this.changed()
    })
    client.on('error', () => client.terminate())
  }
}

export function translationRequest(data: Record<string, unknown>, defaultTarget: string): GatewayWorkerResult {
  if (!Array.isArray(data.messages) || !data.messages.length || data.messages.length > 64) throw new GatewayError(400, 'messages must be a nonempty array')
  if (data.tools !== undefined || data.tool_choice !== undefined) throw new GatewayError(400, 'Translation models do not provide tools')
  if (data.n !== undefined && data.n !== 1) throw new GatewayError(400, 'Only n=1 is supported')
  if (data.stream !== undefined && typeof data.stream !== 'boolean') throw new GatewayError(400, 'Invalid stream flag')
  const messages = data.messages.map(value => {
    const message = object(value)
    if (!['system', 'developer', 'user', 'assistant'].includes(String(message.role))) throw new GatewayError(400, 'Unsupported message role')
    return { role: String(message.role), content: text(message.content, 'message content') }
  })
  const last = [...messages].reverse().find(message => message.role === 'user')
  if (!last) throw new GatewayError(400, 'A user message is required')
  const options = object(data.translation_options)
  const instructions = messages.filter(message => ['system', 'developer'].includes(message.role)).map(message => message.content).join('\n')
  const promptTarget = /(?:translate[\s\S]{0,100}?\b(?:to|into)\s+)([\p{L}-]+)/iu.exec(instructions)?.[1]
    ?? /翻译(?:成|为)([\p{L}-]+)/u.exec(instructions)?.[1]
  let source = last.content
  const inline = /^\s*translate\s+(?:the\s+following\s+(?:text\s+)?)?(?:from\s+[\p{L}-]+\s+)?(?:to|into)\s+([\p{L}-]+)\s*:\s*([\s\S]+)$/iu.exec(source)
  if (inline) source = inline[2]
  return { op: 'infer', text: source, source: text(options.source_lang ?? options.source_language ?? options.source ?? 'auto', 'source language', 32),
    target: normalizeLanguage(text(options.target_lang ?? options.target_language ?? options.target ?? promptTarget ?? inline?.[1] ?? defaultTarget, 'target language', 32)) }
}
function normalizeLanguage(value: string): string {
  const names: Record<string, string> = { chinese: 'zh', english: 'en', japanese: 'ja', korean: 'ko', french: 'fr', german: 'de', spanish: 'es', russian: 'ru', portuguese: 'pt', italian: 'it', arabic: 'ar', 中文: 'zh', 简体中文: 'zh', 繁体中文: 'zh-TW', 英文: 'en', 英语: 'en', 日语: 'ja', 日文: 'ja', 韩语: 'ko' }
  return names[value.toLowerCase()] ?? value
}
async function parseMultipart(contentType: string, bytes: Buffer): Promise<Record<string, unknown>> {
  if (!contentType.toLowerCase().startsWith('multipart/form-data;') || !/boundary=/i.test(contentType)) throw new GatewayError(415, 'Expected multipart/form-data')
  let form: FormData
  try { form = await new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': contentType } }).formData() } catch { throw new GatewayError(400, 'Invalid multipart body') }
  const file = form.get('file')
  if (!file || typeof file === 'string' || file.size === 0) throw new GatewayError(400, 'Audio file is required')
  const data: Record<string, unknown> = { audio: Buffer.from(await file.arrayBuffer()).toString('base64') }
  for (const field of ['model', 'language', 'response_format']) { const value = form.get(field); if (value !== null) { if (typeof value !== 'string') throw new GatewayError(400, `Invalid ${field}`); data[field] = value } }
  return data
}
function wavPcm(wav: Buffer): Buffer {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV response')
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4)
    if (wav.toString('ascii', offset, offset + 4) === 'data' && offset + 8 + size <= wav.length) return wav.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + size % 2
  }
  throw new Error('WAV data chunk is missing')
}
