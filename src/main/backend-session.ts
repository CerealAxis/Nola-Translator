import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { z } from 'zod'

import type { PlaybackAck, PlaybackChunk } from '../renderer/bridge/realtime-playback'
import type { CaptionSegment, EngineEvent, SessionConfig, Translation } from '../shared/contracts'
import { supportsRealtimeCompute } from '../shared/compute'
import { MIMO_TTS_BINDING, MIMO_TTS_MODEL, type AppSettings } from '../shared/settings'
import { INDEX_TRANSLATE_ENDPOINT } from '../shared/index-translate'
import { BackendPlayback } from './backend-playback'
import { BackendBrowserInput } from './backend-browser-input'
import type { BackendSupervisor } from './backend-supervisor'
import { vbCablePair } from '../shared/virtual-audio'
import { backendAsrHeaders, backendMtHeaders } from './backend-direct-model'
import { backendError, backendErrorCode, backendFailure, readBackendFailure } from './backend-error'

export interface BackendSessionOptions {
  output?: 'source' | 'translation' | 'speech'
  speechLanguage?: string
  outputDeviceId?: string
  s2sModel?: string
  ttsApiKey?: string
}

export interface MappedBackendSession {
  config: {
    pipeline: { kind: 'cascade'; asr_model: string; translation_model?: string; fallback_translation_model?: string; tts_model?: string; tts_voice?: string }
      | { kind: 's2s'; s2s_model: string }
    input: {
      kind: 'microphone' | 'system_audio' | 'process_audio' | 'virtual_input' | 'browser_tab'
      browser_stream_id?: string
      device_id?: string
      capture_backend: 'device' | 'windows_process_include' | 'windows_process_exclude' | 'virtual_input' | 'browser_tab'
      process_selection_id?: string
      excluded_process_tree?: number[]
    }
    source_language: string
    target_languages: string[]
    required_outputs: ('source_text' | 'translated_text' | 'audio')[]
    speech_target_language?: string
    max_segment_ms?: number
    silence_end_ms?: number
    translation_preview?: boolean
    translation_preview_interval_ms?: number
    latency_detection?: boolean
  }
  headers: Record<string, string>
  outputDeviceId?: string
  browserTimeline?: NonNullable<SessionConfig['browserTimeline']>
}

export function mapBrowserSessionConfig(
  config: SessionConfig, settings: AppSettings, enabledModelIds: ReadonlySet<string>,
  options: Pick<BackendSessionOptions, 's2sModel'> = {},
): MappedBackendSession | undefined {
  if (!config.browserTimeline || config.audioSource.kind === 'microphone' || config.audioSource.kind === 'virtualInput') return
  const s2sModel = options.s2sModel ?? config.s2sModel ?? undefined
  const mapped = mapSessionConfig({
    ...config, audioSource: config.audioSource.kind === 'browserTab' ? { kind: 'defaultOutput' } : config.audioSource,
    browserTimeline: undefined,
  }, settings, enabledModelIds, { s2sModel })
  if (!mapped) return
  if (config.audioSource.kind === 'browserTab') {
    mapped.config.input = { kind: 'browser_tab', capture_backend: 'browser_tab', browser_stream_id: config.audioSource.streamId }
  }
  mapped.browserTimeline = config.browserTimeline
  return mapped
}

