import { randomInt } from 'node:crypto'
import { WebSocket } from 'ws'

import type { BackendSupervisor } from './backend-supervisor'

const HEADER_BYTES = 40
const OPEN_TIMEOUT_MS = 10_000
const ACK_TIMEOUT_MS = 2_000

interface Pending {
  frame: 'stream_opened' | 'audio_accepted'
  sequence?: number
  throughSample?: number
  promise: Promise<void>
  settle: (error?: Error) => void
}

interface InputStream {
  socket: WebSocket
  epoch: number
  sampleRate: number
  handle: number
  ready: boolean
  sequence: number
  throughSample: number
  pending?: Pending
  ending?: Promise<void>
}

/** The authenticated v2 input channel stays in main, behind the native browser bridge. */
export class BackendBrowserInput {
  private stream?: InputStream
  private closed = false

  constructor(
    private readonly backend: Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader' | 'instanceId'>,
    private readonly sessionId: string,
  ) {
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(sessionId)) throw new Error('Invalid backend session ID')
  }

  async open(epoch: number, sampleRate: number): Promise<void> {
    if (this.closed || this.stream) throw new Error('Browser audio input already opened or closed')
    if (!Number.isInteger(epoch) || epoch < 0 || epoch > 0xffffffff
        || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Invalid browser audio format')
    }
    const url = new URL(`/api/v2/sessions/${this.sessionId}/input`, this.backend.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url, {
      headers: this.backend.authorizationHeader(), handshakeTimeout: OPEN_TIMEOUT_MS, maxPayload: 16 * 1024,
    })
    const stream: InputStream = {
      socket, epoch, sampleRate, handle: randomInt(1, 0x100000000), ready: false, sequence: 0, throughSample: 0,
    }
    this.stream = stream
    const opened = this.expect(stream, 'stream_opened', OPEN_TIMEOUT_MS)
    socket.once('open', () => {
      if (this.stream !== stream) return
      socket.send(JSON.stringify({
        frame: 'stream_open', stream_handle: stream.handle, epoch, encoding: 'pcm_s16le', channels: 1, sample_rate: sampleRate,
      }), error => { if (error) this.fail(stream, 'Browser audio stream could not open') })
    })
    socket.on('message', (data, binary) => {
      if (this.stream !== stream) return
      const pending = stream.pending
      try {
        if (binary || !pending) throw new Error()
        const ack = JSON.parse(data.toString())
        if (ack.frame !== pending.frame || ack.epoch !== epoch || ack.stream_handle !== stream.handle) throw new Error()
        if (ack.frame === 'stream_opened') {
          if (ack.server_instance_id !== this.backend.instanceId) throw new Error()
          stream.ready = true
        } else {
          if (ack.through_chunk_seq !== pending.sequence || ack.through_sample !== pending.throughSample) throw new Error()
          stream.sequence += 1
          stream.throughSample = ack.through_sample
        }
        pending.settle()
      } catch {
        this.fail(stream, 'Invalid browser audio acknowledgement')
      }
    })
    socket.on('error', () => this.fail(stream, 'Browser audio socket failed'))
    socket.once('close', () => this.fail(stream, 'Browser audio socket disconnected'))
    await opened.promise
  }

  async push(pcm: Buffer): Promise<void> {
    const stream = this.stream
    if (!stream?.ready || stream.ending || stream.socket.readyState !== WebSocket.OPEN) throw new Error('Browser audio stream is not open')
    if (stream.pending) throw new Error('Browser audio frame is awaiting acknowledgement')
    if (!Buffer.isBuffer(pcm)) throw new Error('Invalid browser PCM frame')
    const samples = pcm.length / 2
    const throughSample = stream.throughSample + samples
    if (!Number.isInteger(samples) || samples < 1 || samples > stream.sampleRate / 5
        || !Number.isSafeInteger(throughSample)) throw new Error('Invalid browser PCM frame')
    const packet = Buffer.allocUnsafe(HEADER_BYTES + pcm.length)
    packet.write('NOLA', 0, 4, 'ascii')
    packet[4] = 1
    packet[5] = 1
    packet.writeUInt16LE(HEADER_BYTES, 6)
    packet.writeUInt32LE(stream.handle, 8)
    packet.writeUInt32LE(stream.epoch, 12)
    packet.writeBigUInt64LE(BigInt(stream.sequence), 16)
    packet.writeBigUInt64LE(BigInt(stream.throughSample), 24)
    packet.writeUInt32LE(samples, 32)
    packet.writeUInt32LE(pcm.length, 36)
    pcm.copy(packet, HEADER_BYTES)
    const ack = this.expect(stream, 'audio_accepted', ACK_TIMEOUT_MS, stream.sequence, throughSample)
    stream.socket.send(packet, error => { if (error) this.fail(stream, 'Browser audio frame could not be sent') })
    await ack.promise
  }

  finish(): Promise<void> {
    const stream = this.stream
    if (!stream?.ready) return Promise.reject(new Error('Browser audio stream is not open'))
    return stream.ending ??= (async () => {
      await stream.pending?.promise
      if (this.stream !== stream || stream.socket.readyState !== WebSocket.OPEN) throw new Error('Browser audio stream was replaced')
      await new Promise<void>((resolve, reject) => {
        stream.socket.send(this.closeFrame(stream, true), error => {
          if (error || this.stream !== stream) reject(new Error('Browser audio EOF could not be sent'))
          else {
            this.stream = undefined
            stream.socket.close()
            resolve()
          }
        })
      })
    })()
  }

  reset(): void {
    const stream = this.stream
    if (stream) this.fail(stream, 'Browser audio stream was reset')
  }

  close(): void {
    this.closed = true
    this.reset()
  }

  private closeFrame(stream: InputStream, eof: boolean): string {
    return JSON.stringify({ frame: 'stream_close', stream_handle: stream.handle, eof })
  }

  private expect(stream: InputStream, frame: Pending['frame'], timeout: number, sequence?: number, throughSample?: number): Pending {
    let settle!: Pending['settle']
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(stream, 'Browser audio acknowledgement timed out'), timeout)
      settle = error => {
        clearTimeout(timer)
        stream.pending = undefined
        if (error) reject(error)
        else resolve()
      }
    })
    return stream.pending = { frame, sequence, throughSample, promise, settle }
  }

  private fail(stream: InputStream, message: string): void {
    if (this.stream !== stream) return
    this.stream = undefined
    stream.pending?.settle(new Error(message))
    if (stream.socket.readyState === WebSocket.OPEN) {
      stream.socket.send(this.closeFrame(stream, false))
      stream.socket.close()
    } else if (stream.socket.readyState === WebSocket.CONNECTING) {
      stream.socket.terminate()
    }
  }
}
