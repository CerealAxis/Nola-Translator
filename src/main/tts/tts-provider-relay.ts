import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { ResolvedTtsRequest, TtsAudioResult } from '../../shared/tts/synthesis'

export const TTS_PROVIDER_RELAY_MODEL = 'nola-provider-tts'
const payloadSchema = z.object({ text: z.string().min(1).max(64000), language: z.string().min(1).max(32) }).strict()
type Execute = (request: ResolvedTtsRequest, signal: AbortSignal) => Promise<TtsAudioResult>

export class TtsProviderRelay {
  private server?: Server
  private opening?: Promise<string>
  private readonly leases = new Map<string, Array<{ snapshot: ResolvedTtsRequest; execute: Execute }>>()

  private open(): Promise<string> {
    if (this.opening) return this.opening
    this.opening = new Promise((resolve, reject) => {
      this.server = createServer((request, response) => { void this.handle(request, response) })
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        if (!address || typeof address === 'string') return reject(new Error('ttsRelayAddressUnavailable'))
        resolve(`http://127.0.0.1:${address.port}/synthesize`)
      })
    })
    return this.opening
  }

  async register(snapshot: ResolvedTtsRequest, execute: Execute): Promise<{ url: string; token: string }> {
    const url = await this.open(), token = randomBytes(32).toString('hex')
    this.leases.set(token, [{ snapshot: structuredClone(snapshot), execute }])
    return { url, token }
  }

  release(token: string): void { this.leases.delete(token) }

  async combine(tokens: string[]): Promise<{ url: string; token: string }> {
    const entries = tokens.flatMap(token => this.leases.get(token) ?? [])
    if (entries.length !== tokens.length || new Set(entries.map(item => item.snapshot.targetLanguage)).size !== entries.length) throw new Error('ttsRelayScopeMismatch')
    const token = randomBytes(32).toString('hex'), url = await this.open()
    this.leases.set(token, entries)
    for (const previous of tokens) this.release(previous)
    return { url, token }
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
    const leases = this.leases.get(token)
    if (request.method !== 'POST' || request.url !== '/synthesize' || !leases) { response.writeHead(403); response.end(); return }
    const cancellation = new AbortController()
    const cancel = () => { if (!response.writableEnded) cancellation.abort() }
    response.once('close', cancel)
    try {
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 300_000) { response.writeHead(413); response.end(); return }
        chunks.push(Buffer.from(chunk))
      }
      const payload = payloadSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const lease = leases.find(item => item.snapshot.targetLanguage === payload.language || item.snapshot.targetLanguage === 'auto')
      if (!lease) {
        response.writeHead(422); response.end(); return
      }
      const result = await lease.execute({ ...structuredClone(lease.snapshot), text: payload.text, targetLanguage: payload.language }, cancellation.signal)
      const data = /^data:(audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(result.audio)
      if (!data) throw new Error('ttsRelayAudioInvalid')
      const audio = Buffer.from(data[2], 'base64')
      if (audio.length > 32 * 1024 * 1024) throw new Error('ttsRelayAudioTooLarge')
      response.writeHead(200, { 'Content-Type': data[1], 'Content-Length': audio.length, 'Cache-Control': 'no-store' })
      response.end(audio)
    } catch (error) {
      if (!response.destroyed && !response.headersSent) {
        const source = error as { code?: string }
        const safeCodes = ['AUTHENTICATION_FAILED', 'CLOUD_MODEL_KEY_REQUIRED', 'CLOUD_MODEL_BILLING_REQUIRED',
          'CLOUD_MODEL_ACCESS_DENIED', 'CLOUD_MODEL_RATE_LIMITED', 'CLOUD_MODEL_PROVIDER_UNAVAILABLE', 'REQUEST_TIMEOUT', 'NETWORK_UNAVAILABLE']
        const code = source?.code && safeCodes.includes(source.code) ? source.code : 'ttsProviderFailed'
        response.writeHead(error instanceof z.ZodError ? 422 : 502, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: error instanceof z.ZodError ? 'ttsRelayInputInvalid' : code }))
      }
    } finally { response.removeListener('close', cancel) }
  }

  async close(): Promise<void> {
    this.leases.clear()
    this.server?.closeAllConnections()
    if (this.server?.listening) await new Promise<void>((resolve, reject) => this.server!.close(error => error ? reject(error) : resolve()))
    this.server = undefined; this.opening = undefined
  }
}
