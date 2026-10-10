import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createServer, type Server, type Socket } from 'node:net'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { mkdir, writeFile, access, rm, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { BROWSER_EXTENSION_ID, BROWSER_HOST_NAME, browserRequestSchema, type BrowserCaptionConfig, type BrowserConnectionStatus, type BrowserRequest, type BrowserResponse, type BrowserKind } from '../shared/browser'
import type { BrowserIntegrations } from './browser-integrations'
import type { AudioDevice, SessionConfig, EngineEvent, EngineProcessState } from '../shared/contracts'
import { NO_TRANSLATION_LANGUAGE, type AppSettings } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { SessionController } from './session-controller'
import { resolveDataRoot } from './data-root'

const run = promisify(execFile)
const CHANNEL = 'browser:connection'
const CAPTION_SERVICE_CHANNEL = 'browser:caption-service'
const MAX_MESSAGE = 160 * 1024
/** How often the desktop summarizes the audio it received; 10 chunks/second would be unreadable. */
const AUDIO_LOG_INTERVAL_MS = 1000
const PUBLIC_ERRORS = ['sessionAlreadyRunning', 'sessionNotRunning', 'engineUpdateRequired', 'audioBufferOverflow', 'audioDeviceUnavailable', 'invalidConfiguration', 'modelUnavailable', 'resourceUnavailable', 'resourceBusy', 'browserConnectionDisabled', 'sessionStartCancelled', 'captionServiceOff', 'internalError'] as const

/**
 * The extension only ever receives a whitelisted code. Anything unrecognised is reported
 * here and mapped to `internalError`, because an exception message can quote request
 * credentials and must not cross the pipe.
 */
function publicErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('RUNTIME_TORCH:')) return 'torchUnavailable'
  if (message.includes('RUNTIME_LLAMA:')) return 'llamaUnavailable'
  const known = PUBLIC_ERRORS.find(code => message === code || message.includes(`：${code}`))
  if (known) return known
  console.error('browser request failed with an unmapped error', error)
  return 'internalError'
}
interface Client { socket: Socket; browser: BrowserKind; authenticated: boolean; sessionId: string | null; starting: boolean; closed: boolean; pending: number; pendingAudioMs: number; audioWindow: AudioWindow }
interface AudioWindow { count: number; lastBytes: number; lastAudioMs: number; loggedAtMs: number }
export interface BrowserConnectionOptions {
  engine: EngineProcess
  sessions: SessionController
  getSettings(): AppSettings
  setEnabled(enabled: boolean): Promise<void>
  integrations?: BrowserIntegrations
}

/** The desktop settings the extension renders captions from; it configures none of this itself. */
export function browserCaptionConfig(settings: AppSettings): BrowserCaptionConfig {
  return {
    videoCaptions: settings.videoCaptions,
    sourceLanguage: settings.recognition.sourceLanguage,
    targetLanguage: settings.translation.targetLanguage,
  }
}

export function browserSessionConfig(settings: AppSettings, request: Extract<BrowserRequest, { type: 'start' }>): SessionConfig {
  const translation = settings.translation
  return {
    audioSource: request.source === 'tab' ? { kind: 'browserTab', streamId: request.streamId } : request.deviceId ? { kind: 'systemOutput', deviceId: request.deviceId } : { kind: 'defaultOutput' },
    recognitionMode: 'realtime', recognitionModelId: settings.recognition.modelId,
    sourceLanguage: settings.recognition.sourceLanguage,
    targetLanguages: translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? [] : [translation.targetLanguage],
    translationProvider: translation.provider, translationModelId: translation.localModelId,
    allowIntermediateTranslation: translation.translateIntermediate,
    ...(translation.provider === 'cloud' ? { translationOptions: { endpoint: translation.cloudEndpoint, model: translation.cloudModel, apiFormat: translation.cloudApiFormat, contextWindow: translation.cloudContextWindow, maxOutputTokens: translation.cloudMaxOutputTokens } } : {}),
    ...(translation.provider === 'microsoft' ? { translationOptions: { endpoint: translation.microsoftEndpoint, region: translation.microsoftRegion } } : {}),
    browserTimeline: { epoch: request.epoch, videoTimeMs: request.videoTimeMs, playbackRate: request.playbackRate },
  }
}

