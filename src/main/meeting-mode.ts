import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { meetingAudioTestRequestSchema, type MeetingAudioTestRequest, type MeetingAudioTestResult, type MeetingModeSettings, type MeetingModeSnapshot } from '../shared/meeting-mode'
import type { MappedBackendSession } from './backend-session'
import type { BackendSupervisor } from './backend-supervisor'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { backendError, backendErrorCode } from './backend-error'

type MeetingError = NonNullable<MeetingModeSnapshot['error']>
type MeetingBackend = Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader'> & {
  readonly ready: unknown
  once(event: 'exit', listener: () => void): void
  off(event: 'exit', listener: () => void): void
}
type PreparedMeeting = {
  backend: MeetingBackend
  uplink?: MappedBackendSession
  downlink?: MappedBackendSession
}

const meetingError = backendError.extend({
  safe_details: z.object({ direction: z.enum(['uplink', 'downlink']).optional() }).optional(),
}).transform(error => ({
  key: error.message_key,
  code: backendErrorCode(error),
  direction: error.safe_details?.direction,
  correlationId: error.correlation_id || undefined,
}))
const routeTelemetry = z.object({
  input_peak: z.number().finite().min(0).max(1),
  input_age_ms: z.number().finite().nonnegative().nullable(),
  source_text: z.string().optional(),
  translated_text: z.string().optional(),
  playback: z.enum(['idle', 'playing', 'finished']),
}).transform(value => ({
  inputPeak: value.input_peak, inputAgeMs: value.input_age_ms,
  sourceText: value.source_text, translatedText: value.translated_text, playback: value.playback,
}))
const backendSnapshot = z.object({
  meeting_id: z.string(),
  state: z.enum(['preparing', 'running', 'failed', 'closed']),
  passthrough_active: z.boolean(),
  paused: z.boolean().optional(),
  last_error: meetingError.nullish(),
  telemetry: z.object({ uplink: routeTelemetry.optional(), downlink: routeTelemetry.optional() }).optional(),
  segments: z.array(z.object({
    segmentId: z.string(), direction: z.enum(['uplink', 'downlink']), revision: z.number().int().nonnegative(),
    startedAtMs: z.number().finite().nonnegative(), sourceText: z.string(), sourceLanguage: z.string().optional(), isFinal: z.boolean(),
    speakerId: z.string().optional(), speakerNumber: z.number().int().positive().optional(), speakerMetadataRevision: z.number().optional(),
    translations: z.array(z.object({ targetLanguage: z.string(), text: z.string().optional(), provider: z.string(), state: z.enum(['pending', 'complete', 'failed']) })),
  })).optional(),
})
const audioTestResult = z.object({
  kind: z.enum(['microphone', 'headphones', 'cable', 'application']),
  has_signal: z.boolean(),
  peak: z.number().finite().min(0).max(1),
  playback_sent: z.boolean(),
  correlation: z.number().finite().min(-1).max(1).optional(),
})

export class MeetingModeError extends Error {
  constructor(readonly detail: MeetingError) {
    super(detail.key)
  }
}

export class MeetingMode {
  private current: MeetingModeSnapshot = { state: 'idle', passthroughActive: false }
  private lease?: FeatureLease
  private active?: { backend: MeetingBackend; id: string; resources: Set<string> }
  private starting?: Promise<MeetingModeSnapshot>
  private abortStart?: AbortController
  private stopping?: Promise<MeetingModeSnapshot>
  private poll?: NodeJS.Timeout
  private testing?: Promise<MeetingAudioTestResult>
  private abortTest?: AbortController

  constructor(
    private readonly activity: FeatureActivity,
    private readonly prepare: (settings: MeetingModeSettings) => Promise<PreparedMeeting>,
    private readonly changed: (snapshot: MeetingModeSnapshot) => void,
    private readonly prepareAudioTest?: () => Promise<MeetingBackend>,
  ) {}

  snapshot(): MeetingModeSnapshot { return this.current }
  usesResource(id: string): boolean { return this.active?.resources.has(id) ?? false }

  start(settings: MeetingModeSettings): Promise<MeetingModeSnapshot> {
    if (this.testing) return Promise.resolve({ ...this.current, error: { key: 'meeting.busy' } })
    if (this.starting || this.active || this.stopping) return Promise.resolve(this.current)
    this.lease = this.activity.acquire('meeting', async () => {
      const result = await this.stop()
      if (this.active) throw new MeetingModeError(result.error ?? { key: 'meeting.stopFailed' })
    })
    this.publish({ state: 'starting', passthroughActive: false })
    const operation = this.startGroup(settings).finally(() => { this.starting = undefined })
    this.starting = operation
    return operation
  }

  stop(): Promise<MeetingModeSnapshot> {
    if (this.testing) return this.cancelAudioTest().then(() => this.current)
    if (this.stopping) return this.stopping
    const operation = this.stopGroup().finally(() => { this.stopping = undefined })
    this.stopping = operation
    return operation
  }

