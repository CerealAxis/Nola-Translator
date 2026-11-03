import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'

import { BackendBrowserInput } from '../../../src/main/backend-browser-input'

const instanceId = '7d31857f-3438-4555-b995-b444f6104b20'
const sessionId = '8d31857f-3438-4555-b995-b444f6104b20'

describe('backend browser audio input', () => {
  let server: WebSocketServer | undefined
  let client: BackendBrowserInput | undefined

  afterEach(async () => {
    client?.close()
    if (server) await new Promise<void>(resolve => server?.close(() => resolve()))
  })

  async function startServer() {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server port')
    client = new BackendBrowserInput({
      baseUrl: 'http://127.0.0.1:' + address.port, instanceId,
      authorizationHeader: () => ({ Authorization: 'Bearer private' }),
    }, sessionId)
    return client
  }

  async function negotiate(input: BackendBrowserInput, epoch: number, sampleRate: number) {
    if (!server) throw new Error('No test server')
    const connected = once(server, 'connection')
    const opening = input.open(epoch, sampleRate)
    const [socket, request] = await connected
    expect(request.url).toBe(`/api/v2/sessions/${sessionId}/input`)
    expect(request.headers.authorization).toBe('Bearer private')
    const [message] = await once(socket, 'message')
    const { stream_handle: handle, ...fields } = JSON.parse(message.toString())
    expect(fields).toEqual({ frame: 'stream_open', epoch, sample_rate: sampleRate, channels: 1, encoding: 'pcm_s16le' })
    socket.send(JSON.stringify({ frame: 'stream_opened', server_instance_id: instanceId, stream_handle: handle, epoch }))
    await opening
    const ack = (sequence: number, throughSample: number) => socket.send(JSON.stringify({
      frame: 'audio_accepted', stream_handle: handle, epoch, through_chunk_seq: sequence, through_sample: throughSample,
    }))
    return { socket, handle, ack }
  }

  it('packs exact PCM spans, waits for the matching ACK, then sends EOF', async () => {
    const input = await startServer()
    const { socket, handle, ack } = await negotiate(input, 3, 44100)
    for (const [sequence, start, size] of [[0, 0, 3], [1, 3, 4]]) {
      const incoming = once(socket, 'message')
      const pcm = Buffer.alloc(size * 2, sequence + 1)
      const pushed = input.push(pcm)
      const [data, binary] = await incoming
      expect(binary).toBe(true)
      expect(data.toString('ascii', 0, 4)).toBe('NOLA')
      expect([data[4], data[5], data.readUInt16LE(6)]).toEqual([1, 1, 40])
      expect([data.readUInt32LE(8), data.readUInt32LE(12)]).toEqual([handle, 3])
      expect([data.readBigUInt64LE(16), data.readBigUInt64LE(24)]).toEqual([BigInt(sequence), BigInt(start)])
      expect([data.readUInt32LE(32), data.readUInt32LE(36)]).toEqual([size, pcm.length])
      expect(data.subarray(40)).toEqual(pcm)
      await expect(input.push(pcm)).rejects.toThrow('awaiting acknowledgement')
      ack(sequence, start + size)
      await pushed
    }
    const closing = once(socket, 'message')
    await input.finish()
    const [eof] = await closing
    expect(JSON.parse(eof.toString())).toEqual({ frame: 'stream_close', stream_handle: handle, eof: true })
  })

  it('fences outstanding audio on reset and rejects mismatched ACKs in a new epoch', async () => {
    const input = await startServer()
    const first = await negotiate(input, 1, 48000)
    const incoming = once(first.socket, 'message')
    const pending = input.push(Buffer.alloc(2))
    await incoming
    const cancelled = expect(pending).rejects.toThrow('reset')
    const closing = once(first.socket, 'message')
    input.reset()
    await cancelled
    const [close] = await closing
    expect(JSON.parse(close.toString())).toEqual({ frame: 'stream_close', stream_handle: first.handle, eof: false })
    const second = await negotiate(input, 2, 48000)
    const reopened = once(second.socket, 'message')
    const next = input.push(Buffer.alloc(2))
    const [packet] = await reopened
    expect([packet.readUInt32LE(12), packet.readBigUInt64LE(16), packet.readBigUInt64LE(24)]).toEqual([2, 0n, 0n])
    const rejected = expect(next).rejects.toThrow('Invalid browser audio acknowledgement')
    second.ack(0, 2)
    await rejected
  })
})