/** The random pipe and authentication secret are published only in the current user's directory. */
export class BrowserConnection {
  private server: Server | null = null
  private readonly clients = new Set<Client>()
  private readonly token = randomBytes(32).toString('hex')
  private readonly pipe = `\\\\.\\pipe\\nola-browser-${process.pid}-${randomBytes(16).toString('hex')}`
  private readonly directory = join(process.env.LOCALAPPDATA ?? app.getPath('userData'), 'Nola', 'Browser')
  private registered = false
  private enabled = false
  /**
   * Off until the desktop turns it on, so a freshly launched app shows the extension as
   * unable to connect rather than silently accepting captions.
   */
  private captionServiceActive = false
  private disposing = false
  private operation = 0
  private mutation: Promise<void> = Promise.resolve()
  private readonly cleanup = new Set<Promise<void>>()
  private error: string | undefined
  private devices: AudioDevice[] = []
  private debugLogPath: string | null = null
  constructor(private readonly options: BrowserConnectionOptions) {
    options.engine.on('event', this.onEvent)
    options.engine.on('state', this.onState)
    this.debugLog('connection', { pid: process.pid })
    /*
     * A channel of its own rather than another `browser:connection` action: the gate is not
     * about whether the pipe is up, and the status it answers with is what the video-captions
     * page paints. It returns the status instead of a bare boolean so the caller reads the
     * value that is now in force, not the one it asked for.
     */
    ipcMain.handle(CAPTION_SERVICE_CHANNEL, (_event, active: unknown) => {
      if (typeof active !== 'boolean') throw new Error('invalidConfiguration')
      this.setCaptionServiceActive(active)
      return this.status()
    })
    ipcMain.handle(CHANNEL, async (_event, action: unknown, enabled?: unknown, browser?: unknown) => {
      if (action === 'status') { await options.integrations?.inspect(); return this.status() }
      if (action === 'download' || action === 'manage' || action === 'browserEnable') {
        if (browser !== 'chrome' && browser !== 'edge') throw new Error('invalidConfiguration')
        if (action === 'download') {
          const zip = this.extensionZip()
          await access(zip)
          const result = await dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), `Nola-${browser === 'chrome' ? 'Chrome' : 'Edge'}-Extension.zip`), filters: [{ name: 'ZIP', extensions: ['zip'] }] })
          if (!result.canceled && result.filePath && resolve(zip) !== resolve(result.filePath)) await copyFile(zip, result.filePath)
        } else {
          if (!options.integrations) throw new Error('invalidConfiguration')
          if (action === 'manage') await options.integrations.manage(browser)
          else {
            if (typeof enabled !== 'boolean') throw new Error('invalidConfiguration')
            await options.integrations.setEnabled(browser, enabled)
            if (!enabled) for (const client of this.clients) if (client.browser === browser) client.socket.destroy()
          }
        }
        return this.status()
      }
      if (action === 'repair') { await this.register(); return this.status() }
      if (action === 'extension') {
        const zip = this.extensionZip()
        await access(zip)
        shell.showItemInFolder(zip)
        return this.status()
      }
      if (action === 'enable' && typeof enabled === 'boolean') {
        const operation = ++this.operation
        if (enabled) await this.register()
        if (operation !== this.operation || this.disposing) return this.status()
        await this.options.setEnabled(enabled)
        if (operation !== this.operation || this.disposing) return this.status()
        await this.setEnabled(enabled)
        return this.status()
      }
      throw new Error('invalidConfiguration')
    })
  }
  private extensionZip(): string { return app.isPackaged ? join(process.resourcesPath, 'browser', 'Nola-Browser-Extension.zip') : resolve('release/Nola-Browser-Extension.zip') }
  /**
   * One JSON line per observation, appended to the same file the engine writes, so the whole
   * pipeline can be read in order. A line that cannot be written is dropped: the log exists to
   * explain a failure and must never become one.
   */
  private debugLog(event: string, data?: Record<string, unknown>): void {
    try {
      this.debugLogPath ??= join(resolveDataRoot(), 'pipeline-debug.jsonl')
      appendFileSync(this.debugLogPath, `${JSON.stringify({ atMs: Date.now(), layer: 'main', event, ...data })}\n`)
    } catch (error) {
      console.warn('the pipeline debug log could not be appended to', error)
    }
  }
  /** Read-only: reading this never starts the engine, so it is safe to ask before a warm-up. */
  engineState(): EngineProcessState { return this.options.engine.currentState }
  /**
   * Opens or closes the gate every `start` is held to. In-memory and per app run, so the
   * service starts closed however the last run left it.
   */
  setCaptionServiceActive(active: boolean): void { this.captionServiceActive = active }
  status(): BrowserConnectionStatus {
    const connected = [...this.clients].filter(c => c.authenticated && this.options.integrations?.allows(c.browser) !== false)
    // One session at a time by construction, so the first owner is the session; deriving both
    // fields from it keeps `sessionActive` and `sessionId` from ever disagreeing.
    const sessionId = [...this.clients].find(c => c.authenticated && c.sessionId)?.sessionId ?? undefined
    return { enabled: this.enabled, registered: this.registered, connections: connected.length, captionServiceActive: this.captionServiceActive, sessionActive: sessionId !== undefined, ...(sessionId ? { sessionId } : {}), ...(this.options.integrations ? { browsers: this.options.integrations.snapshot.map(row => ({ ...row, connected: connected.some(client => client.browser === row.browser), ...(connected.some(client => client.browser === row.browser) ? { extensionStatus: 'installed' as const } : {}) })) } : {}), ...(this.error ? { error: this.error } : {}) }
  }
  async initialize(enabled: boolean): Promise<void> {
    const operation = this.operation
    await this.options.integrations?.inspect()
    try {
      await access(join(this.directory, 'native-host.json'))
      this.registered = true
    } catch { this.registered = false }
    if (enabled && !this.disposing && operation === this.operation) {
      await this.register()
      if (!this.disposing && operation === this.operation) await this.setEnabled(true)
    }
  }
  async register(): Promise<void> {
    if (process.platform !== 'win32') throw new Error('Windows is required')
    const executable = app.isPackaged ? join(process.resourcesPath, 'browser', 'NolaBrowserHost.exe') : resolve('artifacts/browser-host/NolaBrowserHost.exe')
    await access(executable)
    await mkdir(this.directory, { recursive: true })
    // A host descriptor carries the pipe secret. Remove inherited permissions before publishing it.
    const { stdout } = await run('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true })
    const sid = stdout.match(/S-1-5-[0-9-]+/)?.[0]
    if (!sid) throw new Error('Unable to identify Windows user')
    await run('icacls.exe', [this.directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true })
    const manifest = join(this.directory, 'native-host.json')
    await writeFile(manifest, JSON.stringify({ name: BROWSER_HOST_NAME, description: 'Nola browser captions connection', path: executable, type: 'stdio', allowed_origins: [`chrome-extension://${BROWSER_EXTENSION_ID}/`] }))
    for (const browser of ['Google\\Chrome', 'Microsoft\\Edge']) {
      await run('reg.exe', ['add', `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${BROWSER_HOST_NAME}`, '/ve', '/t', 'REG_SZ', '/d', manifest, '/f'], { windowsHide: true })
    }
    this.registered = true
    this.error = undefined
  }
  setEnabled(enabled: boolean): Promise<void> {
    const operation = ++this.operation
    this.enabled = enabled && !this.disposing
    const task = this.mutation.catch(() => undefined).then(() => this.applyEnabled(enabled, operation))
    this.mutation = task.catch(() => undefined)
    return task
  }
  private async applyEnabled(enabled: boolean, operation: number): Promise<void> {
    if (operation !== this.operation) return
    if (enabled && this.disposing) return
    if (!enabled) {
      for (const client of this.clients) client.socket.destroy()
      const server = this.server
      this.server = null
      if (server) await new Promise<void>(resolveClose => server.close(() => resolveClose()))
      await rm(join(this.directory, 'connection.json'), { force: true })
      await Promise.allSettled([...this.cleanup])
      return
    }
    if (!this.server) {
      await mkdir(this.directory, { recursive: true })
      if (operation !== this.operation || this.disposing) return
      const server = createServer(socket => this.accept(socket))
      this.server = server
      await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(this.pipe, () => { server.off('error', reject); resolveListen() }) })
      server.on('error', error => { this.error = error.message })
    }
    if (operation !== this.operation || this.disposing) return
    await writeFile(join(this.directory, 'connection.json'), JSON.stringify({ pipe: this.pipe, token: this.token, extensionId: BROWSER_EXTENSION_ID, protocolVersion: 1 }))
  }
  async dispose(): Promise<void> {
    this.disposing = true
    this.options.engine.off('event', this.onEvent)
    this.options.engine.off('state', this.onState)
    ipcMain.removeHandler(CHANNEL)
    ipcMain.removeHandler(CAPTION_SERVICE_CHANNEL)
    if (this.options.sessions.starting && this.options.sessions.browserActive) await this.options.sessions.cancelBrowserStart()
    const id = this.options.sessions.browserActive ? this.options.sessions.activeSessionId : null
    if (id) await this.options.sessions.stop(id).catch(() => undefined)
    await this.setEnabled(false)
  }
  private accept(socket: Socket): void {
    const client: Client = { socket, browser: 'chrome', authenticated: false, sessionId: null, starting: false, closed: false, pending: 0, pendingAudioMs: 0, audioWindow: { count: 0, lastBytes: 0, lastAudioMs: 0, loggedAtMs: 0 } }
    this.clients.add(client)
    let buffer = Buffer.alloc(0)
    const authenticationDeadline = setTimeout(() => socket.destroy(), 5000)
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      clearTimeout(authenticationDeadline)
      client.closed = true
      this.clients.delete(client)
      if (!this.disposing) {
        const task = client.sessionId ? this.options.sessions.stop(client.sessionId) : client.starting ? this.options.sessions.cancelBrowserStart() : null
        if (task) { this.cleanup.add(task); void task.finally(() => this.cleanup.delete(task)).catch(() => undefined) }
      }
    })
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      let end: number
      while ((end = buffer.indexOf(10)) >= 0) {
        const line = buffer.subarray(0, end)
        buffer = buffer.subarray(end + 1)
        if (line.length > MAX_MESSAGE) { socket.destroy(); return }
        let value: unknown
        try { value = JSON.parse(line.toString('utf8')) } catch { socket.destroy(); return }
        if (!client.authenticated) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) { socket.destroy(); return }
          const auth = value as Record<string, unknown>
          const token = typeof auth.token === 'string' ? Buffer.from(auth.token) : Buffer.alloc(0)
          const expected = Buffer.from(this.token)
          if (!this.enabled || auth.extensionId !== BROWSER_EXTENSION_ID || auth.protocolVersion !== 1 || token.length !== expected.length || !timingSafeEqual(token, expected)) { socket.destroy(); return }
          client.authenticated = true
          clearTimeout(authenticationDeadline)
          continue
        }
        const parsed = browserRequestSchema.safeParse(value)
        if (!parsed.success) { socket.destroy(); return }
        const request = parsed.data
        let audioMs = 0
        if (request.type === 'audio') {
          const bytes = Buffer.from(request.pcmBase64, 'base64').length
          audioMs = bytes / 2 / request.sampleRate * 1000
          const window = client.audioWindow
          window.count++
          window.lastBytes = bytes
          window.lastAudioMs = audioMs
          if (Date.now() - window.loggedAtMs >= AUDIO_LOG_INTERVAL_MS) {
            window.loggedAtMs = Date.now()
            this.debugLog('audio', { count: window.count, lastBytes: bytes, lastAudioMs: audioMs, pendingAudioMs: client.pendingAudioMs })
            window.count = 0
          }
          if (bytes < 2 || bytes % 2 || audioMs > 200 || client.pendingAudioMs + audioMs > 2000) {
            this.debugLog('audioRejected', { reason: 'guard', bytes, audioMs, pendingAudioMs: client.pendingAudioMs, sampleRate: request.sampleRate })
            this.send(client, { type: 'error', id: request.id, code: 'audioBufferOverflow', message: 'audioBufferOverflow' })
            if (client.sessionId) void this.options.sessions.stop(client.sessionId).catch(() => undefined)
            continue
          }
        } else if (client.pending >= 24 && request.type !== 'stop' && request.type !== 'reset' && request.type !== 'debug') { socket.destroy(); return }
        client.pending++
        client.pendingAudioMs += audioMs
        void this.handle(client, request).finally(() => { client.pending--; client.pendingAudioMs -= audioMs }).catch(() => socket.destroy())
      }
      if (buffer.length > MAX_MESSAGE) socket.destroy()
    })
  }
  private send(client: Client, response: BrowserResponse): void {
    if (client.closed) return
    if (client.socket.writableLength > 2 * 1024 * 1024) { client.socket.destroy(); return }
    client.socket.write(`${JSON.stringify(response)}\n`)
  }
  private async handle(client: Client, request: BrowserRequest): Promise<void> {
    try {
      if (!this.enabled || this.disposing) throw new Error('browserConnectionDisabled')
      if (request.type === 'hello') client.browser = request.browser ?? 'chrome'
      /*
       * Answered before every other check and outside the session owner test below, because a
       * diagnostic is worth having exactly when the session is in trouble. The engine call is
       * fire-and-forget: its failure is already in the log, and reporting it to the extension
       * would only add a rejection for it to handle on a path that must stay silent.
       */
      if (request.type === 'debug') {
        this.debugLog('ext.forward', { event: request.event, data: request.data })
        void this.options.engine.request(
          { protocolVersion: 1, type: 'debugLog', requestId: `debug-${randomUUID()}`, layer: 'ext', event: request.event, data: request.data ?? {} },
          'debugLogged',
          2000,
        ).catch(error => { this.debugLog('ext.forwardFailed', { event: request.event, message: error instanceof Error ? error.message : String(error) }) })
        this.send(client, { type: 'result', id: request.id })
        return
      }
      if (this.options.integrations && !this.options.integrations.allows(client.browser)) {
        this.send(client, { type: 'error', id: request.id, code: 'browserConnectionDisabled', message: 'browserConnectionDisabled' })
        client.socket.end()
        return
      }
      const { engine, sessions } = this.options
      if (request.type === 'runtimeSettings') {
        const main = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && !window.webContents.getURL().includes('overlay=1'))
        if (main) {
          if (main.isMinimized()) main.restore()
          main.show(); main.focus()
          main.webContents.send('app:appearance-requested', request.component === 'engine' ? 'torch' : 'llama')
        }
        this.send(client, { type: 'result', id: request.id })
        return
      }
      if (request.type === 'hello') {
        await sessions.ensureReady()
        const settings = this.options.getSettings()
        this.send(client, { type: 'result', id: request.id, value: { protocolVersion: 1, uiLanguage: settings.uiLanguage, sourceLanguage: settings.recognition.sourceLanguage, targetLanguage: settings.translation.targetLanguage, devices: this.devices, browserAudio: engine.supports('browserAudio'), captionServiceActive: this.captionServiceActive, config: browserCaptionConfig(settings) } })
        return
      }
      if (request.type === 'start') {
        // Checked before the busy check: a closed gate admits no session at all, so reporting
        // "already running" would name a fault the extension cannot have.
        if (!this.captionServiceActive) throw new Error('captionServiceOff')
        if (client.starting || client.sessionId) throw new Error('sessionAlreadyRunning')
        client.starting = true
        this.debugLog('start', { source: request.source, streamId: request.streamId, epoch: request.epoch })
        try {
          const started = await sessions.start(browserSessionConfig(this.options.getSettings(), request), 'browser')
          client.sessionId = started.sessionId
          // The client stays in the set unless its socket died, so a session unwound here has to
          // drop the id too — otherwise status() advertises a session that no longer exists.
          if (client.closed || !this.enabled || this.options.integrations?.allows(client.browser) === false) { client.sessionId = null; await sessions.stop(started.sessionId); return }
          this.send(client, { type: 'result', id: request.id, value: { sessionId: started.sessionId } })
        } finally { client.starting = false }
        return
      }
      if (client.sessionId !== request.sessionId) throw new Error('sessionNotRunning')
      sessions.assertOwner(request.sessionId, 'browser')
      if (request.type === 'stop') { this.debugLog('stop', { sessionId: request.sessionId }); await sessions.stop(request.sessionId); client.sessionId = null }
      else if (request.type === 'finish') { this.debugLog('finish', { epoch: request.epoch }); await engine.request({ protocolVersion: 1, type: 'finishStream', requestId: request.id, sessionId: request.sessionId, epoch: request.epoch }, 'streamFinished', 10_000) }
      else if (request.type === 'pause') { this.debugLog('pause', { paused: request.paused }); await sessions.pause(request.sessionId, request.paused) }
      else if (request.type === 'reset') {
        this.debugLog('reset', { epoch: request.epoch, videoTimeMs: request.videoTimeMs, playbackRate: request.playbackRate })
        await engine.request({ protocolVersion: 1, type: 'resetStream', requestId: request.id, sessionId: request.sessionId, epoch: request.epoch, videoTimeMs: request.videoTimeMs, playbackRate: request.playbackRate }, 'streamReset', 30_000)
      } else {
        const { id, type: _type, ...audio } = request
        try {
          await engine.request({ protocolVersion: 1, type: 'pushAudio', requestId: id, ...audio }, 'audioAccepted', 2000)
          this.debugLog('audioAccepted', { sequence: audio.sequence, ok: true })
        } catch (error) {
          const code = publicErrorCode(error)
          this.debugLog('audioAccepted', { sequence: audio.sequence, ok: false, code })
          throw error
        }
      }
      this.send(client, { type: 'result', id: request.id })
    } catch (error) {
      const code = publicErrorCode(error)
      this.send(client, { type: 'error', id: request.id, code, message: code })
      if (request.type === 'audio' && client.sessionId) { const id = client.sessionId; client.sessionId = null; await this.options.sessions.stop(id).catch(() => undefined) }
    }
  }
  private readonly onEvent = (event: EngineEvent): void => {
    // Reuse desktop device discovery: summary polling must not open PortAudio in the command loop.
    if (event.type === 'devices') { this.devices = event.devices.filter(device => device.kind === 'systemOutput'); return }
    if (event.type !== 'caption' && event.type !== 'sessionStopped' && event.type !== 'error') return
    for (const client of this.clients) {
      if (!client.sessionId || ('sessionId' in event && event.sessionId !== client.sessionId)) continue
      if (event.type === 'error' && !this.options.sessions.browserActive) continue
      // Provider diagnostics can quote request credentials; the extension only needs the code.
      const safeEvent = event.type === 'error' ? { ...event, details: undefined } : event
      this.send(client, { type: 'event', event: safeEvent })
      if (event.type === 'sessionStopped') client.sessionId = null
    }
  }
  private readonly onState = (state: string): void => {
    if (['failed', 'recovering', 'stopped'].includes(state)) for (const client of this.clients) if (client.sessionId) client.socket.destroy()
  }
}