  async setPaused(paused: boolean): Promise<MeetingModeSnapshot> {
    if (!this.active || this.current.state !== 'running') return this.current
    try {
      const result = await this.request('PATCH', { paused })
      return this.publish({ ...this.current, paused: result.paused, telemetry: result.telemetry, segments: result.segments })
    } catch (error) {
      return this.publish({ ...this.current, error: this.detail(error, 'meeting.pipelineFailed') })
    }
  }

  async cancelAudioTest(): Promise<void> {
    this.abortTest?.abort()
    await this.testing
  }

  testAudio(value: MeetingAudioTestRequest): Promise<MeetingAudioTestResult> {
    const request = meetingAudioTestRequestSchema.parse(value)
    const failed = (error: MeetingError): MeetingAudioTestResult => ({ kind: request.kind, hasSignal: false, peak: 0, playbackSent: false, error })
    if (this.testing || this.starting || this.active || this.stopping) return Promise.resolve(failed({ key: 'meeting.busy' }))
    let lease: FeatureLease
    try { lease = this.activity.acquire('meeting', async () => { await this.cancelAudioTest() }) }
    catch { return Promise.resolve(failed({ key: 'meeting.busy' })) }
    const abort = new AbortController()
    this.abortTest = abort
    const operation = (async (): Promise<MeetingAudioTestResult> => {
      try {
        const backend = await this.prepareAudioTest?.()
        abort.signal.throwIfAborted()
        if (!backend?.ready) throw new MeetingModeError({ key: 'meeting.backendUnavailable' })
        lease.running()
        const response = await fetch(new URL('/api/v2/meetings/audio-test', backend.baseUrl), {
          method: 'POST', headers: { ...backend.authorizationHeader(), 'content-type': 'application/json' },
          body: JSON.stringify({ kind: request.kind, device_id: request.deviceId, playback_device_id: request.playbackDeviceId, recording_device_id: request.recordingDeviceId }), signal: AbortSignal.any([AbortSignal.timeout(15_000), abort.signal]),
        })
        const json: unknown = await response.json()
        if (!response.ok) throw new MeetingModeError(z.object({ error: meetingError }).safeParse(json).data?.error ?? { key: 'meeting.audioTestFailed' })
        const result = audioTestResult.parse(json)
        if (result.kind !== request.kind) throw new MeetingModeError({ key: 'meeting.audioTestFailed' })
        return { kind: result.kind, hasSignal: result.has_signal, peak: result.peak, playbackSent: result.playback_sent, correlation: result.correlation }
      } catch (error) {
        return failed(this.detail(error, 'meeting.audioTestFailed'))
      } finally {
        if (this.abortTest === abort) this.abortTest = undefined
        lease.release()
      }
    })().finally(() => { this.testing = undefined })
    this.testing = operation
    return operation
  }

  private async startGroup(settings: MeetingModeSettings): Promise<MeetingModeSnapshot> {
    try {
      const { backend, uplink, downlink } = await this.prepare(settings)
      if (this.stopping) {
        this.release()
        return this.publish({ state: 'idle', passthroughActive: false, meetingId: this.current.meetingId, segments: this.current.segments })
      }
      const id = randomUUID()
      const resources = new Set([uplink, downlink].filter((lane): lane is MappedBackendSession => !!lane).flatMap(({ config: { pipeline } }) =>
        pipeline.kind === 'cascade' ? [pipeline.asr_model, pipeline.translation_model, pipeline.fallback_translation_model, pipeline.tts_model].filter((item): item is string => !!item) : []))
      this.active = { backend, id, resources }
      backend.once('exit', this.backendLost)
      this.abortStart = new AbortController()
      const result = await this.request('POST', {
        command_id: id, uplink: uplink?.config, downlink: downlink?.config,
        uplink_output_id: settings.uplinkOutputId, downlink_output_id: settings.headphonesId,
        duck_volume: settings.duckVolume / 100, passthrough_key: settings.passthroughKey,
      }, uplink?.headers ?? downlink?.headers)
      if (this.stopping) return this.current
      if (this.active?.id !== id) throw new MeetingModeError({ key: 'meeting.backendUnavailable' })
      if (result.state !== 'running') throw new MeetingModeError(result.last_error ?? { key: 'meeting.startFailed' })
      this.lease?.running()
      this.schedulePoll()
      return this.publish({ state: 'running', passthroughActive: result.passthrough_active, telemetry: result.telemetry, meetingId: result.meeting_id, segments: result.segments, paused: result.paused })
    } catch (error) {
      try {
        await this.deleteGroup()
      } catch (cleanupError) {
        console.error('meeting startup cleanup failed', cleanupError)
        if (this.active) {
          this.lease?.running()
          this.schedulePoll()
          return this.publish({ ...this.current, telemetry: undefined, state: 'unknown', passthroughActive: false, error: { key: 'meeting.stopFailed' } })
        }
      }
      this.release()
      if (this.stopping) return this.current
      return this.failure(error, 'meeting.startFailed')
    } finally {
      this.abortStart = undefined
    }
  }

