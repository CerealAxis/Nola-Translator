import { describe, expect, it, vi } from 'vitest'
import { RealtimePlaybackOwner, type PlaybackAck } from '../../../src/renderer/bridge/realtime-playback'

function fixture(observe?: ConstructorParameters<typeof RealtimePlaybackOwner>[2]) {
  const acknowledgements: PlaybackAck[] = []
  const source = { onended: null as (() => void) | null, connect: vi.fn(),
    disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  const samples = new Float32Array(2)
  const context = {
    currentTime: 1, state: 'running', destination: {},
    baseLatency: 0.01, outputLatency: 0.02,
    resume: vi.fn(), close: vi.fn(), createBufferSource: () => source,
    createBuffer: () => ({ getChannelData: () => samples }),
  } as unknown as AudioContext
  const owner = new RealtimePlaybackOwner((ack) => { acknowledgements.push(ack) }, context, observe)
  const chunk = { claimId: 'claim', generation: 0, audioStreamId: 'stream', chunkSeq: 0,
    sampleStart: 0, sampleRate: 24000, channels: 1, pcm: new ArrayBuffer(4), isLast: true }
  return { acknowledgements, chunk, owner, source }
}

describe('realtime playback owner', () => {
  it('observes waveform peaks at the estimated output-device time', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const observe = vi.fn()
    const { chunk, owner } = fixture(observe)
    const pcm = new DataView(chunk.pcm)
    pcm.setInt16(0, -16384, true)
    pcm.setInt16(2, 8192, true)
    try {
      await owner.accept(chunk)
      expect(observe).toHaveBeenCalledExactlyOnceWith('stream', 0, 1_030, [{ at: 1_030, min: -0.5, max: 0.25 }])
    } finally {
      now.mockRestore()
      await owner.close()
    }
  })
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
