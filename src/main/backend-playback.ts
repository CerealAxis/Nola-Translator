import { randomUUID } from 'node:crypto'
import { WebSocket, type RawData } from 'ws'
import { z } from 'zod'

import type { PlaybackAck, PlaybackChunk } from '../renderer/bridge/realtime-playback'
import type { BackendSupervisor } from './backend-supervisor'

const HEADER_BYTES = 40
const MAX_PCM_BYTES = 2 * 1024 * 1024
const id = z.string().min(1).max(128)
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const u32 = counter.max(0xffffffff)
const opened = z.object({
  audio_stream_id: id,
  stream_handle: u32,
  playback_generation: u32,
  sample_rate: counter.min(8000).max(96000),
  channels: z.union([z.literal(1), z.literal(2)]),
  encoding: z.literal('pcm_s16le').optional(),
})
const meta = z.object({
  audio_stream_id: id,
  chunk_seq: counter,
  sample_start: counter,
  sample_count: u32,
  payload_bytes: u32.max(MAX_PCM_BYTES),
  is_last: z.boolean(),
})
const playbackState = z.object({
  state: z.string(),
  playback_generation: u32,
  audio_stream_id: id.nullish(),
  claim_id: id.nullish(),
  owner_id: id.nullish(),
})
const incoming = z.object({
  frame: z.string().optional(),
  schema_version: z.literal(2),
  server_instance_id: id,
  session_id: id,
  consumer_id: id.optional(),
  playback_owner_id: id.nullish(),
  snapshot: z.object({ playback_generation: u32 }).optional(),
  event_type: z.string().optional(),
  payload: z.unknown().optional(),
})
const ackSchema = z.object({
  claimId: id,
  audioStreamId: id,
  generation: u32,
  chunkSeq: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  playedSampleOffset: counter,
  state: z.enum(['started', 'finished', 'interrupted', 'unknown']),
})

interface PlaybackCallbacks {
  onChunk: (chunk: PlaybackChunk) => void
  onFence: (generation: number) => void
  onDisconnect?: () => void
}

export class BackendPlayback {
  readonly ready: Promise<void>
  private readonly socket: WebSocket
  private readonly ownerId = randomUUID()
  get playbackOwnerId(): string { return this.ownerId }
  private accepted = false
  private closed = false
  private generation = 0
  private stream?: z.infer<typeof opened>
  private claimId?: string
  private pending?: z.infer<typeof meta>
  private nextSeq = 0
  private nextSample = 0
  private terminal = false

