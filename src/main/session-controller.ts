import { randomUUID } from 'node:crypto'
import { logDiagnostic } from './session-log'
import type { EngineEvent, PrewarmConfig, PrewarmResult, SessionConfig, AudioTestSource, AudioTestResult } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import { NO_TRANSLATION_LANGUAGE, type AppSettings, type CredentialProvider, type RecognitionProvider } from '../shared/settings'
import { supportsIntermediateTranslation, translationOptionsOf } from '../shared/cloud-config'
import { customCredentialSlot } from '../shared/custom-models'
import { bindingIsLocal, normalizeModelBinding } from '../shared/model-gateway'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import type { EngineProcess } from './engine-process'
import type { MeetingStore } from './meeting-store'

/**
 * Each cloud recognition provider owns one slot of `credentials.json`. A provider absent here has
 * no key to inject, so its session carries no `apiKey` at all.
 */
const RECOGNITION_CREDENTIAL_SLOTS: Partial<Record<RecognitionProvider, CredentialProvider>> = {
  aliyun: 'aliyun-asr',
  minimax: 'minimax-asr',
}

/** The model-gateway binding a config's recognition fields describe. */
export function recognitionBindingOf(config: Pick<SessionConfig, 'recognitionProvider' | 'recognitionModelId'>): string {
  const provider = config.recognitionProvider ?? 'local'
  return provider === 'local' ? (config.recognitionModelId ? `resource:${config.recognitionModelId}` : '') : `cloud:${provider}`
}

/**
 * The binding a config's translation fields describe. Native translation is a property of the
 * recognition stream, so it names no translation model and leaves the gateway binding in place.
 */
export function translationBindingOf(config: Pick<SessionConfig, 'translationProvider' | 'translationModelId'>, settings: AppSettings): string {
  const provider = config.translationProvider ?? 'local'
  if (provider === 'recognition') return ''
  if (provider === 'local') return config.translationModelId ? `resource:${config.translationModelId}` : ''
  if (provider === 'cloud') return `mt-custom:${settings.translation.customModelId || 'legacy'}`
  return `cloud:${provider}`
}

export type SessionOwner = 'desktop' | 'browser'
export interface SessionControllerOptions {
  engine: EngineProcess
  activity?: FeatureActivity
  meetings: MeetingStore | null
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  prepare(config: SessionConfig, cancelled?: () => boolean): Promise<void>
  whenReady(): Promise<void>
  startingChanged(starting: boolean): void
  showOverlay(): void
  hideOverlay(): void
  /** The browser caption gate reserves the caption service even before an extension connects. */
  isBrowserCaptionServiceActive?(): boolean
  isOverlayVisible?(): boolean
  useGateway?: boolean
  audioTestEngine?: EngineProcess
}

/** One reservation covers runtime preparation as well as inference, across both clients. */
export class SessionController {
  activeSessionId: string | null = null
  starting = false
  private owner: SessionOwner | null = null
  private readonly browserSessions = new Set<string>()
  private stopping: { id: string; task: Promise<void> } | null = null
  private operation = 0
  private cancelling: Promise<void> | null = null
  private browserPreparing = false
  private featureLease: FeatureLease | null = null
  private localModelsInUse = false
  private readonly inFlight = new Set<Promise<unknown>>()
  constructor(private readonly options: SessionControllerOptions) {}
  get engine(): EngineProcess { return this.options.engine }
  get usesLocalModels(): boolean { return (this.starting || !!this.activeSessionId) && this.localModelsInUse }

