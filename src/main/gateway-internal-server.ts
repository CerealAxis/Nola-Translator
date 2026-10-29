import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import { GatewayWorkerError, type GatewayWorker, type GatewayWorkerResult } from './model-gateway-worker'

export interface GatewayCapabilityLease {
  worker: GatewayWorker
  model: string
  release(error?: unknown): void
}

interface InternalServerOptions {
  snapshot(): ModelGatewaySnapshot
  /** `binding` names a specific model; empty asks for whatever the capability is bound to. */
  acquire(kind: 'asr' | 'mt', binding?: string): Promise<GatewayCapabilityLease>
}

/** Private process-to-process transport. Its random key is never exposed through renderer IPC. */
export class GatewayInternalServer {
  private readonly key = randomBytes(32).toString('base64url')
  private server?: Server
  private readonly sockets = new Set<Socket>()
  private readonly clients = new Set<WebSocket>()
  private readonly requests = new Set<AbortController>()
  private readonly sessions = new Map<string, GatewayCapabilityLease>()
  private readonly upgrades = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  private address = ''

  constructor(private readonly options: InternalServerOptions) {}

  environment(): NodeJS.ProcessEnv {
    if (!this.address) throw new Error('Model gateway is stopped. Start the required capabilities in Model Gateway.')
    return { NOLA_GATEWAY_ADDRESS: this.address, NOLA_GATEWAY_KEY: this.key }
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      const controller = new AbortController()
      this.requests.add(controller)
      response.once('close', () => { if (!response.writableEnded) controller.abort() })
      void (async () => {
        let lease: GatewayCapabilityLease | undefined
        let streaming = false
        try {
          this.authorize(request)
          if (request.method === 'GET' && request.url === '/internal/status') {
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(this.options.snapshot()))
            return
          }
          if (request.method !== 'POST' || request.url !== '/internal/mt') throw new Error('Unknown internal endpoint')
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 24 * 1024 * 1024) throw new Error('Request too large')
            chunks.push(chunk)
          }
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as GatewayWorkerResult
          streaming = data.stream === true
          const pinned = typeof data.session === 'string' ? this.sessions.get(data.session) : undefined
          lease = pinned ? undefined : await this.options.acquire('mt', typeof data.model === 'string' ? data.model : undefined)
          const active = pinned ?? lease!
          if (data.stream === true) response.setHeader('Content-Type', 'application/x-ndjson')
          const result = await active.worker.request({ ...data, op: 'infer' }, controller.signal, event => {
            if (data.stream === true && !response.destroyed) {
              const delta = event.event as GatewayWorkerResult | undefined
              if (delta?.type === 'translation.delta') response.write(JSON.stringify({ text: delta.text, path: delta.path }) + '\n')
            }
          })
          if (data.stream === true) response.end(JSON.stringify({ ...result, done: true }) + '\n')
          else { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(result)) }
        } catch (error) {
          if (!response.destroyed) {
            const body = JSON.stringify({ error: { code: error instanceof GatewayWorkerError ? error.code : 'model_unavailable', message: 'Model gateway capability unavailable' } })
            if (streaming) {
              if (!response.headersSent) response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
              response.end(body + '\n')
            } else if (!response.headersSent) { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(body) }
            else response.destroy()
          }
        } finally { lease?.release(); this.requests.delete(controller) }
      })()
    })
    this.server.on('connection', socket => { this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket)) })
    this.server.on('upgrade', (request, socket, head) => {
      try {
        this.authorize(request)
        if (request.url !== '/internal/asr' || this.clients.size >= 16) throw new Error('Unknown endpoint or session limit')
        this.upgrades.handleUpgrade(request, socket, head, client => this.session(client))
      } catch { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n') }
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => { this.server!.removeListener('error', reject); resolve() })
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Internal gateway address unavailable')
    this.address = `http://127.0.0.1:${address.port}`
  }

  private authorize(request: IncomingMessage): void {
    const received = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${this.key}`)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Unauthorized')
  }

  private session(client: WebSocket): void {
    this.clients.add(client)
    let asr: GatewayCapabilityLease | undefined
    let mt: GatewayCapabilityLease | undefined
    let unsubscribe: (() => void) | undefined
    let session = ''
    let pendingBytes = 0
    let queue = Promise.resolve()
    const send = (value: unknown) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value)) }
    client.on('message', bytes => {
      const length = Array.isArray(bytes) ? bytes.reduce((sum, chunk) => sum + chunk.length, 0) : bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length
      pendingBytes += length
      if (pendingBytes > 4 * 1024 * 1024) { client.close(1009, 'Audio backlog exceeded'); return }
      queue = queue.then(async () => {
        let id: unknown
        try {
          if (client.readyState !== WebSocket.OPEN) return
          const data = JSON.parse(bytes.toString()) as GatewayWorkerResult
          id = data.id
          if (typeof id !== 'string' || typeof data.session !== 'string' || !String(data.op).startsWith('session.')) throw new Error('Invalid session request')
          if (data.op === 'session.open') {
            if (asr || this.sessions.has(data.session)) throw new Error('Session already exists')
            asr = await this.options.acquire('asr', typeof data.recognitionBinding === 'string' ? data.recognitionBinding : undefined)
            session = data.session
            if (Array.isArray(data.targetLanguages) && data.targetLanguages.length && (!data.nativeTranslation || this.options.snapshot().services.mt.fallbackReady)) {
              mt = await this.options.acquire('mt', typeof data.translationBinding === 'string' ? data.translationBinding : undefined)
            }
            if (mt) this.sessions.set(session, mt)
            unsubscribe = asr.worker.subscribe(event => {
              if (event.fatal) { client.close(1011, 'ASR service stopped'); return }
              if (event.session === session) send(event)
            })
          }
          if (!asr || data.session !== session) throw new Error('Session not open')
          const result = await asr.worker.request(data)
          send({ id, result })
        } catch (error) { send({ id, error: { code: error instanceof GatewayWorkerError ? error.code : 'model_unavailable', message: 'Model gateway session unavailable' } }); client.close(1011, 'Session failed') }
        finally { pendingBytes -= length }
      })
    })
    client.once('close', () => {
      this.clients.delete(client)
      unsubscribe?.()
      void queue.finally(async () => {
        try { if (asr && session) await asr.worker.request({ op: 'session.close', session }) }
        catch { /* The capability may already have stopped. */ }
        finally { this.sessions.delete(session); asr?.release(); mt?.release() }
      }).catch(() => undefined)
    })
    client.on('error', () => client.terminate())
  }

  async close(): Promise<void> {
    this.address = ''
    for (const controller of this.requests) controller.abort()
    for (const client of this.clients) client.terminate()
    for (const socket of this.sockets) socket.destroy()
    this.upgrades.close()
    const server = this.server
    this.server = undefined
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