/** Map only configurations whose selected models and capture behavior can be preserved. */
export function mapSessionConfig(
  config: SessionConfig,
  settings: AppSettings,
  enabledModelIds: ReadonlySet<string>,
  options: BackendSessionOptions = {},
): MappedBackendSession | undefined {
  if (config.browserTimeline || config.audioSource.kind === 'browserTab') return
  const speech = options.output === 'speech'
  const targets = options.output === 'source' ? [] : config.targetLanguages
  if ((speech || options.output === 'translation') && targets.length === 0) return
  const speechLanguage = options.speechLanguage || targets[0]
  if (speech && !targets.includes(speechLanguage)) return
  const headers: Record<string, string> = {}
  let pipeline: MappedBackendSession['config']['pipeline']
  if (options.s2sModel) {
    const credentials = config.recognitionOptions
    if (!enabledModelIds.has(options.s2sModel) || targets.length !== 1 || !credentials?.apiKey || !credentials.workspaceId) return
    headers['x-nola-provider-key'] = credentials.apiKey
    headers['x-nola-provider-workspace'] = credentials.workspaceId
    if (credentials.region) headers['x-nola-provider-region'] = credentials.region
    pipeline = { kind: 's2s', s2s_model: options.s2sModel }
  } else {
    const recognition = config.recognitionProvider ?? 'local'
    if (recognition === 'local' && !supportsRealtimeCompute(config.compute)) return
    const asr = recognition === 'local' ? config.recognitionModelId : recognition
    if (!asr || !enabledModelIds.has(asr)) return
    if (recognition !== 'local') {
      if (!config.recognitionOptions?.apiKey) return
      Object.assign(headers, backendAsrHeaders(config.recognitionOptions))
    }
    pipeline = { kind: 'cascade', asr_model: asr }
    if (targets.length) {
      const provider = config.translationProvider ?? 'local'
      if (provider === 'recognition') return
      const mt = provider === 'local' ? config.translationModelId : provider === 'cloud' ? 'custom-mt' : provider
      if (!mt || !enabledModelIds.has(mt)) return
      const credentials = config.translationOptions
      if (provider === 'cloud' && (!credentials?.endpoint || !credentials.model)) return
      if (provider === 'index-translate' && credentials?.endpoint && credentials.endpoint !== INDEX_TRANSLATE_ENDPOINT) return
      if (provider === 'cloud' || provider === 'mymemory') Object.assign(headers, backendMtHeaders(credentials))
      pipeline.translation_model = mt
      const fallback = config.fallbackTranslationProvider
      if (fallback) {
        const fallbackModel = fallback === 'local' ? config.translationModelId : fallback === 'cloud' ? 'custom-mt' : fallback
        const backup = config.fallbackTranslationOptions
        if (!fallbackModel || !enabledModelIds.has(fallbackModel)) return
        if (fallback === 'cloud' && (!backup?.endpoint || !backup.model)) return
        pipeline.fallback_translation_model = fallbackModel
        if (fallback === 'cloud' || fallback === 'mymemory') Object.assign(headers, backendMtHeaders(backup, 'x-nola-fallback-'))
      }
    }
    if (speech) {
      const { modelId: binding, voice } = settings.synthesis
      const modelId = binding === MIMO_TTS_BINDING ? MIMO_TTS_MODEL : binding
      if (!modelId || !enabledModelIds.has(modelId)) return
      if (modelId === MIMO_TTS_MODEL) {
        if (!options.ttsApiKey) return
        headers['x-nola-tts-key'] = options.ttsApiKey
      }
      pipeline.tts_model = modelId
      if (voice) pipeline.tts_voice = voice
    }
  }

  const source = config.audioSource
  // Process loopback spans endpoints, so it cannot preserve an explicit endpoint selection.
  if (speech && source.kind === 'systemOutput') return
  const required: MappedBackendSession['config']['required_outputs'] = ['source_text']
  if (targets.length) required.push('translated_text')
  if (speech) required.push('audio')
  return {
    config: {
      pipeline,
      input: source.kind === 'processAudio' ? {
        kind: 'process_audio', capture_backend: 'windows_process_include', process_selection_id: source.deviceId.slice('process:'.length),
      } : speech && source.kind === 'defaultOutput' ? {
        kind: 'system_audio', capture_backend: 'windows_process_exclude',
      } : {
        kind: source.kind === 'virtualInput' ? 'virtual_input' : source.kind === 'microphone' ? 'microphone' : 'system_audio',
        capture_backend: source.kind === 'virtualInput' ? 'virtual_input' : 'device',
        ...('deviceId' in source ? { device_id: source.deviceId } : {}),
      },
      source_language: config.sourceLanguage, target_languages: targets, required_outputs: required,
      ...(speech ? { speech_target_language: speechLanguage } : {}),
      max_segment_ms: config.max_segment_ms, silence_end_ms: config.silence_end_ms,
      translation_preview: config.allowIntermediateTranslation,
      translation_preview_interval_ms: config.intermediateTranslationIntervalMs,
    },
    headers,
    outputDeviceId: options.outputDeviceId,
  }
}

interface BackendSessionCallbacks {
  onEvent: (event: EngineEvent) => void
  onLatencyEvent?: (kind: string | undefined, payload: unknown, epoch: number, at?: number) => void
  preparePlayback?: (inputCable?: string) => Promise<void>
  onClose?: () => void
  onChunk?: (chunk: PlaybackChunk) => void
  onFence?: (generation: number) => void
  onLoss?: () => void
}

