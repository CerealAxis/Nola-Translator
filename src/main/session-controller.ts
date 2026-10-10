import { randomUUID } from 'node:crypto'
import { logDiagnostic } from './session-log'
import type { EngineEvent, SessionConfig } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import { NO_TRANSLATION_LANGUAGE, type AppSettings, type CredentialProvider } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { MeetingStore } from './meeting-store'

export type SessionOwner = 'desktop' | 'browser'
export interface SessionControllerOptions {
  engine: EngineProcess
  meetings: MeetingStore | null
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  prepare(config: SessionConfig, cancelled?: () => boolean): Promise<void>
  whenReady(): Promise<void>
  startingChanged(starting: boolean): void
  showOverlay(): void
  hideOverlay(): void
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
  constructor(private readonly options: SessionControllerOptions) {}

  get browserActive(): boolean { return this.owner === 'browser' }
  get busy(): boolean { return this.starting || this.activeSessionId !== null || this.stopping !== null || this.cancelling !== null }
  async ensureReady(): Promise<void> {
    await this.options.whenReady()
    if (this.options.engine.currentState !== 'ready') await this.options.engine.start()
  }
  isBrowserEvent(event: EngineEvent): boolean {
    if ('sessionId' in event) return this.browserSessions.has(event.sessionId) || (this.starting && this.browserActive)
    return this.browserActive && (event.type === 'status' || event.type === 'error')
  }
  async start(raw: unknown, owner: SessionOwner): Promise<{ sessionId: string; meetingId: string | null }> {
    logDiagnostic('session.start.requested', { owner })
    if (this.busy) throw new Error('sessionAlreadyRunning')
    const parsed = sessionConfigSchema.parse(raw) as SessionConfig
    if (owner === 'desktop' && (parsed.audioSource.kind === 'browserTab' || parsed.browserTimeline)) throw new Error('invalidConfiguration')
    if (owner === 'browser' && (!parsed.browserTimeline || parsed.audioSource.kind === 'microphone')) throw new Error('invalidConfiguration')
    parsed.compute = { ...this.options.getSettings().compute }
    delete parsed.recordingPath
    this.starting = true
    const operation = ++this.operation
    const checkCancelled = () => { if (operation !== this.operation) throw new Error('sessionStartCancelled') }
    this.owner = owner
    this.options.startingChanged(true)
    let meetingId: string | null = null
    try {
      await this.options.prepare(parsed, () => operation !== this.operation)
      checkCancelled()
      await this.ensureReady()
      checkCancelled()
      if (owner === 'browser' && !this.options.engine.supports('browserAudio')) throw new Error('engineUpdateRequired')
      const provider = parsed.translationProvider ?? 'local'
      if (provider === 'local') delete parsed.translationOptions
      else {
        const apiKey = await this.options.getCredential(provider)
        checkCancelled()
        if (apiKey) parsed.translationOptions = { ...parsed.translationOptions, apiKey }
      }
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
    const task = (async () => {
      try {
        await this.ensureReady()
        await this.options.engine.request({ protocolVersion: 1, type: 'stopSession', requestId: `stop-${randomUUID()}`, sessionId: id }, 'sessionStopped', 60_000)
      } catch (error) {
        if (browser) await this.options.engine.stop()
        throw error
      } finally {
        if (this.activeSessionId === id) this.activeSessionId = null
        this.owner = null
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
      if (!this.starting) this.owner = null
    }
  }
  releaseOnLoss(): void {
    if (this.starting && !this.activeSessionId) return
    const id = this.activeSessionId
    const browser = this.browserActive
    this.activeSessionId = null
    this.owner = null
    if (id && !browser) void this.options.meetings?.finish(id).catch(error => console.error('meeting finalize failed', error))
    this.options.hideOverlay()
  }
  private rememberBrowser(id: string): void {
    this.browserSessions.add(id)
    if (this.browserSessions.size > 256) this.browserSessions.delete(this.browserSessions.values().next().value!)
  }
}