  private async stopGroup(): Promise<MeetingModeSnapshot> {
    if (!this.starting && !this.active) return this.current
    this.publish({ ...this.current, state: 'stopping', passthroughActive: false })
    this.abortStart?.abort()
    await this.starting
    try {
      await this.deleteGroup()
      this.release()
      return this.publish({ state: 'idle', passthroughActive: false, meetingId: this.current.meetingId, segments: this.current.segments })
    } catch (error) {
      if (!this.active) return this.current
      return this.publish({ ...this.current, telemetry: undefined, state: 'unknown', passthroughActive: false, error: this.detail(error, 'meeting.stopFailed') })
    }
  }

  private async deleteGroup(): Promise<void> {
    if (!this.active) return
    try {
      const result = await this.request('DELETE')
      this.current = { ...this.current, segments: result.segments ?? this.current.segments }
    }
    catch (error) {
      if (!(error instanceof MeetingModeError && error.detail.key === 'meeting.notFound')) throw error
    }
  }

  private schedulePoll(): void {
    clearTimeout(this.poll)
    this.poll = setTimeout(() => {
      const active = this.active
      if (!active) return
      void this.request('GET').then(result => {
        if (this.active !== active || this.stopping) return
        if (result.state === 'preparing') return
        if (result.state !== 'running') {
          this.release()
          if (result.last_error) this.publish({ ...this.current, state: 'failed', passthroughActive: false, segments: result.segments ?? this.current.segments, error: result.last_error })
          else this.publish({ ...this.current, state: 'idle', passthroughActive: false, segments: result.segments ?? this.current.segments })
          return
        }
        if (this.current.state !== 'running' || result.passthrough_active !== this.current.passthroughActive
            || JSON.stringify(result.telemetry) !== JSON.stringify(this.current.telemetry)
            || result.paused !== this.current.paused
            || JSON.stringify(result.segments) !== JSON.stringify(this.current.segments)) {
          if (this.current.state !== 'running') this.lease?.running()
          this.publish({ state: 'running', passthroughActive: result.passthrough_active, telemetry: result.telemetry, meetingId: result.meeting_id, segments: result.segments, paused: result.paused })
        }
      }).catch(error => {
        if (this.active !== active || this.stopping) return
        if (error instanceof MeetingModeError && error.detail.key === 'meeting.notFound') this.backendLost()
        else {
          console.error('meeting status request failed', error)
          this.publish({ ...this.current, telemetry: undefined, state: 'unknown', passthroughActive: false, error: { key: 'meeting.backendUnavailable' } })
        }
      }).finally(() => { if (this.active === active) this.schedulePoll() })
    }, 500)
    this.poll.unref()
  }

  private readonly backendLost = () => {
    this.release()
    this.publish({ ...this.current, state: 'failed', passthroughActive: false, error: { key: 'meeting.backendUnavailable' } })
  }

  private release(): void {
    clearTimeout(this.poll)
    this.active?.backend.off('exit', this.backendLost)
    this.active = undefined
    this.lease?.release()
    this.lease = undefined
  }

  private detail(error: unknown, fallback: string): MeetingError {
    if (error instanceof MeetingModeError) return error.detail
    console.error(fallback, error)
    return { key: fallback }
  }

  private failure(error: unknown, fallback: string): MeetingModeSnapshot {
    return this.publish({ state: 'failed', passthroughActive: false, error: this.detail(error, fallback) })
  }

  private publish(snapshot: MeetingModeSnapshot): MeetingModeSnapshot {
    this.current = snapshot
    this.changed(snapshot)
    return snapshot
  }

  private async request(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', body?: object, headers?: Record<string, string>) {
    const active = this.active
    if (!active?.backend.ready) throw new MeetingModeError({ key: 'meeting.backendUnavailable' })
    const path = method === 'POST' ? '/api/v2/meetings' : `/api/v2/meetings/${active.id}`
    const timeout = AbortSignal.timeout(method === 'POST' ? 180_000 : method === 'DELETE' ? 60_000 : 5000)
    const response = await fetch(new URL(path, active.backend.baseUrl), {
      method, headers: { ...active.backend.authorizationHeader(), ...headers, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: method === 'POST' && this.abortStart ? AbortSignal.any([timeout, this.abortStart.signal]) : timeout,
    })
    const json: unknown = await response.json()
    if (!response.ok) {
      const detail = z.object({ error: meetingError }).safeParse(json).data?.error
      throw new MeetingModeError(detail ?? { key: method === 'DELETE' ? 'meeting.stopFailed' : 'meeting.startFailed' })
    }
    return backendSnapshot.parse(json)
  }
}