const count = z.number().int().nonnegative()
const sourceText = z.object({
  segment_id: z.string().min(1), source_revision: count, text: z.string(), language: z.string().optional(),
  audio_span: z.object({ start_sample: count, end_sample: count }).nullish(),
  speaker_id: z.string().max(128).nullish(), speaker_metadata_revision: count.optional(),
})
const speakerChange = z.object({
  segment_id: z.string(), speaker_id: z.string().max(128), speaker_metadata_revision: count,
})
const targetText = z.object({
  segment_id: z.string().min(1), target_language: z.string(), target_revision: count, text: z.string(),
  state: z.enum(['draft', 'provisional', 'committed']).optional(),
})
const incoming = z.object({
  schema_version: z.literal(2), server_instance_id: z.string(), session_id: z.string(),
  frame: z.string().optional(), consumer_id: z.string().optional(),
  resync_required: z.boolean().optional(),
  snapshot: z.object({ snapshot_seq: count }).optional(),
  event_type: z.string().optional(), event_seq: count.optional(), payload: z.unknown().optional(),
  epoch: count.optional(), emitted_at_unix_ms: count.optional(),
})
const statusCodes = { running: 'listening', paused: 'paused', stopping: 'stopping' } as const
const MAX_BUFFERED_EVENTS = 512
const COMMAND_TIMEOUT_MS = 180_000

interface CaptionRow {
  sourceRevision: number
  segment: CaptionSegment
  targets: Map<string, { revision: number; value: Translation }>
}

type BackendConnection = Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader' | 'instanceId'>

export class BackendSession {
  private readonly serverInstance: string
  private id?: string
  private socket?: WebSocket
  private playback?: BackendPlayback
  private browserInput?: BackendBrowserInput
  private browserTimeline?: NonNullable<SessionConfig['browserTimeline']>
  private browserStreamId?: string
  private inputEpoch = 0
  private inputGeneration = 0
  private inputSampleRate?: number
  private inputSequence = -1
  private inputQueue: Promise<void> = Promise.resolve()
  private finishInput?: { resolve: () => void; reject: (error: Error) => void }
  private closed = false
  private active = false
  private playbackGeneration = 0
  private eventCursor = 0
  private readonly eventConsumerId = randomUUID()
  private eventRecovery?: Promise<void>
  private epoch = 0
  private epochOffsetMs = 0
  private captionEndMs = 0
  private stopped = false
  private paused = false
  private s2sAudio = false
  private recoveringPlayback = false
  private stopping?: Promise<void>
  private provider = ''
  private resourceIds: string[] = []
  private readonly early: EngineEvent[] = []
  private readonly earlyAudio: PlaybackChunk[] = []
  private readonly rows = new Map<string, CaptionRow>()
  private readonly speakerChanges = new Map<string, { speakerId: string; revision: number }>()
  private readonly playbackJobs = new Map<string, 'waiting' | 'synthesizing' | 'playing'>()
  private playbackPhase: Extract<EngineEvent, { type: 'realtimePlayback' }>['phase'] = 'idle'
  private waitingCount = 0
  private blockedPlayback?: { jobId: string; state: 'failed' | 'unknown' }

  constructor(private readonly backend: BackendConnection, private readonly callbacks: BackendSessionCallbacks) {
    this.serverInstance = backend.instanceId
  }

  async models(): Promise<Set<string>> {
    const result = z.object({ models: z.array(z.object({ model_id: z.string(), enabled: z.boolean() })) })
      .parse(await this.request('/gateway/capabilities'))
    return new Set(result.models.filter(model => model.enabled).map(model => model.model_id))
  }

  async preflightProcess(selectionId: string): Promise<void> {
    const route = z.object({ safe: z.boolean() }).parse(await this.request('/audio/preflight', {
      input_mode: 'process_include', process_selection_id: selectionId,
    }))
    if (!route.safe) throw new Error('audioDeviceUnavailable')
  }

