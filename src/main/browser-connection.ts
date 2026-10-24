import { loggedHandle } from './logged-ipc'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createServer, type Server, type Socket } from 'node:net'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { logActivity, logDiagnostic } from './session-log'
import { mkdir, writeFile, access, rm, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { FIREFOX_EXTENSION_ID, BROWSER_EXTENSION_ID, BROWSER_EXTENSION_VERSION, BROWSER_HOST_NAME, browserRequestSchema, type BrowserCaptionConfig, type BrowserConnectionStatus, type BrowserRequest, type BrowserResponse, type BrowserKind, type BrowserWireErrorCode } from '../shared/browser'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import type { BrowserIntegrations } from './browser-integrations'
import type { AudioDevice, SessionConfig, EngineEvent, EngineProcessState, PrewarmConfig, PrewarmResult } from '../shared/contracts'
import { NO_TRANSLATION_LANGUAGE, type AppSettings } from '../shared/settings'
import type { EngineProcess } from './engine-process'
import type { SessionController } from './session-controller'
import { resolveDataRoot } from './data-root'

const run = promisify(execFile)
const CHANNEL = 'browser:connection'
const CAPTION_SERVICE_CHANNEL = 'browser:caption-service'
const MAX_MESSAGE = 160 * 1024
/** The extension stops waiting for a start after three minutes; the desktop gives the request up with it. */
const START_REQUEST_BUDGET_MS = 170_000
/** How often the desktop summarizes the audio it received; 10 chunks/second would be unreadable. */
const AUDIO_LOG_INTERVAL_MS = 1000
const LEGACY_BROWSER_ERROR_CODES: Readonly<Record<string, BrowserWireErrorCode>> = {
  sessionAlreadyRunning: 'browserSessionAlreadyRunning',
  sessionNotRunning: 'browserSessionNotRunning',
  browserConnectionDisabled: 'browserIntegrationDisabled',
  captionServiceOff: 'browserCaptionServiceDisabled',
  extensionVersionMismatch: 'browserExtensionVersionMismatch',
  audioBufferOverflow: 'browserAudioBacklog',
  appUnavailable: 'browserConnectionUnavailable',
  connectionLost: 'browserConnectionLost',
  permissionFailed: 'browserPermissionDenied',
  captureUnsupported: 'browserCaptureUnsupported',
  wrongCapture: 'browserCaptureTargetMismatch',
  captureCancelled: 'browserCaptureCancelled',
  tabAudioSilent: 'browserAudioSilent',
  slowAudio: 'browserAudioBacklog',
}
const PUBLIC_ERRORS = new Set<BrowserWireErrorCode>([
  'browserConnectionUnavailable', 'browserConnectionLost', 'browserPermissionDenied',
  'browserExtensionVersionMismatch', 'browserProtocolMismatch', 'browserCaptureUnsupported',
  'browserCaptureTargetMismatch', 'browserCaptureCancelled', 'browserAudioSilent',
  'browserAudioBacklog', 'browserSessionAlreadyRunning', 'browserSessionNotRunning',
  'browserCaptionServiceDisabled', 'browserIntegrationDisabled', 'internalError',
  'torchUnavailable', 'llamaUnavailable',
  'modelOutOfMemory', 'modelDependencyMissing', 'modelWeightsInvalid',
  'invalidMessage', 'unsupportedProtocol', 'invalidConfiguration', 'audioDeviceUnavailable',
  'modelUnavailable', 'resourceUnavailable', 'resourceBusy', 'lineTooLarge',
])

function publicErrorCode(error: unknown): BrowserWireErrorCode {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('FEATURE_CONFLICT:')) return 'browserSessionAlreadyRunning'
  const legacy = LEGACY_BROWSER_ERROR_CODES[message]
  if (legacy) return legacy
  if (message.startsWith('RUNTIME_TORCH:')) return 'torchUnavailable'
  if (message.startsWith('RUNTIME_LLAMA:')) return 'llamaUnavailable'
  if (PUBLIC_ERRORS.has(message as BrowserWireErrorCode)) return message as BrowserWireErrorCode
  console.error('browser request failed with an unmapped error', error)
  return 'internalError'
}
interface Client { socket: Socket; browser: BrowserKind; extensionVersion?: string; helloReceived: boolean; authenticated: boolean; sessionId: string | null; starting: boolean; closed: boolean; pending: number; pendingAudioMs: number; epoch: number; paused: boolean; audioGeneration: number; audioRequestPrefix: string; audioWindow: AudioWindow }
interface AudioWindow { count: number; lastBytes: number; lastAudioMs: number; loggedAtMs: number }
export interface BrowserConnectionOptions {
  engine: EngineProcess
  activity?: FeatureActivity
  sessions: SessionController
  getSettings(): AppSettings
  setEnabled(enabled: boolean): Promise<void>
  integrations?: BrowserIntegrations
  isOverlayVisible?(): boolean
}