  testAudio(audioSource: AudioTestSource): Promise<AudioTestResult> {
    return this.withActivity('interpretation', false, () => this.testAudioInternal(audioSource))
  }
  prewarm(config: PrewarmConfig): Promise<PrewarmResult> {
    return this.withActivity('browser-captions', false, () => this.prewarmInternal(config))
  }
  start(raw: unknown, owner: SessionOwner): Promise<{ sessionId: string; meetingId: string | null }> {
    return this.withActivity(owner === 'desktop' ? 'interpretation' : 'browser-captions', true, () => this.startInternal(raw, owner))
  }
  private withActivity<T>(owner: 'interpretation' | 'browser-captions', retain: boolean, run: () => Promise<T>): Promise<T> {
    const activity = this.options.activity
    activity?.assertAvailable(owner)
    const lease = activity && !activity.has(owner) ? activity.acquire(owner, () => this.stopCurrent()) : null
    if (lease) this.featureLease = lease
    const task = run().then(result => { if (retain) lease?.running(); return result }).finally(() => {
      this.inFlight.delete(task)
      if (!retain || !this.activeSessionId) {
        lease?.release()
        if (this.featureLease === lease) this.featureLease = null
      }
    })
    this.inFlight.add(task)
    return task
  }
  async stopCurrent(): Promise<void> {
    const pending = [...this.inFlight]
    if (this.starting) {
      this.operation++
      await this.options.engine.stop()
      await Promise.allSettled(pending)
      this.starting = false
      this.browserPreparing = false
      this.options.startingChanged(false)
    }
    if (this.activeSessionId) {
      try { await this.stop(this.activeSessionId) }
      catch (error) { if (this.options.engine.currentState !== 'stopped') throw error }
    }
    this.options.hideOverlay()
    this.featureLease?.release()
    this.featureLease = null
  }
  get browserActive(): boolean { return this.owner === 'browser' }
  get browserServiceStarting(): boolean { return this.browserPreparing || (this.starting && this.browserActive) }
  get busy(): boolean { return this.starting || this.activeSessionId !== null || this.stopping !== null || this.cancelling !== null }
  async ensureReady(): Promise<void> {
    await this.options.whenReady()
    if (this.options.engine.currentState !== 'ready') await this.options.engine.start()
  }
  canShowOverlay(): boolean { return this.options.useGateway ? !this.browserActive : !this.browserPreparing && !this.browserActive && !this.options.isBrowserCaptionServiceActive?.() }
  isBrowserEvent(event: EngineEvent): boolean {
    if ('sessionId' in event) return this.browserSessions.has(event.sessionId) || (this.starting && this.browserActive)
    return this.browserActive && (event.type === 'status' || event.type === 'error')
  }
  private async testAudioInternal(audioSource: AudioTestSource): Promise<AudioTestResult> {
    if (this.busy) throw new Error('sessionAlreadyRunning')
    this.starting = true
    this.options.startingChanged(true)
    try {
      const engine = this.options.audioTestEngine ?? this.options.engine
      await this.options.whenReady()
      if (engine.currentState !== 'ready') await engine.start()
      if (!engine.supports('audioTest')) throw new Error('engineUpdateRequired')
      const result = await engine.request({ protocolVersion: 1, type: 'testAudio',
        requestId: `audio-test-${randomUUID()}`, audioSource }, 'audioTested', 8000)
      return { audioBase64: result.audioBase64, durationMs: result.durationMs, hasSignal: result.hasSignal }
    } finally {
      this.starting = false
      this.options.startingChanged(false)
    }
  }
  private async prewarmInternal(config: PrewarmConfig): Promise<PrewarmResult> {
    if (this.busy || (!this.options.useGateway && this.options.isOverlayVisible?.())) return { state: 'failed', code: 'sessionAlreadyRunning' }
    // Model preparation owns the same reservation as starting capture, so neither a second
    // client nor component installation can replace an environment while weights load.
    this.starting = true
    this.browserPreparing = true
    this.options.startingChanged(true)
    try {
      const session: SessionConfig = { ...config, audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime' }
      const operation = this.operation
      await this.options.prepare(session, () => operation !== this.operation)
      if (operation !== this.operation) throw new Error('sessionStartCancelled')
      await this.ensureReady()
      if (operation !== this.operation) throw new Error('sessionStartCancelled')
      return await this.options.engine.prewarmModels({ ...config, compute: session.compute ?? config.compute,
        recognitionBinding: session.recognitionBinding, recognitionProvider: session.recognitionProvider, recognitionModelId: session.recognitionModelId ?? config.recognitionModelId,
        translationBinding: session.translationBinding, translationProvider: session.translationProvider, translationModelId: session.translationModelId,
        max_segment_ms: this.options.getSettings().recognition.max_segment_ms ?? 10000,
        silence_end_ms: this.options.getSettings().recognition.silence_end_ms ?? 800,
      })
    } finally {
      this.browserPreparing = false
      this.starting = false
      this.options.startingChanged(false)
    }
  }
  private async startInternal(raw: unknown, owner: SessionOwner): Promise<{ sessionId: string; meetingId: string | null }> {
    logDiagnostic('session.start.requested', { owner })
    if (owner === 'desktop' && !this.canShowOverlay()) throw new Error('sessionAlreadyRunning')
    if (this.busy) throw new Error('sessionAlreadyRunning')
    const parsed = sessionConfigSchema.parse(raw) as SessionConfig
    if (this.options.useGateway) {
      // Bindings are authoritative; renderer settings persistence may still be in flight after fallback.
      const asr = normalizeModelBinding('asr', parsed.recognitionBinding)
      if (asr) {
        parsed.recognitionBinding = asr
        if (bindingIsLocal(asr)) { parsed.recognitionProvider = 'local'; parsed.recognitionModelId = asr.slice(9) }
        else parsed.recognitionProvider = asr.slice(6) as RecognitionProvider
      }
      const mt = normalizeModelBinding('mt', parsed.translationBinding)
      if (mt) {
        parsed.translationBinding = mt
        if (bindingIsLocal(mt)) { parsed.translationProvider = 'local'; parsed.translationModelId = mt.slice(9) }
        else parsed.translationProvider = mt.startsWith('mt-custom:') ? 'cloud' : mt.slice(6) as SessionConfig['translationProvider']
      }
    }
    this.localModelsInUse = (parsed.recognitionProvider ?? 'local') === 'local' || parsed.targetLanguages.length > 0 && (parsed.translationProvider ?? 'local') === 'local'
    // The provider gate lives in `supportsIntermediateTranslation`. Re-applying it here keeps a
    // stale or hand-assembled config from carrying a preference the chosen provider cannot act on.
    if (parsed.translationProvider && !supportsIntermediateTranslation(parsed.translationProvider)) parsed.allowIntermediateTranslation = false
    if (owner === 'desktop' && (parsed.audioSource.kind === 'browserTab' || parsed.browserTimeline)) throw new Error('invalidConfiguration')
    if (owner === 'browser' && (!parsed.browserTimeline || parsed.audioSource.kind === 'microphone')) throw new Error('invalidConfiguration')
    const startSettings = this.options.getSettings()
    parsed.compute = { ...startSettings.compute }
    parsed.max_segment_ms = startSettings.recognition.max_segment_ms ?? 10000
    parsed.silence_end_ms = startSettings.recognition.silence_end_ms ?? 800
    // A profile switch while the ASR key is loading must not send the new key to the old endpoint.
    if (parsed.translationProvider === 'cloud' && startSettings.translation.customModelId) parsed.translationOptions = translationOptionsOf({ ...startSettings.translation, provider: 'cloud' })
    delete parsed.recordingPath
    this.starting = true
    const operation = ++this.operation
    const checkCancelled = () => { if (operation !== this.operation) throw new Error('sessionStartCancelled') }
    this.owner = owner
    this.options.startingChanged(true)
    let meetingId: string | null = null
    try {
      // Untrusted IPC payloads cannot supply credentials, including for no-key providers.
      if (parsed.recognitionOptions) delete parsed.recognitionOptions.apiKey
      if (parsed.translationOptions) delete parsed.translationOptions.apiKey
      if (parsed.fallbackTranslationOptions) delete parsed.fallbackTranslationOptions.apiKey
      const recognitionProvider = parsed.recognitionProvider ?? 'local'
      const credentialSlot = RECOGNITION_CREDENTIAL_SLOTS[recognitionProvider]
      // A provider without a slot of its own carries no key, so its options are dropped rather
      // than forwarded with whatever the renderer sent.
      if (this.options.useGateway) {
        delete parsed.recognitionOptions
        delete parsed.translationOptions
        delete parsed.fallbackTranslationOptions
        // The consumer names the model it wants; a config assembled without a binding still gets
        // the one its provider fields describe.
        parsed.recognitionBinding ||= recognitionBindingOf(parsed)
        parsed.translationBinding ||= translationBindingOf(parsed, startSettings)
      } else if (!credentialSlot) delete parsed.recognitionOptions
      else {
        const apiKey = await this.options.getCredential(credentialSlot)
        checkCancelled()
        if (!apiKey) throw new Error(`CLOUD_RECOGNITION_CREDENTIAL_MISSING: ${credentialSlot} API key is required`)
        parsed.recognitionOptions = { ...parsed.recognitionOptions, apiKey }
      }
      const provider = parsed.translationProvider ?? 'local'
      if (provider === 'local' || provider === 'recognition') delete parsed.translationOptions
      if (!this.options.useGateway && (provider === 'cloud' || provider === 'microsoft' || provider === 'google')) {
        const customId = startSettings.translation.customModelId
        const apiKey = await this.options.getCredential(provider === 'cloud' && customId ? customCredentialSlot(customId) : provider)
        checkCancelled()
        if (apiKey) parsed.translationOptions = { ...parsed.translationOptions, apiKey }
      }
      const fallbackProvider = parsed.fallbackTranslationProvider
      if (!this.options.useGateway && (fallbackProvider === 'cloud' || fallbackProvider === 'microsoft' || fallbackProvider === 'google')) {
        const slot: CredentialProvider = fallbackProvider === 'cloud'
          ? 'fallback-cloud'
          : fallbackProvider === 'google' ? 'fallback-google' : 'microsoft'
        const apiKey = await this.options.getCredential(slot)
        checkCancelled()
        if (apiKey) parsed.fallbackTranslationOptions = { ...parsed.fallbackTranslationOptions, apiKey }
      }
      await this.options.prepare(parsed, () => operation !== this.operation)
      checkCancelled()
      await this.ensureReady()
      checkCancelled()
      if (owner === 'browser' && !this.options.engine.supports('browserAudio')) throw new Error('engineUpdateRequired')
      const keepAudio = this.options.getSettings().recording.keepAudio
      if (owner === 'desktop' && this.options.meetings) {
        const meeting = await this.options.meetings.begin({ sourceLanguage: parsed.sourceLanguage, targetLanguage: parsed.targetLanguages[0] ?? NO_TRANSLATION_LANGUAGE, recordAudio: keepAudio })
        meetingId = meeting.meetingId
        if (keepAudio) parsed.recordingPath = this.options.meetings.recordingPathFor(meetingId)
      }
      const response = await this.options.engine.request({ protocolVersion: 1, type: 'startSession', requestId: `start-${randomUUID()}`, config: parsed }, 'sessionStarted', 30 * 60_000)
      checkCancelled()
      this.activeSessionId = response.sessionId
      if (owner === 'browser') this.rememberBrowser(response.sessionId)
      if (meetingId) this.options.meetings?.attach(meetingId, response.sessionId)
      if (owner === 'desktop') this.options.showOverlay()
      logDiagnostic('session.started', { owner, sessionId: response.sessionId, meetingId })
      return { sessionId: response.sessionId, meetingId }
    } catch (error) {
      logDiagnostic('session.start.failed', { owner, error })
      if (meetingId) await this.options.meetings?.abandon(meetingId).catch(() => undefined)
      if (operation === this.operation) this.owner = null
      throw error
    } finally {
      if (operation === this.operation) {
        this.starting = false
        this.options.startingChanged(false)
      }
    }
  }
  assertOwner(id: string, owner: SessionOwner): void {
    if (id !== this.activeSessionId || owner !== this.owner) throw new Error('sessionNotRunning')
  }
  cancelBrowserStart(): Promise<void> {
    if (this.cancelling) return this.cancelling
    if (!this.starting || !this.browserActive) return Promise.resolve()
    this.operation++
    this.starting = false
    this.owner = null
    this.options.startingChanged(false)
    const task = this.options.engine.stop()
    this.cancelling = task
    void task.finally(() => { if (this.cancelling === task) this.cancelling = null }).catch(() => undefined)
    return task
  }
  stop(id: string): Promise<void> {
    logDiagnostic('session.stop.requested', { sessionId: id, owner: this.owner })
    if (this.stopping?.id === id) return this.stopping.task
    if (id !== this.activeSessionId) return Promise.resolve()
    const browser = this.browserSessions.has(id)
    this.featureLease?.stopping()
    const task = (async () => {
      try {
        await this.ensureReady()
        await this.options.engine.request({ protocolVersion: 1, type: 'stopSession', requestId: `stop-${randomUUID()}`, sessionId: id }, 'sessionStopped', 60_000)
      } catch (error) {
        await this.options.engine.stop()
        throw error
      } finally {
        if (this.activeSessionId === id) this.activeSessionId = null
        this.owner = null
        this.featureLease?.release()
        this.featureLease = null
        if (!browser) await this.options.meetings?.finish(id).catch(error => console.error('meeting finalize failed', error))
      }
    })()
    this.stopping = { id, task }
    void task.finally(() => { if (this.stopping?.task === task) this.stopping = null }).catch(() => undefined)
    return task
  }
  async pause(id: string, paused: boolean): Promise<void> {
    logDiagnostic('session.pause.requested', { sessionId: id, paused })
    await this.ensureReady()
    await this.options.engine.request({ protocolVersion: 1, type: 'setSessionPaused', requestId: `pause-${randomUUID()}`, sessionId: id, paused }, 'status', 30_000)
  }
  handleEvent(event: EngineEvent): void {
    if (event.type === 'sessionStarted' && this.browserActive) this.rememberBrowser(event.sessionId)
    if (event.type === 'sessionStopped') {
      if (this.activeSessionId === event.sessionId) this.activeSessionId = null
      if (!this.starting) {
        this.owner = null
        if (!this.stopping) { this.featureLease?.release(); this.featureLease = null }
      }
    }
  }
  releaseOnLoss(): void {
    if (this.starting && !this.activeSessionId) return
    const id = this.activeSessionId
    const browser = this.browserActive
    this.activeSessionId = null
    this.owner = null
    if (id && !browser) void this.options.meetings?.finish(id).catch(error => console.error('meeting finalize failed', error))
    this.featureLease?.release()
    this.featureLease = null
    this.options.hideOverlay()
  }
  private rememberBrowser(id: string): void {
    this.browserSessions.add(id)
    if (this.browserSessions.size > 256) this.browserSessions.delete(this.browserSessions.values().next().value!)
  }
}
