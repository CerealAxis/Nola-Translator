import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'

import { BackendPlayback } from '../../../src/main/backend-playback'

const serverInstanceId = '9d31857f-3438-4555-b995-b444f6104b20'
const sessionId = 'session'
const identity = { schema_version: 2, server_instance_id: serverInstanceId, session_id: sessionId }
const header = { audio_stream_id: 'stream', stream_handle: 1, playback_generation: 0, sample_rate: 24000, channels: 1 }

function event(socket: WebSocket, event_type: string, payload: object): void {
  socket.send(JSON.stringify({ ...identity, event_type, payload }))
}

function sendChunk(socket: WebSocket, ownerId: string, binaryKind = 2, isLast = true): void {
  event(socket, 'audio_stream_opened', header)
  event(socket, 'playback_state', {
    state: 'claimed', audio_stream_id: 'stream', claim_id: 'claim', owner_id: ownerId, playback_generation: 0,
  })
  event(socket, 'audio_chunk', {
    audio_stream_id: 'stream', chunk_seq: 0, sample_start: 0, sample_count: 1, payload_bytes: 2, is_last: isLast,
  })
  const pcm = Buffer.alloc(42)
  pcm.write('NOLA')
  pcm[4] = 1
  pcm[5] = binaryKind
  pcm.writeUInt16LE(40, 6)
  pcm.writeUInt32LE(1, 8)
  pcm.writeUInt32LE(1, 32)
  pcm.writeUInt32LE(2, 36)
  pcm.writeInt16LE(42, 40)
  socket.send(pcm)
}

describe('backend playback', () => {
  let server: WebSocketServer | undefined
  let playback: BackendPlayback | undefined

  afterEach(async () => {
    playback?.close()
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  })

  async function connect(grantOwner = true) {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server port')
    const connected = once(server, 'connection')
    const callbacks = { onChunk: vi.fn(), onFence: vi.fn() }
    playback = new BackendPlayback({
      baseUrl: `http://127.0.0.1:${address.port}`,
      authorizationHeader: () => ({ Authorization: 'Bearer test' }),
      instanceId: serverInstanceId,
    }, sessionId, callbacks)
    const [socket, request] = await connected
    expect(request.url).toBe('/api/v2/sessions/session/audio')
    expect(request.headers.authorization).toBe('Bearer test')
    const [hello] = await once(socket, 'message')
    const { consumer_id: ownerId, ...fields } = JSON.parse(hello.toString())
    expect(fields).toEqual({
      frame: 'hello', schema_version: 2, outputs: ['audio'], request_playback_owner: true,
    })
    socket.send(JSON.stringify({
      ...identity, frame: 'hello_ack', consumer_id: ownerId, playback_owner_id: grantOwner ? ownerId : null,
      snapshot: { playback_generation: 0 },
    }))
    return { playback, socket, ownerId, ...callbacks }
  }

  it('matches PCM metadata and sends ACKs with the granted owner, then fences on a session interruption', async () => {
    const { playback, socket, ownerId, onChunk, onFence } = await connect()
    await playback.ready
    sendChunk(socket, ownerId)
    await vi.waitFor(() => expect(onChunk).toHaveBeenCalledOnce())
    expect(onChunk).toHaveBeenCalledWith({
      claimId: 'claim', generation: 0, audioStreamId: 'stream', chunkSeq: 0, sampleStart: 0,
      sampleRate: 24000, channels: 1, pcm: Uint8Array.of(42, 0).buffer, isLast: true,
    })
    const ack = {
      claimId: 'claim', generation: 0, audioStreamId: 'stream', chunkSeq: 0,
      state: 'finished' as const, playedSampleOffset: 1,
    }
    const reply = once(socket, 'message')
    playback.acknowledge({ ...ack, claimId: 'stale' })
    playback.acknowledge(ack)
    const [message] = await reply
    expect(JSON.parse(message.toString())).toEqual({
      frame: 'playback_ack', owner_id: ownerId, claim_id: 'claim', playback_generation: 0,
      audio_stream_id: 'stream', chunk_seq: 0, state: 'finished', played_sample_offset: 1,
    })
    event(socket, 'playback_state', { state: 'interrupted', playback_generation: 1 })
    await vi.waitFor(() => expect(onFence).toHaveBeenCalledWith(1))
    playback.fence(2)
    expect(onFence).toHaveBeenLastCalledWith(2)
  })

  it('drops in-flight PCM after a local fence and closes on a malformed PCM frame', async () => {
    const { playback, socket, ownerId, onChunk, onFence } = await connect()
    await playback.ready
    playback.fence(1)
    sendChunk(socket, ownerId)
    event(socket, 'playback_state', { state: 'cancelled', playback_generation: 2 })
    await vi.waitFor(() => expect(onFence).toHaveBeenLastCalledWith(2))
    const disconnected = once(socket, 'close')
    sendChunk(socket, ownerId, 1)
    await disconnected
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('rejects readiness without a matching ownership grant', async () => {
    const { playback } = await connect(false)
    await expect(playback.ready).rejects.toThrow('Playback socket closed')
  })

  it('accepts a native S2S terminal marker after nonempty PCM', async () => {
    const { playback, socket, ownerId, onChunk } = await connect()
    await playback.ready
    sendChunk(socket, ownerId, 2, false)
    event(socket, 'audio_chunk', {
      audio_stream_id: 'stream', chunk_seq: 1, sample_start: 1, sample_count: 0, payload_bytes: 0, is_last: true,
    })
    const terminal = Buffer.alloc(40)
    terminal.write('NOLA')
    terminal[4] = 1
    terminal[5] = 2
    terminal.writeUInt16LE(40, 6)
    terminal.writeUInt32LE(1, 8)
    terminal.writeBigUInt64LE(1n, 16)
    terminal.writeBigUInt64LE(1n, 24)
    socket.send(terminal)
    await vi.waitFor(() => expect(onChunk).toHaveBeenCalledTimes(2))
    expect(onChunk).toHaveBeenLastCalledWith(expect.objectContaining({
      chunkSeq: 1, sampleStart: 1, isLast: true, pcm: new ArrayBuffer(0),
    }))
  })
})
