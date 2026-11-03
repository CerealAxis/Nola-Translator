import { z } from 'zod'
import type { SessionConfig } from '../shared/contracts'
import type { LatencyProvider, LatencySample, LatencySnapshot, LatencyWavePoint } from '../shared/latency'
import { MIMO_TTS_MODEL } from '../shared/settings'
import type { MappedBackendSession } from './backend-session'

const time = z.number().finite().nonnegative()
const amplitude = z.number().min(-1).max(1)
export const latencyWavePoint = z.object({ at: time, min: amplitude, max: amplitude })
export const captionPaint = z.object({ segmentId: z.string().min(1).max(128), kind: z.enum(['source', 'translation']), at: time })
const observation = z.object({
  kind: z.enum(['input', 'segment_boundary', 'translation_started', 'translation_ready', 'synthesis_started', 'audio_ready']),
  at_ms: time, segment_id: z.string().min(1).max(128).nullish(), audio_stream_id: z.string().min(1).max(128).nullish(),
  min: amplitude.optional(), max: amplitude.optional(), provider: z.string().max(512).nullish(),
})
const segmentEvent = z.object({ segment_id: z.string().min(1).max(128), text: z.string() })
const WAVE_MS = 16_000
const WAVE_LIMIT = 600
const ROW_LIMIT = 100

type Paint = z.infer<typeof captionPaint>
type LatencyMeta = Pick<LatencySnapshot, 'output' | 'speech' | 'route' | 'providers' | 'available'> & {
  translationProviders?: ReadonlyMap<string, LatencyProvider>
}
type Row = {
  id: string
  at: number
  boundary?: number
  source?: number
  translated?: number
  mtStart?: number
  mtReady?: number
  mtProvider?: LatencyProvider
  ttsStart?: number
  stream?: string
  paint?: number
}

function location(provider = 'local'): LatencyProvider {
  return provider === 'local' ? 'local' : 'cloud'
}

export function latencyMeta(mapped: MappedBackendSession, config: SessionConfig): LatencyMeta {
  const { pipeline, required_outputs: outputs } = mapped.config
  const speech = outputs.includes('audio')
  const translationProviders = new Map<string, LatencyProvider>()
  const mt = pipeline.kind === 'cascade' && pipeline.translation_model ? location(config.translationProvider) : undefined
  if (pipeline.kind === 'cascade') {
    if (pipeline.translation_model && mt) translationProviders.set(pipeline.translation_model, mt)
    if (pipeline.fallback_translation_model) translationProviders.set(pipeline.fallback_translation_model, location(config.fallbackTranslationProvider))
  }
  return {
    route: pipeline.kind,
    output: speech ? 'speech' : outputs.includes('translated_text') ? 'translation' : 'source',
    speech,
    providers: pipeline.kind === 'cascade' ? {
      asr: location(config.recognitionProvider), mt,
      tts: pipeline.tts_model ? pipeline.tts_model === MIMO_TTS_MODEL ? 'cloud' : 'local' : undefined,
    } : {},
    translationProviders,
  }
}

function elapsed(start: number | undefined, end: number | undefined): number | undefined {
  return start !== undefined && end !== undefined && end >= start ? Math.round(end - start) : undefined
}

export class LatencySession {
  private readonly rows = new Map<string, Row>()
  private readonly audio = new Map<string, { ready?: number; started?: number; rowId?: string }>()
  private readonly input: LatencyWavePoint[] = []
  private readonly outputWave: LatencyWavePoint[] = []
  private endedAt?: number
  private epoch = 0
  private generation = 0

  constructor(private readonly meta: LatencyMeta) {}

  backend(kind: string | undefined, payload: unknown, epoch: number, at?: number): void {
    if (this.endedAt !== undefined || epoch < this.epoch) return
    if (epoch !== this.epoch) {
      this.epoch = epoch
      for (const [id, row] of this.rows) if (this.boundaryOf(row) === undefined) this.rows.delete(id)
    }
    if (kind === 'latency_observation') {
      const parsed = observation.safeParse(payload)
      if (!parsed.success) return
      const event = parsed.data
      if (event.kind === 'input') {
        if (this.meta.speech && event.min !== undefined && event.max !== undefined && event.min <= event.max) {
          this.pushWave(this.input, [{ at: event.at_ms, min: event.min, max: event.max }])
        }
        return
      }
      const row = event.segment_id ? this.row(event.segment_id, event.at_ms) : undefined
      if (event.kind === 'segment_boundary' && row) row.boundary ??= event.at_ms
      if (event.kind === 'translation_started' && row) row.mtStart = event.at_ms
      if (event.kind === 'translation_ready' && row) {
        row.mtReady = event.at_ms
        row.mtProvider = event.provider ? this.meta.translationProviders?.get(event.provider) : undefined
      }
      if (event.kind === 'synthesis_started' && row) row.ttsStart ??= event.at_ms
      if (event.kind === 'audio_ready' && event.audio_stream_id) {
        const audio = this.stream(event.audio_stream_id)
        audio.ready ??= event.at_ms
        if (row && !row.stream) {
          row.stream = event.audio_stream_id
          audio.rowId = row.id
        }
      }
      return
    }
    if (at === undefined || (kind !== 'source_committed' && kind !== 'translated_text' && kind !== 'translation_committed')) return
    const segment = segmentEvent.safeParse(payload)
    if (!segment.success || !segment.data.text.trim()) return
    const row = this.row(segment.data.segment_id, at)
    if (kind === 'source_committed') row.source ??= at
    else row.translated ??= at
  }