  async start(mapped: MappedBackendSession, recordingPath?: string): Promise<string> {
    const pipeline = mapped.config.pipeline
    if (pipeline.kind === 'cascade') {
      this.resourceIds = [pipeline.asr_model, pipeline.translation_model, pipeline.tts_model]
        .filter((id): id is string => !!id)
    }
    if (this.closed || this.id) throw new Error('Backend session already used')
    let input = mapped.config.input
    let inputCable: string | undefined
    if (input.capture_backend === 'windows_process_exclude') {
      // WASAPI excludes the Electron main process and its renderer and audio utility children.
      const excludedProcessTree = [process.pid]
      const route = z.object({ safe: z.boolean(), issues: z.array(z.object({ code: z.string() })) }).parse(await this.request('/audio/preflight', {
        input_mode: 'process_exclude', excluded_process_tree: excludedProcessTree, probe_target_pid: process.pid,
      }))
      if (!route.safe) throw Object.assign(new Error(route.issues[0]?.code ?? 'process_capture_unavailable'), {
        code: 'systemAudioSpeechUnavailable',
      })
      input = { ...input, excluded_process_tree: excludedProcessTree }
    } else if (input.capture_backend === 'windows_process_include') {
      const route = z.object({ safe: z.boolean(), issues: z.array(z.object({ code: z.string() })) }).parse(await this.request('/audio/preflight', {
        input_mode: 'process_include', process_selection_id: input.process_selection_id,
      }))
      if (!route.safe) throw Object.assign(new Error('audioDeviceUnavailable'), { backendCode: route.issues[0]?.code })
    } else if (input.capture_backend === 'virtual_input') {
      const virtualSpeech = input.capture_backend === 'virtual_input' && mapped.config.required_outputs.includes('audio')
      if (virtualSpeech && (!mapped.outputDeviceId || mapped.outputDeviceId === 'default')) throw new Error('audioPlaybackUnavailable')
      const route = z.object({ safe: z.boolean(), feedback_status: z.string().optional(), issues: z.array(z.object({ code: z.string() })).optional(), recording_device_name: z.string().nullish() }).parse(await this.request('/audio/preflight', {
        input_mode: 'virtual_input', input_endpoint_id: input.device_id, speech_output_endpoint_id: mapped.outputDeviceId ?? '',
        speech_output_endpoint_is_opaque: virtualSpeech,
      }))
      if (route.issues?.some(issue => issue.code === 'input_endpoint_missing' || issue.code === 'missing_input_endpoint')) throw new Error('audioDeviceUnavailable')
      if (!route.safe && !(virtualSpeech && route.feedback_status === 'unknown' && route.issues?.length === 0)) {
        throw new Error(route.issues?.some(issue => issue.code === 'feedback_loop') ? 'audioRouteConflict' : 'audioPlaybackUnavailable')
      }
      if (route.recording_device_name) inputCable = vbCablePair(route.recording_device_name, 'Output')
    }
    if (mapped.config.required_outputs.includes('audio')) await this.callbacks.preparePlayback?.(inputCable)
    if (this.closed) throw new Error('Backend session closed during start')
    const created = z.object({ session_id: z.uuid() }).parse(await this.request('/sessions', {
      command_id: randomUUID(), owner: mapped.browserTimeline ? 'browser_captions' : 'quick_interpret',
      config: { ...mapped.config, input, ...(recordingPath ? { recording_path: recordingPath } : {}) },
    }))
    this.id = created.session_id
    if (mapped.browserTimeline) {
      this.browserTimeline = mapped.browserTimeline
      this.browserStreamId = mapped.config.input.browser_stream_id
      if (mapped.config.input.kind === 'browser_tab') this.browserInput = new BackendBrowserInput(this.backend, created.session_id)
    }
    this.s2sAudio = mapped.config.pipeline.kind === 's2s' && mapped.config.required_outputs.includes('audio')
    this.provider = mapped.config.pipeline.kind === 'cascade' ? mapped.config.pipeline.translation_model ?? '' : mapped.config.pipeline.s2s_model
    try {
      if (this.closed) throw new Error('Backend session closed during start')
      await this.connectEvents(created.session_id)
      await this.command('start', 'running', mapped.headers)
      if (this.closed) throw new Error('Backend session closed during start')
      if (mapped.config.required_outputs.includes('audio')) {
        await this.connectPlayback(created.session_id)
      }
      return created.session_id
    } catch (error) {
      await this.stop().catch(() => {})
      throw error
    }
  }

  activate(): void {
    if (this.closed || this.active) return
    this.active = true
    for (const event of this.early.splice(0)) this.callbacks.onEvent(event)
    for (const chunk of this.earlyAudio.splice(0)) this.callbacks.onChunk?.(chunk)
  }

  async pause(paused: boolean): Promise<void> {
    if (paused === this.paused) return
    if (paused) this.fencePlayback(this.s2sAudio)
    if (this.browserTimeline) {
      this.resetBrowserInput()
      if (!paused) this.inputEpoch += 1
    }
    try {
      await this.command(paused ? 'pause' : 'resume', paused ? 'paused' : 'running')
      this.paused = paused
      if (!paused && this.s2sAudio && this.id) await this.connectPlayback(this.id, true)
    } catch (error) {
      if (this.s2sAudio || (paused && this.playback)) {
        void this.stop().catch(() => {})
        this.callbacks.onLoss?.()
      }
      throw error
    }
  }

