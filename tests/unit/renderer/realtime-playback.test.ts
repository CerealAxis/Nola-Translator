import { describe, expect, it, vi } from 'vitest'
import { RealtimePlaybackOwner, type PlaybackAck } from '../../../src/renderer/bridge/realtime-playback'

function fixture() {
  const acknowledgements: PlaybackAck[] = []
  const source = { onended: null as (() => void) | null, connect: vi.fn(),
    disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  const context = {
    currentTime: 1, state: 'running', destination: {},
    resume: vi.fn(), close: vi.fn(), createBufferSource: () => source,
    createBuffer: () => ({ getChannelData: () => new Float32Array(2) }),
  } as unknown as AudioContext
  const owner = new RealtimePlaybackOwner((ack) => { acknowledgements.push(ack) }, context)
  const chunk = { claimId: 'claim', generation: 0, audioStreamId: 'stream', chunkSeq: 0,
    sampleStart: 0, sampleRate: 24000, channels: 1, pcm: new ArrayBuffer(4), isLast: true }
  return { acknowledgements, chunk, owner, source }
}

describe('realtime playback owner', () => {
  it('reports finished only after device drain and never starts the same claim twice', async () => {
    const { acknowledgements, chunk, owner, source } = fixture()
    await owner.accept(chunk)
    expect(acknowledgements.map(ack => ack.state)).toEqual(['started'])
    source.onended?.()
    await owner.accept(chunk)
    expect(source.start).toHaveBeenCalledTimes(1)
    expect(acknowledgements.at(-1)).toMatchObject({ state: 'finished', playedSampleOffset: 2 })
    await owner.close()
  })

  it('stops a playing claim and rejects delayed chunks from the fenced generation', async () => {
    const { acknowledgements, chunk, owner, source } = fixture()
    await owner.accept(chunk)
    const delayed = source.onended
    owner.stop(1)
    delayed?.()
    await owner.accept(chunk)
    expect(source.stop).toHaveBeenCalledTimes(1)
    expect(source.start).toHaveBeenCalledTimes(1)
    expect(acknowledgements.map(ack => ack.state)).toEqual(['started', 'interrupted'])
    await owner.close()
  })
})
