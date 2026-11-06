import { randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import { spawn } from 'node:child_process'
import { clipboard, dialog, type BrowserWindow } from 'electron'
import { gameCommandSchema, gameDocumentSchema, gameProfileSchema, type GameDocument, type GameSnapshot, type GameProfile } from '../shared/game-translation'
import { screenConfigSchema, screenTranslationModel, type ScreenSnapshot } from '../shared/screen-translation'
import { resolveGlossaryTerms } from '../shared/glossary-match'
import { emptyGlossary, type GlossaryDocument } from '../shared/glossary'
import type { AppSettings } from '../shared/settings'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import type { ScreenTranslation } from './screen-translation'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { GameHook, type GameHookEvent } from './game-hook'
import { GameSubtitleWindow } from './game-overlay'

interface GameTranslationOptions {
  mainDir: string; configPath: string; screen: ScreenTranslation; settings(): AppSettings
  gatewaySnapshot(): Pick<ModelGatewaySnapshot, 'state' | 'availableModels'>
  inferModel(request: DirectModelRequest, signal: AbortSignal): Promise<DirectModelResult>
  glossary?(): Promise<GlossaryDocument>; publish(snapshot: GameSnapshot): void
  getMainWindow?(): BrowserWindow | null; activity?: FeatureActivity
  hookRoot?: string
}

export class GameTranslation {
  private document: GameDocument = { version: 1, revision: 0, profiles: [] }
  private state: Omit<GameSnapshot, keyof GameDocument> = { status: 'idle', lines: [], hookAvailable: false }
  private readonly ready: Promise<void>
  private writes = Promise.resolve()
  private epoch = 0
  private connection = 0
  private abort = new AbortController()
  private timer?: ReturnType<typeof setInterval>
  private lastText = ''
  private pendingText?: string
  private translating = false
  private connecting = false
  private lease?: FeatureLease
  private readonly unsubscribe: () => void
  private readonly hook?: GameHook
  private readonly hookTexts = new Map<string, string>()
  private effectiveSignature = ''
  private readonly overlay: GameSubtitleWindow

  constructor(private readonly options: GameTranslationOptions) {
    this.overlay = new GameSubtitleWindow(options.mainDir, options.settings, () => {
      const activeGameId = this.state.activeGameId, lines = this.state.lines.filter(line => line.status !== 'translating')
      const cleanup = this.stop(), epoch = this.epoch
      void cleanup.then(() => { if (epoch === this.epoch) { this.state = { status: 'error', activeGameId, lines, error: 'targetUnavailable', hookAvailable: this.state.hookAvailable }; this.publish() } })
    })
    this.hook = options.hookRoot ? new GameHook(options.hookRoot) : undefined
    this.ready = readFile(options.configPath, 'utf8').then(raw => { this.document = gameDocumentSchema.parse(JSON.parse(raw)) }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }).then(async () => { this.state.hookAvailable = await this.hook?.available() ?? false })
    this.unsubscribe = options.screen.subscribe(snapshot => this.screenChanged(snapshot))
  }

  async snapshot(): Promise<GameSnapshot> { await this.ready; return structuredClone({ ...this.document, ...this.state }) }
  ownsOverlay(webContentsId: number): boolean { return this.overlay.owns(webContentsId) }
  async sources() { return (await this.options.screen.sources()).filter(source => source.kind === 'window') }

  async refreshGlossary(): Promise<void> {
    if (!this.options.glossary || !this.lastText || !this.state.activeGameId || this.state.status !== 'running' || this.state.source === 'ocr') return
    const profile = this.profile(this.state.activeGameId), epoch = this.epoch
    const match = resolveGlossaryTerms(await this.options.glossary(), { text: this.lastText, targetLanguage: profile.targetLanguage,
      context: { scenario: 'game', projectId: profile.id }, selection: profile.glossarySelection })
    if (epoch !== this.epoch || match.signature === this.effectiveSignature) return
    this.abort.abort(); this.abort = new AbortController(); ++this.epoch
    this.effectiveSignature = match.signature
    this.state.lines = this.state.lines.filter(line => line.text !== this.lastText)
    this.pendingText = this.lastText
    this.publish(); void this.drain()
  }

  async command(raw: unknown): Promise<GameSnapshot> {
    await this.ready
    const command = gameCommandSchema.parse(raw)
    if (command.action === 'add') {
      const parent = this.options.getMainWindow?.()
      const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Windows executable', extensions: ['exe'] }] }
      const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
      if (!result.canceled && result.filePaths[0]) {
        const executable = result.filePaths[0]
        if (extname(executable).toLowerCase() !== '.exe') throw new Error('invalidExecutable')
        await this.mutate(document => {
          if (document.profiles.some(profile => profile.executable?.toLowerCase() === executable.toLowerCase())) throw new Error('gameExists')
          document.profiles.push(gameProfileSchema.parse({ id: randomUUID(), name: basename(executable, extname(executable)).slice(0, 80), executable }))
        })
      }
    } else if (command.action === 'saveProfile') {
      await this.mutate(document => {
        if (document.revision !== command.expectedRevision) throw new Error('revisionConflict')
        const index = document.profiles.findIndex(profile => profile.id === command.profile.id)
        if (index < 0) throw new Error('gameNotFound')
        if (document.profiles[index].executable !== command.profile.executable) throw new Error('invalidExecutable')
        document.profiles[index] = command.profile
      })
      if (this.state.activeGameId === command.profile.id) await this.stop()
    } else if (command.action === 'deleteProfile') {
      await this.mutate(document => {
        if (document.revision !== command.expectedRevision) throw new Error('revisionConflict')
        document.profiles = document.profiles.filter(profile => profile.id !== command.id)
      })
      if (this.state.activeGameId === command.id) await this.stop()
    } else if (command.action === 'selectThreads') {
      if (command.sessionId !== this.state.sessionId || this.state.source !== 'hook') throw new Error('staleSession')
      if (command.ids.some(id => !this.state.threads?.some(thread => thread.id === id))) throw new Error('threadUnavailable')
      this.abort.abort(); this.abort = new AbortController(); ++this.epoch; this.pendingText = undefined; this.hookTexts.clear()
      this.lastText = ''
      this.overlay.clearCurrent()
      this.state.threads = this.state.threads?.map(thread => ({ ...thread, selected: command.ids.includes(thread.id) }))
      this.state.lines = this.state.lines.filter(line => line.status !== 'translating'); this.publish()
    } else if (command.action === 'insertHook') {
      if (command.sessionId !== this.state.sessionId || this.state.source !== 'hook') throw new Error('staleSession')
      this.hook?.insert(command.code)
    } else if (command.action === 'connect') await this.connect(command.id, command.sourceId)
    else if (command.action === 'launch') {
      const profile = this.profile(command.id)
      if (!profile.executable) throw new Error('invalidExecutable')
      await new Promise<void>((resolve, reject) => {
        const child = spawn(profile.executable!, [], { cwd: dirname(profile.executable!), detached: true, stdio: 'ignore', shell: false })
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
      })
    } else if (command.action === 'pause') {
      this.overlay.clearCurrent()
      this.abort.abort(); this.abort = new AbortController(); ++this.epoch; this.pendingText = undefined
      this.hookTexts.clear()
      this.state.lines = this.state.lines.filter(line => line.status !== 'translating')
      if (this.state.source === 'ocr') await this.options.screen.pause()
      this.state.status = 'paused'; this.publish()
    } else if (command.action === 'resume') {
      if (this.state.source === 'ocr') await this.options.screen.resume()
      if (this.state.activeGameId) { this.state.status = 'running'; this.lastText = ''; this.publish() }
    } else await this.stop()
    return this.snapshot()
  }

  private profile(id: string): GameProfile {
    const profile = this.document.profiles.find(item => item.id === id)
    if (!profile) throw new Error('gameNotFound')
    return profile
  }

  private async connect(id: string, sourceId?: string): Promise<void> {
    let profile = this.profile(id)
    const requested = ++this.connection
    if (profile.source === 'hook' && !this.state.hookAvailable) throw new Error('hookUnavailable')
    if (profile.source !== 'clipboard' && !(await this.sources()).some(source => source.id === sourceId)) throw new Error('targetUnavailable')
    if (requested !== this.connection) return
    const stopping = this.stop(), epoch = this.epoch, connection = this.connection
    await stopping
    if (epoch !== this.epoch || connection !== this.connection) return
    await this.options.screen.stop()
    if (epoch !== this.epoch || connection !== this.connection) return
    profile = this.profile(id)
    this.state = { status: 'running', lines: [], threads: [], sessionId: randomUUID(), hookAvailable: this.state.hookAvailable, activeGameId: id,
      source: profile.source === 'clipboard' ? 'clipboard' : this.state.hookAvailable && (profile.source === 'hook' || profile.source === 'auto') ? 'hook' : 'ocr' }
    await this.mutate(document => { const item = document.profiles.find(item => item.id === id); if (!item) throw new Error('gameNotFound'); item.lastOpenedAt = new Date().toISOString() })
    if (epoch !== this.epoch) return
    if (this.state.source === 'hook') {
      this.connecting = true
      try { await this.hook!.start(sourceId!, profile.executable, event => { if (connection === this.connection) this.hookChanged(event) }) }
      catch (error) {
        await this.hook?.stop()
        if (epoch !== this.epoch) return
        if (profile.source !== 'auto') { this.state.status = 'error'; this.state.error = error instanceof Error ? error.message : 'hookUnavailable'; this.publish(); return }
        this.state.source = 'ocr'; this.state.error = undefined
      }
      finally { this.connecting = false }
      if (epoch !== this.epoch) return
    }
    if (this.state.source === 'ocr') {
      this.connecting = true
      try { await this.options.screen.startForGame(id, screenConfigSchema.parse({ ...profile, captureMode: 'window', sourceId })) }
      finally { this.connecting = false }
      this.screenChanged(this.options.screen.snapshot())
    } else {
      if (this.state.source === 'clipboard' && this.options.gatewaySnapshot().state !== 'running') { this.state.status = 'error'; this.state.error = 'gatewayNotReady'; this.publish(); return }
      this.lease = this.options.activity?.acquire('game-translation', () => this.stop())
      this.lease?.running()
      this.overlay.begin(this.state.sessionId!, this.state.source === 'hook' ? sourceId : undefined)
      this.lastText = ''
      this.timer = setInterval(() => this.state.source === 'clipboard' ? this.readClipboard() : this.flushHook(), 150)
      if (this.state.source === 'clipboard') this.readClipboard()
    }
    this.publish()
  }

  private readClipboard(): void {
    if (this.state.status !== 'running' || this.state.source !== 'clipboard') return
    const text = clipboard.readText().trim()
    if (!text || text === this.lastText) return
    this.overlay.clearCurrent()
    this.lastText = text
    if (text.length > 16000) { this.state.error = 'textTooLong'; this.publish(); return }
    this.pendingText = text
    void this.drain()
  }

  private hookChanged(event: GameHookEvent): void {
    if (this.state.source !== 'hook') return
    const threads = this.state.threads ?? []
    if (event.type === 'thread') {
      if (threads.some(thread => thread.id === event.id)) return
      if (threads.length >= 256) { this.state.error = 'hookThreadLimit'; this.publish(); return }
      this.state.threads = [...threads, { id: event.id, name: event.name, code: event.code, preview: '', selected: false, embedSupported: event.embed }]
    } else if (event.type === 'text') {
      const thread = threads.find(thread => thread.id === event.id)
      if (!thread) return
      thread.preview = event.text
      if (thread.selected && this.state.status === 'running') this.hookTexts.set(thread.id, event.text)
    } else if (event.type === 'remove') {
      this.state.threads = threads.filter(thread => thread.id !== event.id); this.hookTexts.delete(event.id)
    } else if (event.type === 'error') this.state.error = event.code
    else if (event.type === 'disconnected') {
      this.abort.abort(); if (!this.connecting) ++this.epoch; this.pendingText = undefined; this.hookTexts.clear()
      this.state.status = 'error'; this.state.error = 'targetUnavailable'
      if (!this.connecting) {
        const activeGameId = this.state.activeGameId, lines = this.state.lines.filter(line => line.status !== 'translating')
        const cleanup = this.stop(), epoch = this.epoch
        void cleanup.then(() => { if (epoch === this.epoch) { this.state = { status: 'error', activeGameId, lines, error: 'targetUnavailable', hookAvailable: this.state.hookAvailable }; this.publish() } })
      }
    }
    this.publish()
  }

  private flushHook(): void {
    if (this.state.status !== 'running' || !this.hookTexts.size) return
    const text = this.state.threads?.filter(thread => thread.selected).map(thread => this.hookTexts.get(thread.id)).filter(Boolean).join('\n') ?? ''
    this.hookTexts.clear()
    if (!text || text === this.lastText) return
    this.overlay.clearCurrent()
    this.lastText = text; this.pendingText = text
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.translating || !this.pendingText || !this.state.activeGameId) return
    this.translating = true
    const text = this.pendingText; this.pendingText = undefined
    const epoch = this.epoch, signal = this.abort.signal, profile = this.profile(this.state.activeGameId)
    const line = { id: randomUUID(), text, status: 'translating' as const }
    this.state.lines = [...this.state.lines.slice(-199), line]; this.publish()
    try {
      if (this.options.gatewaySnapshot().state !== 'running') throw new Error('gatewayNotReady')
      const model = screenTranslationModel(screenConfigSchema.parse({}), this.options.settings())
      if (!model || !this.options.gatewaySnapshot().availableModels?.mt?.some(item => item.binding === model)) throw new Error('translationModelNotReady')
      const glossary = resolveGlossaryTerms(await this.options.glossary?.() ?? emptyGlossary(), { text, targetLanguage: profile.targetLanguage,
        context: { scenario: 'game', projectId: profile.id }, selection: profile.glossarySelection })
      if (epoch !== this.epoch || signal.aborted) return
      if (text === this.lastText) this.effectiveSignature = glossary.signature
      const result = await this.options.inferModel({ id: randomUUID(), kind: 'mt', model, text, source: profile.sourceLanguage, target: profile.targetLanguage,
        taskMode: 'realtime', glossary: glossary.terms }, AbortSignal.any([signal, AbortSignal.timeout(25000)]))
      if (epoch !== this.epoch || signal.aborted) return
      if (!result.text.trim()) throw new Error('translationFailed')
      this.state.lines = this.state.lines.map(item => item.id === line.id ? { ...item, translation: result.text, status: 'ready' } : item)
      this.state.error = undefined
    } catch (error) {
      if (epoch !== this.epoch || signal.aborted) return
      this.state.lines = this.state.lines.map(item => item.id === line.id ? { ...item, status: 'error' } : item)
      this.state.error = error instanceof Error && ['translationModelNotReady', 'gatewayNotReady'].includes(error.message) ? error.message : 'translationFailed'
    } finally {
      this.translating = false
      if (epoch === this.epoch) this.publish()
      if (this.state.status === 'running') void this.drain()
    }
  }

  private screenChanged(snapshot: ScreenSnapshot): void {
    if (this.connecting || !this.state.activeGameId || this.state.source !== 'ocr') return
    if (snapshot.gameId !== this.state.activeGameId) {
      this.state = { status: snapshot.status === 'error' ? 'error' : 'idle',
        activeGameId: snapshot.status === 'error' ? this.state.activeGameId : undefined,
        lines: snapshot.status === 'error' ? this.state.lines.filter(line => line.status !== 'translating') : [], error: snapshot.error, hookAvailable: this.state.hookAvailable }
      this.publish()
      return
    }
    this.state.status = snapshot.status === 'error' ? 'error' : snapshot.status === 'paused' ? 'paused' : snapshot.status === 'ready' ? 'idle' : 'running'
    this.state.error = snapshot.error
    this.state.lines = snapshot.blocks.map(block => ({ id: block.id, text: block.text, translation: block.translation,
      status: block.status === 'ready' ? 'ready' : block.status === 'error' ? 'error' : 'translating' }))
    this.publish()
  }

  async stop(): Promise<void> {
    ++this.connection; ++this.epoch; this.abort.abort(); this.abort = new AbortController()
    this.overlay.close()
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined; this.pendingText = undefined; this.lastText = ''
    this.effectiveSignature = ''
    this.hookTexts.clear()
    const wasOcr = this.state.source === 'ocr'
    const lease = this.lease; this.lease = undefined
    lease?.stopping()
    this.state = { status: 'idle', lines: [], hookAvailable: this.state.hookAvailable }
    await Promise.all([this.hook?.stop(), wasOcr ? this.options.screen.stop() : undefined])
    lease?.release()
    this.publish()
  }

  async dispose(): Promise<void> { await this.stop(); this.unsubscribe(); await this.writes.catch(() => {}) }

  private async mutate(change: (document: GameDocument) => void): Promise<void> {
    const next = this.writes.catch(() => {}).then(async () => {
      const document = structuredClone(this.document)
      change(document); document.revision++
      gameDocumentSchema.parse(document)
      await mkdir(dirname(this.options.configPath), { recursive: true })
      await writeFile(`${this.options.configPath}.tmp`, JSON.stringify(document), 'utf8')
      await rename(`${this.options.configPath}.tmp`, this.options.configPath)
      this.document = document; this.publish()
    })
    this.writes = next
    await next
  }

  private publish(): void {
    const snapshot = structuredClone({ ...this.document, ...this.state })
    this.overlay.update(snapshot)
    this.options.publish(snapshot)
  }
}