/** The desktop's independent browser caption appearance and session audio source. */
export function browserCaptionConfig(settings: AppSettings): BrowserCaptionConfig {
  return {
    appearance: settings.browserCaptions,
    audioSource: settings.videoCaptions.audioSource ?? 'system',
    audioDeviceId: settings.videoCaptions.audioDeviceId,
    sourceLanguage: settings.recognition.sourceLanguage,
    targetLanguage: settings.translation.targetLanguage,
  }
}

export function browserSessionConfig(settings: AppSettings, request: Extract<BrowserRequest, { type: 'start' }>): SessionConfig {
  const translation = settings.translation
  // `defaultOutput` is a UI sentinel, not a WASAPI loopback device id. Older settings may still
  // carry it from the browser caption picker, so resolve it as the live system default.
  const deviceId = request.deviceId === 'defaultOutput' ? undefined : request.deviceId
  return {
    audioSource: request.source === 'tab' ? { kind: 'browserTab', streamId: request.streamId } : deviceId ? { kind: 'systemOutput', deviceId } : { kind: 'defaultOutput' },
    recognitionMode: 'realtime', recognitionModelId: settings.recognition.modelId,
    ...recognitionFieldsOf(settings.recognition),
    sourceLanguage: settings.recognition.sourceLanguage,
    targetLanguages: translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? [] : [translation.targetLanguage],
    translationProvider: translation.provider, translationModelId: translation.localModelId,
    allowIntermediateTranslation: supportsIntermediateTranslation(translation.provider) && translation.translateIntermediate,
    translationOptions: translationOptionsOf(translation),
    ...fallbackTranslationFieldsOf(translation),
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
  private captionServiceClosing: Promise<void> | null = null
  get captionServiceReserved(): boolean { return this.captionServiceActive || this.captionPreparation !== null || this.captionServiceClosing !== null }
  private disposing = false
  private operation = 0
  private mutation: Promise<void> = Promise.resolve()
  private readonly cleanup = new Set<Promise<void>>()
  private error: string | undefined
  private devices: AudioDevice[] = []
  private readonly audioRequestPrefix = `browser-audio-${randomUUID()}-`
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
    loggedHandle(CAPTION_SERVICE_CHANNEL, async (_event, active: unknown) => {
      if (typeof active !== 'boolean') throw new Error('invalidConfiguration')
      if (active && (options.sessions.busy || this.captionServiceClosing || options.isOverlayVisible?.())) throw new Error('sessionAlreadyRunning')
      if (active) this.setCaptionServiceActive(true)
      else await this.stopCaptionService()
      return this.status()
    })
    loggedHandle(CHANNEL, async (_event, action: unknown, enabled?: unknown, browser?: unknown) => {
      if (action === 'status') return this.status()
      if (action === 'inspect') { await options.integrations?.inspect(); return this.status() }
      if (action === 'download' || action === 'manage' || action === 'browserEnable') {
        if (browser !== 'chrome' && browser !== 'edge' && browser !== 'firefox') throw new Error('invalidConfiguration')
        if (action === 'download') {
          const zip = this.extensionZip(browser === 'firefox')
          await access(zip)
          const result = await dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), `Nola-${browser === 'firefox' ? 'Firefox' : browser === 'chrome' ? 'Chrome' : 'Edge'}-Extension.zip`), filters: [{ name: 'ZIP', extensions: ['zip'] }] })
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
        const zip = this.extensionZip(browser === 'firefox')
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
  private extensionZip(firefox = false): string { const name = firefox ? 'Nola-Firefox-Extension.zip' : 'Nola-Browser-Extension.zip'; return app.isPackaged ? join(process.resourcesPath, 'browser', name) : resolve('release', name) }
  /**
   * Route browser lifecycle and pipeline activity into the shared launch trace. Only
   * high-frequency successful audio observations are sampled; failures remain individual.
   */
  private debugLog(event: string, data?: Record<string, unknown>): void {
    if (/audio|ext\.forward/.test(event) && !/Failed|Rejected/.test(event)) logActivity(`browser.${event}`, data)
    else logDiagnostic(`browser.${event}`, data)
  }
  /** Read-only: reading this never starts the engine, so it is safe to ask before a warm-up. */
  engineState(): EngineProcessState { return this.options.engine.currentState }
  /**
   * Opens or closes the gate every `start` is held to. In-memory and per app run, so the
   * service starts closed however the last run left it.
   */
  private featureLease: FeatureLease | null = null
  private captionPreparation: Promise<PrewarmResult> | null = null
  private captionGeneration = 0
  prepareCaptionService(config: PrewarmConfig): Promise<PrewarmResult> {
    if (this.captionPreparation) return this.captionPreparation
    if (this.captionServiceActive) return Promise.resolve({ state: 'ready' })
    if (this.disposing || this.captionServiceClosing || this.options.sessions.busy || this.options.isOverlayVisible?.()) return Promise.resolve({ state: 'failed', code: 'sessionAlreadyRunning' })
    this.options.activity?.assertAvailable('browser-captions')
    if (this.options.activity?.snapshot().owner) throw new Error('FEATURE_CONFLICT:browser-captions')
    this.featureLease = this.options.activity?.acquire('browser-captions', () => this.stopCaptionService()) ?? null
    const generation = this.captionGeneration
    const task = (async (): Promise<PrewarmResult> => {
      try {
        const result = await this.options.sessions.prewarm(config)
        if (result.state === 'ready' && generation === this.captionGeneration && !this.disposing && !this.captionServiceClosing) {
          this.setCaptionServiceActive(true)
          return result
        }
        await this.stopCaptionService()
        return result.state === 'ready' ? { state: 'failed', code: 'resourceBusy' } : result
      } catch (error) {
        await this.stopCaptionService()
        throw error
      }
    })().finally(() => { if (this.captionPreparation === task) this.captionPreparation = null })
    this.captionPreparation = task
    return task
  }
  setCaptionServiceActive(active: boolean): void {
    if (active && !this.captionServiceActive) {
      this.options.activity?.assertAvailable('browser-captions')
      if (this.options.activity?.snapshot().owner && !this.featureLease) throw new Error('FEATURE_CONFLICT:browser-captions')
      if (!this.options.activity?.snapshot().owner) this.featureLease = this.options.activity?.acquire('browser-captions', () => this.stopCaptionService()) ?? null
      this.featureLease?.running()
    }
    this.captionServiceActive = active
    if (!active && !this.captionServiceClosing) { this.featureLease?.release(); this.featureLease = null }
  }
  async stopCaptionService(): Promise<void> {
    if (this.captionServiceClosing) return this.captionServiceClosing
    this.captionGeneration++
    this.captionServiceActive = false
    this.featureLease?.stopping()
    const closing = (async () => {
      try {
        if (this.options.sessions.browserActive || this.options.sessions.browserServiceStarting) await this.options.sessions.stopCurrent()
        if (!this.options.sessions.busy && this.options.engine.currentState === 'ready') {
          await this.options.engine.request({ protocolVersion: 1, type: 'releaseModels', requestId: `release-${randomUUID()}` }, 'modelsReleased', 60_000)
        }
      } catch (error) {
        console.error('browser caption teardown failed; stopping engine', error)
        await this.options.engine.stop()
      } finally {
        this.featureLease?.release()
        this.featureLease = null
      }
    })()
    this.captionServiceClosing = closing
    try { await closing } finally { if (this.captionServiceClosing === closing) this.captionServiceClosing = null }
  }
  status(): BrowserConnectionStatus {
    const connected = [...this.clients].filter(c => c.authenticated && this.options.integrations?.allows(c.browser) !== false)
    // One session at a time by construction, so the first owner is the session; deriving both
    // fields from it keeps `sessionActive` and `sessionId` from ever disagreeing.
    const sessionId = [...this.clients].find(c => c.authenticated && c.sessionId)?.sessionId ?? undefined
    const browsers = this.options.integrations?.snapshot.map(row => {
      const live = connected.filter(client => client.browser === row.browser && client.helloReceived)
      // A live old tab can outlast reloading an unpacked extension; its handshake outranks the disk manifest.
      const client = live.find(item => item.extensionVersion !== BROWSER_EXTENSION_VERSION) ?? live[0]
      return { ...row, available: row.available || !!client, connected: connected.some(item => item.browser === row.browser), ...(client ? { extensionStatus: 'installed' as const, extensionVersion: client.extensionVersion, extensionCompatible: client.extensionVersion === BROWSER_EXTENSION_VERSION } : {}) }
    })
    return { enabled: this.enabled, registered: this.registered, connections: connected.length, captionServiceActive: this.captionServiceActive, sessionActive: sessionId !== undefined, sessionStarting: this.options.sessions.browserServiceStarting || this.captionServiceClosing !== null, overlayActive: this.options.isOverlayVisible?.() ?? false, ...(sessionId ? { sessionId } : {}), ...(browsers ? { browsers } : {}), ...(this.error ? { error: this.error } : {}) }
  }
  async initialize(enabled: boolean): Promise<void> {
    const operation = this.operation
    await this.options.integrations?.inspect()
    try {
      await access(join(this.directory, 'native-host.json'))
      await access(join(this.directory, 'native-host-firefox.json'))
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
    const firefoxManifest = join(this.directory, 'native-host-firefox.json')
    await writeFile(firefoxManifest, JSON.stringify({ name: BROWSER_HOST_NAME, description: 'Nola browser captions connection', path: executable, type: 'stdio', allowed_extensions: [FIREFOX_EXTENSION_ID] }))
    await run('reg.exe', ['add', `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${BROWSER_HOST_NAME}`, '/ve', '/t', 'REG_SZ', '/d', firefoxManifest, '/f'], { windowsHide: true })
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
    await this.stopCaptionService().catch(() => undefined)
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
    const client: Client = { socket, browser: 'chrome', helloReceived: false, authenticated: false, sessionId: null, starting: false, closed: false, pending: 0, pendingAudioMs: 0, epoch: 0, paused: false, audioGeneration: 0, audioRequestPrefix: `${this.audioRequestPrefix}${randomUUID()}-`, audioWindow: { count: 0, lastBytes: 0, lastAudioMs: 0, loggedAtMs: 0 } }
    this.clients.add(client)
    let buffer = Buffer.alloc(0)
    const authenticationDeadline = setTimeout(() => socket.destroy(), 5000)
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      clearTimeout(authenticationDeadline)
      client.closed = true
      client.audioGeneration++
      client.pendingAudioMs = 0
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
          if (request.sessionId === client.sessionId && (request.epoch < client.epoch || client.paused)) {
            this.send(client, { type: 'result', id: request.id })
            continue
          }
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
        const queuedEpoch = client.epoch
        void this.handle(client, request).finally(() => {
          client.pending--
          if (queuedEpoch === client.epoch) client.pendingAudioMs = Math.max(0, client.pendingAudioMs - audioMs)
        }).catch(() => socket.destroy())
      }
      if (buffer.length > MAX_MESSAGE) socket.destroy()
    })
  }
  private send(client: Client, response: BrowserResponse): void {
    if (client.closed) return
    if (client.socket.writableLength > 2 * 1024 * 1024) { client.socket.destroy(); return }
    const payload = JSON.stringify(response)
    // A frame past the protocol limit would be cut off mid-message on the other side, so the
    // request it answers is failed with a code that names the reason. The connection stays up:
    // only this frame was too large, and the framing itself is still intact.
    if (Buffer.byteLength(payload) > MAX_MESSAGE) {
      this.debugLog('sendRejected', { reason: 'frameTooLarge', bytes: Buffer.byteLength(payload) })
      if (response.type === 'result' || response.type === 'error') {
        client.socket.write(`${JSON.stringify({ type: 'error', id: response.id, code: 'lineTooLarge', message: 'lineTooLarge' })}\n`)
      }
      return
    }
    client.socket.write(`${payload}\n`)
  }
  private async handle(client: Client, request: BrowserRequest): Promise<void> {
    const audioGeneration = client.audioGeneration
    const audioSessionId = client.sessionId
    try {
      if (!this.enabled || this.disposing) throw new Error('browserConnectionDisabled')
      if (request.type === 'hello') {
        client.browser = request.browser ?? 'chrome'
        client.extensionVersion = request.extensionVersion
        client.helloReceived = true
      }
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
        this.send(client, { type: 'error', id: request.id, code: 'browserIntegrationDisabled', message: 'browserIntegrationDisabled' })
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
        /*
         * The engine is only woken for a gate that admits a caption session: a page that merely
         * loads the extension would otherwise leave a Python process behind on a desktop whose
         * caption service is off.
         */
        if (this.captionServiceActive) await sessions.ensureReady()
        const settings = this.options.getSettings()
        this.send(client, { type: 'result', id: request.id, value: { protocolVersion: 1, extensionVersion: BROWSER_EXTENSION_VERSION, extensionCompatible: client.extensionVersion === BROWSER_EXTENSION_VERSION, uiLanguage: settings.uiLanguage, sourceLanguage: settings.recognition.sourceLanguage, targetLanguage: settings.translation.targetLanguage, devices: this.devices, browserAudio: engine.supports('browserAudio'), captionServiceActive: this.captionServiceActive, config: browserCaptionConfig(settings) } })
        return
      }
      if (request.type === 'start') {
        if (client.extensionVersion !== BROWSER_EXTENSION_VERSION) {
          this.send(client, { type: 'error', id: request.id, code: 'browserExtensionVersionMismatch', message: 'browserExtensionVersionMismatch' })
          return
        }
        // Checked before the busy check: a closed gate admits no session at all, so reporting
        // "already running" would name a fault the extension cannot have.
        if (!this.captionServiceActive) throw new Error('captionServiceOff')
        if (client.starting || client.sessionId) throw new Error('sessionAlreadyRunning')
        client.starting = true
        this.debugLog('start', { source: request.source, streamId: request.streamId, epoch: request.epoch })
        /*
         * The extension stops waiting for a start after three minutes, so the desktop gives the
         * request up with it: a session that lands afterwards has no client left to own it and
         * would keep the models loaded for a session the user already sees as ended.
         */
        let abandoned = false
        const budget = setTimeout(() => {
          abandoned = true
          void this.options.sessions.cancelBrowserStart().catch(() => undefined)
        }, START_REQUEST_BUDGET_MS)
        try {
          const started = await sessions.start(browserSessionConfig(this.options.getSettings(), request), 'browser')
          if (abandoned) {
            await sessions.stop(started.sessionId).catch(() => undefined)
            return
          }
          client.sessionId = started.sessionId
          client.audioGeneration++
          client.epoch = request.epoch
          client.paused = false
          client.pendingAudioMs = 0
          // The client stays in the set unless its socket died, so a session unwound here has to
          // drop the id too — otherwise status() advertises a session that no longer exists.
          if (client.closed || !this.enabled || this.options.integrations?.allows(client.browser) === false) { client.sessionId = null; await sessions.stop(started.sessionId); return }
          this.send(client, { type: 'result', id: request.id, value: { sessionId: started.sessionId } })
        } finally { clearTimeout(budget); client.starting = false }
        return
      }
      if (client.sessionId !== request.sessionId) throw new Error('sessionNotRunning')
      sessions.assertOwner(request.sessionId, 'browser')
      if (request.type === 'stop') { this.debugLog('stop', { sessionId: request.sessionId }); await sessions.stop(request.sessionId); client.sessionId = null }
      else if (request.type === 'finish') { this.debugLog('finish', { epoch: request.epoch }); await engine.request({ protocolVersion: 1, type: 'finishStream', requestId: request.id, sessionId: request.sessionId, epoch: request.epoch }, 'streamFinished', 10_000) }
      else if (request.type === 'pause') { if (request.paused) client.audioGeneration++; client.paused = request.paused; this.debugLog('pause', { paused: request.paused }); await sessions.pause(request.sessionId, request.paused) }
      else if (request.type === 'reset') {
        client.audioGeneration++
        client.epoch = request.epoch
        client.pendingAudioMs = 0
        this.debugLog('reset', { epoch: request.epoch, videoTimeMs: request.videoTimeMs, playbackRate: request.playbackRate })
        await engine.request({ protocolVersion: 1, type: 'resetStream', requestId: request.id, sessionId: request.sessionId, epoch: request.epoch, videoTimeMs: request.videoTimeMs, playbackRate: request.playbackRate }, 'streamReset', 30_000)
      } else {
        const { id: _id, type: _type, ...audio } = request
        // PushAudio errors are answered by this request, not broadcast as session failures.
        const engineRequestId = `${client.audioRequestPrefix}${randomUUID()}`
        try {
          await engine.request({ protocolVersion: 1, type: 'pushAudio', requestId: engineRequestId, ...audio }, 'audioAccepted', 2000)
          this.debugLog('audioAccepted', { sequence: audio.sequence, ok: true })
        } catch (error) {
          const code = publicErrorCode(error)
          this.debugLog('audioAccepted', { sequence: audio.sequence, ok: false, code })
          throw error
        }
      }
      this.send(client, { type: 'result', id: request.id })
    } catch (error) {
      if (request.type === 'audio' && (client.closed || audioSessionId !== client.sessionId || audioGeneration !== client.audioGeneration || request.epoch !== client.epoch || client.paused)) {
        this.send(client, { type: 'result', id: request.id })
        return
      }
      const code = publicErrorCode(error)
      this.send(client, { type: 'error', id: request.id, code, message: code })
      if (request.type === 'audio' && client.sessionId) { const id = client.sessionId; client.sessionId = null; await this.options.sessions.stop(id).catch(() => undefined) }
    }
  }
  private readonly onEvent = (event: EngineEvent): void => {
    // The request promise routes audio failures; the prefix also identifies replies arriving after its timeout.
    if (event.type === 'error' && event.requestId.startsWith(this.audioRequestPrefix)) return
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
    if (state === 'failed' || state === 'recovering') this.setCaptionServiceActive(false)
    if (['failed', 'recovering', 'stopped'].includes(state)) for (const client of this.clients) if (client.sessionId) client.socket.destroy()
  }
}
import { fallbackTranslationFieldsOf, recognitionFieldsOf, supportsIntermediateTranslation, translationOptionsOf } from '../shared/cloud-config'