  async resetBrowser(timeline: NonNullable<SessionConfig['browserTimeline']>): Promise<void> {
    if (!this.browserTimeline || timeline.epoch < this.browserTimeline.epoch) throw new Error('sessionStaleEpoch')
    this.resetBrowserInput()
    this.inputEpoch += 1
    this.inputSequence = -1
    this.browserTimeline = timeline
    await this.command('reset_stream', this.paused ? 'paused' : 'running')
  }

  pushBrowserAudio(frame: { streamId: string; epoch: number; sequence: number; sampleRate: number; pcmBase64: string }): Promise<void> {
    const input = this.browserInput
    if (!input || frame.epoch !== this.browserTimeline?.epoch || this.paused) return Promise.reject(new Error('sessionStaleEpoch'))
    if (frame.streamId !== this.browserStreamId) return Promise.reject(new Error('sessionInvalidStream'))
    if (frame.sequence <= this.inputSequence) return Promise.reject(new Error('sessionAudioOutOfOrder'))
    this.inputSequence = frame.sequence
    const generation = this.inputGeneration
    const task = this.inputQueue.then(async () => {
      if (generation !== this.inputGeneration) return
      if (this.inputSampleRate === undefined) {
        await input.open(this.inputEpoch, frame.sampleRate)
        if (generation !== this.inputGeneration) return
        this.inputSampleRate = frame.sampleRate
      }
      if (frame.sampleRate !== this.inputSampleRate) throw new Error('sessionInvalidStream')
      await input.push(Buffer.from(frame.pcmBase64, 'base64'))
    })
    this.inputQueue = task
    void task.catch(() => {})
    return task
  }

  async finishBrowser(epoch: number): Promise<void> {
    const input = this.browserInput
    if (!this.id || epoch !== this.browserTimeline?.epoch) throw new Error('sessionStaleEpoch')
    if (this.paused) await this.pause(false)
    const generation = this.inputGeneration
    await this.inputQueue
    if (generation !== this.inputGeneration) throw new Error('sessionStaleEpoch')
    if (input && this.inputSampleRate === undefined) await input.open(this.inputEpoch, 16000)
    const completed = new Promise<void>((resolve, reject) => { this.finishInput = { resolve, reject } })
    const timeout = setTimeout(() => this.finishInput?.reject(new Error('Browser input drain timed out')), 10_000)
    void completed.catch(() => {})
    try {
      if (input) await input.finish()
      else await this.request(`/sessions/${this.id}/input/end`, {})
      await completed
    } finally {
      clearTimeout(timeout)
      this.finishInput = undefined
    }
  }

  private resetBrowserInput(): void {
    this.browserInput?.reset()
    this.inputGeneration += 1
    this.inputSampleRate = undefined
    this.inputQueue = Promise.resolve()
    this.finishInput?.reject(new Error('sessionStaleEpoch'))
  }

  private fencePlayback(disconnect: boolean, advance = true): void {
    if (!this.playback) return
    if (advance) this.playback.fence(++this.playbackGeneration)
    if (disconnect) {
      this.playback.close()
      this.playback = undefined
    }
  }

  private async connectPlayback(sessionId: string, retry = false): Promise<void> {
    if (this.closed || this.stopping) return
    if (this.backend.instanceId !== this.serverInstance) throw new Error('Backend instance changed')
    const { onChunk, onFence } = this.callbacks
    if (!onChunk || !onFence) throw new Error('Playback owner unavailable')
    const playback = this.playback = new BackendPlayback(this.backend, sessionId, {
      onChunk: chunk => {
        if (chunk.generation < this.playbackGeneration) return
        if (this.active) onChunk(chunk)
        else if (this.earlyAudio.length < MAX_BUFFERED_EVENTS) this.earlyAudio.push(chunk)
        else throw new Error('Backend session audio buffer overflow')
      },
      onFence: generation => {
        this.earlyAudio.length = 0
        this.playbackGeneration = Math.max(generation, this.playbackGeneration)
        onFence(this.playbackGeneration)
      },
      onDisconnect: () => {
        if (this.playback !== playback || this.closed || this.stopped || this.stopping || this.recoveringPlayback) return
        void this.connectPlayback(sessionId, true).catch(() => {
          if (this.closed || this.stopped || this.stopping) return
          this.emit({ protocolVersion: 1, type: 'error', requestId: 'backend-playback-loss',
            code: 'audioDeviceDisconnected', recoverable: false })
          void this.stop().catch(() => this.callbacks.onLoss?.())
          this.notifyStopped()
        })
      },
    })
    try {
      await playback.ready
    } catch (error) {
      if (!retry || this.playback !== playback || this.closed || this.stopping) throw error
      // The old owner's disconnect may still be queued on the backend.
      await new Promise(resolve => setTimeout(resolve, 100))
      if (this.playback === playback) await this.connectPlayback(sessionId)
    }
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    this.playback?.close()
    this.browserInput?.close()
    if (!this.id || this.stopped) {
      this.close()
      return Promise.resolve()
    }
    return this.stopping = this.command('stop', 'closed')
      .then(() => this.notifyStopped())
      .finally(() => this.close())
  }