  constructor(
    backend: Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader' | 'instanceId'>,
    sessionId: string,
    private readonly callbacks: PlaybackCallbacks,
  ) {
    id.parse(sessionId)
    const url = new URL('/api/v2/sessions/' + encodeURIComponent(sessionId) + '/audio', backend.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(url, {
      headers: backend.authorizationHeader(),
      maxPayload: HEADER_BYTES + MAX_PCM_BYTES,
      handshakeTimeout: 10_000,
    })
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.close(), 10_000)
      this.socket.once('open', () => this.socket.send(JSON.stringify({
        frame: 'hello', schema_version: 2, consumer_id: this.ownerId,
        outputs: ['audio'], request_playback_owner: true,
      })))
      this.socket.on('message', (data, binary) => {
        if (this.closed) return
        try {
          if (binary) {
            this.receivePcm(data)
          } else {
            const frame = incoming.parse(JSON.parse(data.toString()))
            if (frame.session_id !== sessionId || frame.server_instance_id !== backend.instanceId) {
              throw new Error('Playback socket identity mismatch')
            }
            if (!this.accepted) {
              if (frame.frame !== 'hello_ack' || frame.consumer_id !== this.ownerId
                  || frame.playback_owner_id !== this.ownerId || !frame.snapshot) {
                throw new Error('Playback ownership was not granted')
              }
              this.accepted = true
              this.fence(frame.snapshot.playback_generation)
              clearTimeout(timeout)
              resolve()
            } else {
              this.receiveEvent(frame.event_type, frame.payload)
            }
          }
        } catch {
          this.handleDisconnect()
        }
      })
      this.socket.on('error', () => {
        if (this.accepted) this.handleDisconnect()
        else this.close()
      })
      this.socket.once('close', () => {
        clearTimeout(timeout)
        if (!this.accepted) reject(new Error('Playback socket closed before ownership was granted'))
        this.handleDisconnect()
      })
    })
    // Callers may attach to ready after constructing the socket.
    void this.ready.catch(() => {})
  }

  fence(generation: number): void {
    if (this.closed || u32.parse(generation) <= this.generation) return
    this.generation = generation
    this.callbacks.onFence(generation)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.terminate()
    this.callbacks.onFence(this.generation)
  }

  private handleDisconnect(): void {
    if (this.closed) return
    const unexpected = this.accepted
    this.close()
    if (unexpected) this.callbacks.onDisconnect?.()
  }

  acknowledge(ack: PlaybackAck): void {
    const parsed = ackSchema.safeParse(ack)
    if (!parsed.success || this.closed || this.socket.readyState !== WebSocket.OPEN || !this.stream) return
    const value = parsed.data
    if (value.claimId !== this.claimId || value.audioStreamId !== this.stream.audio_stream_id
        || value.generation !== this.generation || value.generation !== this.stream.playback_generation
        || value.chunkSeq >= this.nextSeq || value.playedSampleOffset > this.nextSample
        || (value.state === 'finished' && (!this.terminal || value.playedSampleOffset !== this.nextSample
          || value.chunkSeq !== this.nextSeq - 1))) return
    this.socket.send(JSON.stringify({
      frame: 'playback_ack', owner_id: this.ownerId, claim_id: value.claimId,
      playback_generation: value.generation, audio_stream_id: value.audioStreamId,
      chunk_seq: value.chunkSeq, state: value.state, played_sample_offset: value.playedSampleOffset,
    }))
  }

  private receiveEvent(type: string | undefined, payload: unknown): void {
    if (type === 'audio_stream_opened') {
      if (this.pending) throw new Error('Playback chunk has no PCM frame')
      this.stream = opened.parse(payload)
      this.claimId = undefined
      this.nextSeq = 0
      this.nextSample = 0
      this.terminal = false
    } else if (type === 'playback_state') {
      const state = playbackState.parse(payload)
      if (!state.claim_id && (state.state === 'cancelled' || state.state === 'interrupted')) {
        if (state.playback_generation > this.generation) this.pending = undefined
        this.fence(state.playback_generation)
      } else if (state.state === 'claimed') {
        if (!this.stream || state.audio_stream_id !== this.stream.audio_stream_id
            || state.owner_id !== this.ownerId || !state.claim_id || this.claimId
            || state.playback_generation !== this.stream.playback_generation) {
          throw new Error('Playback claim identity mismatch')
        }
        this.claimId = state.claim_id
        this.fence(state.playback_generation)
      }
    } else if (type === 'audio_chunk') {
      const chunk = meta.parse(payload)
      if (!this.stream || !this.claimId || this.pending || this.terminal
          || (chunk.sample_count === 0 && (!chunk.is_last || this.nextSeq === 0))
          || chunk.audio_stream_id !== this.stream.audio_stream_id || chunk.chunk_seq !== this.nextSeq
          || chunk.sample_start !== this.nextSample || !Number.isSafeInteger(chunk.sample_start + chunk.sample_count)
          || chunk.payload_bytes !== chunk.sample_count * this.stream.channels * 2) {
        throw new Error('Invalid playback chunk metadata')
      }
      this.pending = chunk
    }
  }

  private receivePcm(data: RawData): void {
    const { stream, pending: chunk, claimId } = this
    if (!stream || !chunk || !claimId || !Buffer.isBuffer(data)
        || data.length !== HEADER_BYTES + chunk.payload_bytes || data.toString('ascii', 0, 4) !== 'NOLA'
        || data[4] !== 1 || data[5] !== 2 || data.readUInt16LE(6) !== HEADER_BYTES
        || data.readUInt32LE(8) !== stream.stream_handle || data.readUInt32LE(12) !== stream.playback_generation
        || data.readBigUInt64LE(16) !== BigInt(chunk.chunk_seq) || data.readBigUInt64LE(24) !== BigInt(chunk.sample_start)
        || data.readUInt32LE(32) !== chunk.sample_count || data.readUInt32LE(36) !== chunk.payload_bytes) {
      throw new Error('Playback PCM does not match metadata')
    }
    this.pending = undefined
    this.nextSeq += 1
    this.nextSample += chunk.sample_count
    this.terminal = chunk.is_last
    if (stream.playback_generation !== this.generation) return
    this.callbacks.onChunk({
      claimId, generation: stream.playback_generation, audioStreamId: stream.audio_stream_id,
      chunkSeq: chunk.chunk_seq, sampleStart: chunk.sample_start, sampleRate: stream.sample_rate,
      channels: stream.channels, pcm: Uint8Array.from(data.subarray(HEADER_BYTES)).buffer, isLast: chunk.is_last,
    })
  }
}
