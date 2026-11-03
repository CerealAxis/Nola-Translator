import type { LatencyWavePoint } from '../../shared/latency'

export interface PlaybackChunk {
  claimId: string
  generation: number
  audioStreamId: string
  chunkSeq: number
  sampleStart: number
  sampleRate: number
  channels: number
  pcm: ArrayBuffer
  isLast: boolean
}

export interface PlaybackAck {
  claimId: string
  generation: number
  audioStreamId: string
  chunkSeq: number
  state: 'started' | 'finished' | 'interrupted' | 'unknown'
  playedSampleOffset: number
}

type PlaybackContext = Pick<AudioContext,
  'currentTime' | 'state' | 'destination' | 'resume' | 'createBuffer' | 'createBufferSource' | 'close'
> & Partial<Pick<AudioContext, 'getOutputTimestamp' | 'outputLatency' | 'baseLatency'>>
  & { setSinkId?: (sinkId: string) => Promise<void> }

interface ScheduledChunk {
  source: AudioBufferSourceNode
  sampleEnd: number
  ended: boolean
}

interface ActiveClaim {
  claimId: string
  generation: number
  audioStreamId: string
  sampleRate: number
  channels: number
  nextSeq: number
  nextSample: number
  nextTime: number
  playedSeq: number
  playedSamples: number
  terminal: boolean
  nodes: Map<number, ScheduledChunk>
}

const MAX_CHUNK_BYTES = 2 * 1024 * 1024

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128
}

function validCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export class RealtimePlaybackOwner {
  private generation = 0
  private active?: ActiveClaim
  private readonly settled = new Set<string>()
  private closed = false

  constructor(
    private readonly acknowledge: (ack: PlaybackAck) => void | Promise<void>,
    private readonly context: PlaybackContext = new AudioContext(),
    private readonly observeOutput?: (streamId: string, generation: number, firstAt: number | undefined, points: LatencyWavePoint[]) => void,
  ) {}

  async setSinkId(sinkId: string): Promise<void> {
    if (this.closed) throw new Error('Playback owner is closed')
    if (!this.context.setSinkId) throw new Error('Audio output selection is unavailable')
    await this.context.setSinkId(sinkId)
  }

  async accept(chunk: PlaybackChunk): Promise<void> {
    this.validate(chunk)
    if (this.closed || chunk.generation < this.generation) return
    if (chunk.generation > this.generation) this.stop(chunk.generation)
    if (this.settled.has(chunk.claimId)) return
    if (this.context.state === 'suspended') await this.context.resume()
    if (this.closed || chunk.generation !== this.generation || this.settled.has(chunk.claimId)) return

    const claim = this.active ?? {
      claimId: chunk.claimId, generation: chunk.generation, audioStreamId: chunk.audioStreamId,
      sampleRate: chunk.sampleRate, channels: chunk.channels, nextSeq: 0, nextSample: 0,
      nextTime: this.context.currentTime, playedSeq: -1, playedSamples: 0, terminal: false,
      nodes: new Map<number, ScheduledChunk>(),
    }
    if (claim.claimId !== chunk.claimId || claim.audioStreamId !== chunk.audioStreamId
        || claim.sampleRate !== chunk.sampleRate || claim.channels !== chunk.channels) {
      throw new Error('Playback claim changed during a stream')
    }
    if (chunk.chunkSeq < claim.nextSeq) return
    if (claim.terminal || chunk.chunkSeq !== claim.nextSeq || chunk.sampleStart !== claim.nextSample) {
      throw new Error('Playback chunk is out of sequence')
    }

    const frames = chunk.pcm.byteLength / (2 * chunk.channels)
    const sampleEnd = chunk.sampleStart + frames
    if (!validCounter(sampleEnd) || (!frames && claim.nextSeq === 0)) {
      throw new Error('Invalid playback sample range')
    }
    this.active = claim
    claim.nextSeq += 1
    claim.nextSample = sampleEnd
    claim.terminal = chunk.isLast
    if (!frames) {
      this.finishIfDrained(claim)
      return
    }

    try {
      const buffer = this.context.createBuffer(chunk.channels, frames, chunk.sampleRate)
      const pcm = new DataView(chunk.pcm)
      for (let channel = 0; channel < chunk.channels; channel += 1) {
        const output = buffer.getChannelData(channel)
        for (let sample = 0; sample < frames; sample += 1) {
          output[sample] = pcm.getInt16(2 * (sample * chunk.channels + channel), true) / 32768
        }
      }
      const source = this.context.createBufferSource()
      source.buffer = buffer
      source.connect(this.context.destination)
      const scheduled = { source, sampleEnd, ended: false }
      claim.nodes.set(chunk.chunkSeq, scheduled)
      source.onended = () => {
        source.disconnect()
        if (this.active !== claim) return
        scheduled.ended = true
        this.drainEnded(claim)
      }
      const startsAt = Math.max(this.context.currentTime, claim.nextTime)
      source.start(startsAt)
      claim.nextTime = startsAt + frames / chunk.sampleRate
      if (chunk.chunkSeq === 0) this.report(claim, 'started')
      if (this.observeOutput) {
        try { this.measureOutput(chunk, buffer, startsAt) } catch { /* Diagnostics cannot interrupt playback. */ }
      }
    } catch (error) {
      this.cancelActive('unknown')
      throw error
    }
  }

  private measureOutput(chunk: PlaybackChunk, buffer: AudioBuffer, startsAt: number): void {
    const clock = this.context.getOutputTimestamp?.()
    const start = clock && clock.performanceTime && clock.contextTime !== undefined
      ? performance.timeOrigin + clock.performanceTime + (startsAt - clock.contextTime) * 1000
      : Date.now() + (Math.max(0, startsAt - this.context.currentTime)
        + (this.context.baseLatency ?? 0) + (this.context.outputLatency ?? 0)) * 1000
    const channels = Array.from({ length: chunk.channels }, (_, index) => buffer.getChannelData(index))
    const frames = channels[0].length
    const step = Math.max(Math.round(chunk.sampleRate / 10), Math.ceil(frames / 128))
    const points: LatencyWavePoint[] = []
    for (let from = 0; from < frames; from += step) {
      let min = 1
      let max = -1
      for (let i = from; i < Math.min(from + step, frames); i++) {
        for (const channel of channels) {
          min = Math.min(min, channel[i])
          max = Math.max(max, channel[i])
        }
      }
      points.push({ at: start + from / chunk.sampleRate * 1000, min, max })
    }
    this.observeOutput?.(chunk.audioStreamId, chunk.generation, chunk.chunkSeq === 0 ? start : undefined, points)
  }

  stop(nextGeneration: number): void {
    if (!validCounter(nextGeneration)) throw new Error('Invalid playback generation')
    if (nextGeneration < this.generation) return
    this.cancelActive('interrupted')
    if (nextGeneration > this.generation) {
      this.generation = nextGeneration
      this.settled.clear()
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.cancelActive('unknown')
    await this.context.close()
  }

  private validate(chunk: PlaybackChunk): void {
    if (!validId(chunk.claimId) || !validId(chunk.audioStreamId) || !validCounter(chunk.generation)
        || !validCounter(chunk.chunkSeq) || !validCounter(chunk.sampleStart)
        || !Number.isInteger(chunk.sampleRate) || chunk.sampleRate < 8000 || chunk.sampleRate > 96000
        || (chunk.channels !== 1 && chunk.channels !== 2) || typeof chunk.isLast !== 'boolean'
        || !(chunk.pcm instanceof ArrayBuffer) || chunk.pcm.byteLength > MAX_CHUNK_BYTES
        || chunk.pcm.byteLength % (2 * chunk.channels) !== 0 || (!chunk.isLast && !chunk.pcm.byteLength)) {
      throw new Error('Invalid playback chunk')
    }
  }

  private drainEnded(claim: ActiveClaim): void {
    let next = claim.nodes.get(claim.playedSeq + 1)
    while (next?.ended) {
      claim.playedSeq += 1
      claim.playedSamples = next.sampleEnd
      claim.nodes.delete(claim.playedSeq)
      next = claim.nodes.get(claim.playedSeq + 1)
    }
    this.finishIfDrained(claim)
  }

  private finishIfDrained(claim: ActiveClaim): void {
    if (!claim.terminal || claim.nodes.size || claim.playedSamples !== claim.nextSample) return
    this.active = undefined
    this.settled.add(claim.claimId)
    claim.playedSeq = claim.nextSeq - 1
    this.report(claim, 'finished')
  }

  private cancelActive(state: 'interrupted' | 'unknown'): void {
    const claim = this.active
    if (!claim) return
    this.active = undefined
    this.settled.add(claim.claimId)
    for (const node of claim.nodes.values()) {
      node.source.onended = null
      if (!node.ended) {
        node.source.stop()
        node.source.disconnect()
      }
    }
    this.report(claim, state)
  }

  private report(claim: ActiveClaim, state: PlaybackAck['state']): void {
    const ack = {
      claimId: claim.claimId, generation: claim.generation, audioStreamId: claim.audioStreamId,
      chunkSeq: claim.playedSeq, playedSampleOffset: claim.playedSamples, state,
    }
    // A failed transport cannot turn locally consumed audio into a replayable claim.
    void Promise.resolve().then(() => this.acknowledge(ack)).catch(() => {})
  }
}