  acknowledge(ack: PlaybackAck): void {
    this.playback?.acknowledge(ack)
  }

  usesResource(resourceId: string): boolean {
    return !this.closed && this.resourceIds.includes(resourceId)
  }

  async resolvePlayback(jobId: string, action: 'retry' | 'skip'): Promise<void> {
    const owner = this.playback?.playbackOwnerId
    if (!this.id || !owner || this.closed || this.blockedPlayback?.jobId !== jobId) throw new Error('sessionNotRunning')
    await this.request(`/sessions/${this.id}/playback/${encodeURIComponent(jobId)}/${action}`, { owner_id: owner })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.callbacks.onClose?.()
    this.resetBrowserInput()
    this.browserInput?.close()
    this.playback?.close()
    this.socket?.terminate()
    this.early.length = 0
    this.earlyAudio.length = 0
    this.rows.clear()
    this.speakerChanges.clear()
    this.playbackJobs.clear()
  }

  private async request(path: string, body?: object, headers?: Record<string, string>): Promise<unknown> {
    if (this.backend.instanceId !== this.serverInstance) throw new Error('Backend instance changed')
    const response = await fetch(new URL('/api/v2' + path, this.backend.baseUrl), {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      headers: { ...this.backend.authorizationHeader(), 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? COMMAND_TIMEOUT_MS : 10_000),
    })
    if (!response.ok) {
      const failure = await readBackendFailure(response)
      if (failure) throw backendFailure(failure)
      if (response.status === 422) throw new Error('invalidConfiguration')
      throw new Error('engineTransportUnavailable')
    }
    return response.json()
  }

  private async command(type: 'start' | 'pause' | 'resume' | 'stop' | 'reset_stream', expected: string, headers?: Record<string, string>): Promise<void> {
    if (!this.id) throw new Error('sessionNotRunning')
    const commandId = randomUUID()
    const result = z.object({ accepted: z.literal(true), command_id: z.literal(commandId),
      session_id: z.literal(this.id), result_state: z.string() }).parse(
      await this.request(`/sessions/${this.id}/commands`, { command_id: commandId, type }, headers),
    )
    if (result.result_state === 'failed') {
      const state = z.object({ last_error: backendError.nullish() }).safeParse(await this.request(`/sessions/${this.id}`))
      if (state.success && state.data.last_error) throw backendFailure(state.data.last_error)
    }
    if (result.result_state !== expected) throw new Error('sessionError')
  }