  paint(event: Paint): void {
    if (this.meta.speech || this.endedAt !== undefined) return
    if (event.kind !== (this.meta.output === 'source' ? 'source' : 'translation')) return
    const row = this.row(event.segmentId, event.at)
    if (row.paint === undefined || event.at < row.paint) row.paint = event.at
  }

  output(streamId: string, generation: number, firstAt: number | undefined, points: LatencyWavePoint[]): void {
    if (!this.meta.speech || this.endedAt !== undefined || generation < this.generation) return
    if (generation > this.generation) this.fence(generation)
    if (firstAt !== undefined) this.stream(streamId).started ??= firstAt
    this.pushWave(this.outputWave, points)
  }

  fence(generation: number, now = Date.now()): void {
    if (generation <= this.generation) return
    this.generation = generation
    for (let index = this.outputWave.length - 1; index >= 0; index--) {
      if (this.outputWave[index].at > now) this.outputWave.splice(index, 1)
    }
    for (const audio of this.audio.values()) if (audio.started !== undefined && audio.started > now) audio.started = undefined
  }

  stop(now = Date.now()): void { this.endedAt ??= now }

  snapshot(now = Date.now()): LatencySnapshot {
    const clock = this.endedAt ?? now
    const samples: LatencySample[] = []
    for (const row of this.rows.values()) {
      const audio = row.stream ? this.audio.get(row.stream) : undefined
      const scheduled = audio?.started
      const started = scheduled !== undefined && scheduled <= clock ? scheduled : undefined
      const endpoint = this.meta.speech ? started : row.paint
      const boundary = this.boundaryOf(row)
      // A streamed caption may already be visible when the boundary is confirmed.
      const total = endpoint !== undefined && boundary !== undefined ? Math.max(0, Math.round(endpoint - boundary)) : null
      const asr = this.meta.route === 'cascade' ? elapsed(row.boundary, row.source) : undefined
      const mt = elapsed(row.mtStart, row.mtReady)
      const tts = elapsed(row.ttsStart, audio?.ready)
      const wait = elapsed(audio?.ready, started)
      const remote = this.meta.route === 's2s' ? elapsed(boundary, this.meta.speech ? audio?.ready : row.translated) : undefined
      if (total === null && [asr, mt, tts, wait, remote].every(value => value === undefined)) continue
      samples.push({ id: row.id, at: boundary ?? row.at, total, asr, mt, tts, wait, remote,
        ...(row.mtProvider ? { providers: { mt: row.mtProvider } } : {}) })
    }
    for (const [id, audio] of this.audio) {
      const wait = elapsed(audio.ready, audio.started !== undefined && audio.started <= clock ? audio.started : undefined)
      if (audio.rowId === undefined && wait !== undefined) samples.push({ id: `audio:${id}`, at: audio.ready!, total: null, wait })
    }
    const recentWave = (wave: LatencyWavePoint[]) => wave.filter(point => point.at >= clock - WAVE_MS && point.at <= clock)
    const { route, output, speech, providers, available } = this.meta
    return { route, output, speech, providers, available, active: this.endedAt === undefined, now: clock,
      samples: samples.sort((a, b) => a.at - b.at).slice(-60), input: recentWave(this.input), outputWave: recentWave(this.outputWave) }
  }

  private boundaryOf(row: Row): number | undefined {
    // Some cloud recognizers only confirm the boundary together with the final transcript.
    return row.boundary ?? (this.meta.route === 'cascade' && this.meta.providers.asr === 'cloud' ? row.source : undefined)
  }

  private row(id: string, at: number): Row {
    let row = this.rows.get(id)
    if (!row) {
      if (this.rows.size >= ROW_LIMIT) this.rows.delete(this.rows.keys().next().value!)
      row = { id, at }
      this.rows.set(id, row)
    }
    return row
  }

  private stream(id: string): { ready?: number; started?: number; rowId?: string } {
    let stream = this.audio.get(id)
    if (!stream) {
      if (this.audio.size >= ROW_LIMIT) this.audio.delete(this.audio.keys().next().value!)
      stream = {}
      this.audio.set(id, stream)
    }
    return stream
  }

  private pushWave(wave: LatencyWavePoint[], points: LatencyWavePoint[]): void {
    wave.push(...points)
    if (wave.length > WAVE_LIMIT) wave.splice(0, wave.length - WAVE_LIMIT)
  }
}