  private connectEvents(sessionId: string): Promise<void> {
    if (this.backend.instanceId !== this.serverInstance) return Promise.reject(new Error('Backend instance changed'))
    const url = new URL(`/api/v2/sessions/${sessionId}/events`, this.backend.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = this.socket = new WebSocket(url, {
      headers: this.backend.authorizationHeader(), handshakeTimeout: 10_000, maxPayload: 1024 * 1024,
    })
    const consumerId = this.eventConsumerId
    const resumeCursor = this.eventCursor
    return new Promise((resolve, reject) => {
      let connected = false
      const timeout = setTimeout(() => socket.terminate(), 10_000)
      socket.on('error', () => socket.terminate())
      socket.once('close', () => {
        clearTimeout(timeout)
        reject(new Error('Backend events socket closed before handshake'))
        if (connected && this.socket === socket) this.recoverEvents(sessionId)
      })
      socket.once('open', () => socket.send(JSON.stringify({
        frame: 'hello', schema_version: 2, consumer_id: consumerId,
        resume_cursor: resumeCursor, outputs: ['source_text', 'translated_text', 'audio'],
      })))
      socket.on('message', (data, binary) => {
        if (this.closed) return
        try {
          if (binary) throw new Error('Unexpected binary on event channel')
          const event = incoming.parse(JSON.parse(data.toString()))
          if (event.session_id !== sessionId || event.server_instance_id !== this.serverInstance) throw new Error('Backend event identity mismatch')
          if (!connected) {
            if (event.frame !== 'hello_ack' || event.consumer_id !== consumerId || event.resync_required) throw new Error('Backend event replay unavailable')
            if (resumeCursor === 0) this.eventCursor = event.snapshot?.snapshot_seq ?? 0
            clearTimeout(timeout)
            connected = true
            resolve()
          } else if (event.event_seq && event.event_seq > this.eventCursor) {
            this.eventCursor = event.event_seq
            const epoch = event.epoch ?? 0
            this.callbacks.onLatencyEvent?.(event.event_type, event.payload, epoch, event.emitted_at_unix_ms)
            this.receiveEvent(sessionId, event.event_type, event.payload, epoch)
          }
        } catch {
          socket.terminate()
        }
      })
    })
  }

  private recoverEvents(sessionId: string): void {
    if (this.closed || this.stopped || this.stopping || this.eventRecovery) return
    if (!this.active) {
      void this.stop().catch(() => {})
      return
    }
    const task = this.eventRecovery = (async () => {
      for (const delay of [100, 300, 800]) {
        await new Promise(resolve => setTimeout(resolve, delay))
        if (this.closed || this.stopped || this.stopping) return
        try {
          await this.connectEvents(sessionId)
          return
        } catch { /* Retry the bounded event tail while this session still owns the stream. */ }
      }
      if (this.closed || this.stopped || this.stopping) return
      this.emit({ protocolVersion: 1, type: 'error', requestId: 'backend-event-loss',
        code: 'engineTransportUnavailable', recoverable: false })
      void this.stop().catch(() => this.callbacks.onLoss?.())
      this.notifyStopped()
    })()
    void task.finally(() => {
      this.eventRecovery = undefined
      if (!this.closed && !this.stopped && this.socket?.readyState === WebSocket.CLOSED) this.recoverEvents(sessionId)
    })
  }

  private emit(event: EngineEvent): void {
    if (this.active) this.callbacks.onEvent(event)
    else if (this.early.length < MAX_BUFFERED_EVENTS) this.early.push(event)
    else throw new Error('Backend session event buffer overflow')
  }

  private notifyStopped(): void {
    if (this.stopped || !this.id) return
    this.stopped = true
    this.finishInput?.resolve()
    this.emit({ protocolVersion: 1, type: 'sessionStopped', requestId: 'backend-stopped', sessionId: this.id })
  }

  private receiveEvent(sessionId: string, kind: string | undefined, payload: unknown, epoch: number): void {
    const envelope = { protocolVersion: 1 as const, requestId: `backend-${this.eventCursor}` }
    if (kind === 'synthesis_state' || kind === 'playback_state') {
      const { state, job_id, audio_stream_id, claim_id } = z.object({
        state: z.string(), job_id: z.string().nullish(), audio_stream_id: z.string().nullish(), claim_id: z.string().nullish(),
      }).parse(payload)
      const job = job_id || audio_stream_id
      const previousBlocked = this.blockedPlayback
      if (job && !this.s2sAudio && (state === 'failed' || state === 'unknown')) this.blockedPlayback = { jobId: job, state }
      else if (job === this.blockedPlayback?.jobId || (!job && !claim_id && state === 'cancelled')) this.blockedPlayback = undefined
      if (job) {
        if (state === 'queued' || state === 'complete' || state === 'waiting' || state === 'claimed') this.playbackJobs.set(job, 'waiting')
        else if (state === 'running') this.playbackJobs.set(job, 'synthesizing')
        else if (state === 'playing') this.playbackJobs.set(job, 'playing')
        else this.playbackJobs.delete(job)
      } else if (!claim_id && (state === 'cancelled' || state === 'interrupted')) {
        this.playbackJobs.clear()
      }
      const phases = [...this.playbackJobs.values()]
      const waitingCount = phases.filter(phase => phase === 'waiting').length
      const phase = this.blockedPlayback ? 'failed' : phases.includes('playing') ? 'playing' : phases.includes('synthesizing') ? 'synthesizing'
        : phases.includes('waiting') ? 'waiting' : state === 'failed' || state === 'unknown' ? 'failed' : 'idle'
      if (phase !== this.playbackPhase || waitingCount !== this.waitingCount || previousBlocked !== this.blockedPlayback) {
        this.playbackPhase = phase
        this.waitingCount = waitingCount
        this.emit({ ...envelope, type: 'realtimePlayback', sessionId, phase, waitingCount, playbackJob: this.blockedPlayback })
      }
      return
    }
    if (kind === 'pipeline_state') {
      const { state } = z.object({ state: z.string() }).parse(payload)
      if (this.s2sAudio && state === 'recovering') {
        this.recoveringPlayback = true
        this.fencePlayback(true, false)
      }
      if (this.recoveringPlayback && state === 'running') {
        this.recoveringPlayback = false
        void this.connectPlayback(sessionId, true).catch(() => {
          if (this.closed || this.stopping) return
          void this.stop().catch(() => {})
          this.callbacks.onLoss?.()
        })
      }
      if (state === 'closed' || state === 'failed') {
        this.fencePlayback(true)
        this.notifyStopped()
      }
      else if (state === 'running' || state === 'paused' || state === 'stopping') {
        this.emit({ ...envelope, type: 'status', code: statusCodes[state] })
      }
      return
    }
    if (kind === 'error') {
      const { error } = z.object({ error: backendError }).parse(payload)
      if (error.message_key === 's2sPlaybackFenced') return
      this.emit({ ...envelope, type: 'error', code: backendErrorCode(error),
        recoverable: !error.fatal && (error.retryable || error.scope === 'task' || error.scope === 'consumer'),
        details: { backendCode: error.code, stage: error.stage, scope: error.scope,
          messageKey: error.message_key, correlationId: error.correlation_id } })
      return
    }
    if (kind === 'speaker_changed') {
      const change = speakerChange.parse(payload)
      if (this.speakerChanges.size >= MAX_BUFFERED_EVENTS) this.speakerChanges.delete(this.speakerChanges.keys().next().value!)
      this.speakerChanges.set(change.segment_id, { speakerId: change.speaker_id, revision: change.speaker_metadata_revision })
      return
    }
    const source = kind === 'source_text' || kind === 'source_committed' ? sourceText.parse(payload) : undefined
    const target = kind === 'translated_text' || kind === 'translation_committed' ? targetText.parse(payload) : undefined
    const segmentId = source?.segment_id ?? target?.segment_id
    if (!segmentId) return
    if (this.browserTimeline && epoch !== this.inputEpoch) return
    if (epoch < this.epoch) return
    if (epoch > this.epoch) {
      this.epoch = epoch
      this.epochOffsetMs = this.captionEndMs
      this.rows.clear()
    }
    let row = this.rows.get(segmentId)
    if (!row) {
      if (this.rows.size >= MAX_BUFFERED_EVENTS) this.rows.delete(this.rows.keys().next().value!)
      row = { sourceRevision: -1, targets: new Map(), segment: {
        segmentId, revision: 0, startedAtMs: this.captionEndMs, sourceText: '', isFinal: false, translations: [],
      } }
      this.rows.set(segmentId, row)
    }
    const segment = row.segment
    if (source) {
      if (source.source_revision < row.sourceRevision || segment.isFinal
          || (source.source_revision === row.sourceRevision && kind !== 'source_committed')) return
      row.sourceRevision = source.source_revision
      segment.sourceText = source.text
      segment.sourceLanguage = source.language
      const speaker = this.speakerChanges.get(segmentId)
      if (source.speaker_id || speaker) {
        segment.speakerId = source.speaker_id ?? speaker?.speakerId
        segment.speakerMetadataRevision = source.speaker_metadata_revision ?? speaker?.revision ?? segment.speakerMetadataRevision
      }
      segment.isFinal = kind === 'source_committed'
      if (source.audio_span) {
        segment.startedAtMs = this.epochOffsetMs + source.audio_span.start_sample / 16
        segment.endedAtMs = this.epochOffsetMs + source.audio_span.end_sample / 16
        this.captionEndMs = Math.max(this.captionEndMs, segment.endedAtMs)
      }
    } else if (target) {
      const previous = row.targets.get(target.target_language)
      const final = kind === 'translation_committed' || target.state === 'committed'
      if (previous && (previous.value.state === 'complete' || previous.revision > target.target_revision
          || (previous.revision === target.target_revision && !final))) return
      row.targets.set(target.target_language, { revision: target.target_revision, value: {
        targetLanguage: target.target_language, text: target.text, provider: this.provider,
        state: final ? 'complete' : 'pending', ...(final ? { stableText: target.text } : {}),
      } })
    }
    segment.revision += 1
    const timeline = this.browserTimeline
    this.emit({ ...envelope, type: 'caption', sessionId,
      ...(timeline ? {
        streamEpoch: timeline.epoch,
        videoStartedAtMs: timeline.videoTimeMs + (segment.startedAtMs - this.epochOffsetMs) * timeline.playbackRate,
        ...(segment.endedAtMs !== undefined ? {
          videoEndedAtMs: timeline.videoTimeMs + (segment.endedAtMs - this.epochOffsetMs) * timeline.playbackRate,
        } : {}),
      } : {}), segment: {
      ...segment, translations: [...row.targets.values()].map(target => target.value),
    } })
  }
}
