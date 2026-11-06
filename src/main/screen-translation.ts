import { randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session } from 'electron'
import type { IpcMainInvokeEvent, Rectangle, WebContents } from 'electron'
import { electronShortcut } from '../shared/keyboard-shortcuts'
import type { AppSettings } from '../shared/settings'
import { defaultRealtimeS2s } from '../shared/settings'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import { screenProcessingMode, screenTranslationModel } from '../shared/screen-translation'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { screenCommandSchema, screenConfigSchema, screenFrameSchema, screenShortcutsSchema, screenPresetSchema, screenRegionSetSchema, type ScreenRegionSet, type ScreenRegionPreset, type ScreenShortcuts, type ScreenConfig, type ScreenFrame, type ScreenSnapshot, type ScreenSource, type ScreenOcrRequest, type ScreenOcrResult } from '../shared/screen-translation'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { isTrustedRendererUrl, resolvePreloadPath } from './window-options'
import { ScreenPipeline, mergeScreenLines, type OcrBlock } from './screen-pipeline'
import { observeScreenWindow } from './screen-target'
import type { ScreenRegion } from '../shared/screen-translation'
import { emptyGlossary, type GlossaryDocument } from '../shared/glossary'
import { resolveGlossaryTerms } from '../shared/glossary-match'
import { createScreenTextProbe, matchesScreenTextProbe, type ScreenTextProbe } from '../shared/screen-visual-probe'

interface ScreenTranslationOptions {
  mainDir: string; configPath: string; prepareOcr(): Promise<() => void>
  gatewaySnapshot(): Pick<ModelGatewaySnapshot, 'state' | 'availableModels'>
  getMainWindow?(): BrowserWindow | null
  inferOcr(request: ScreenOcrRequest, signal: AbortSignal): Promise<ScreenOcrResult>
  settings(): AppSettings; inferModel(request: DirectModelRequest, signal: AbortSignal): Promise<DirectModelResult>
  publish(snapshot: ScreenSnapshot): void; activity?: FeatureActivity
  glossary?(): Promise<GlossaryDocument>
}
export class ScreenTranslation {
  private state: ScreenSnapshot = { status: 'ready', config: screenConfigSchema.parse({}), sessionId: randomUUID(), epoch: 0, blocks: [], shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0 }
  private readonly ready: Promise<void>
  private capture?: BrowserWindow
  private overlay?: BrowserWindow
  private toolbar?: BrowserWindow
  private editor?: BrowserWindow
  private hiddenMainWindow?: BrowserWindow
  private highlights?: BrowserWindow
  private highlightTimer?: ReturnType<typeof setTimeout>
  private escapeRegistered = false
  private editReturn: ScreenSnapshot['status'] = 'ready'
  private presets: ScreenRegionPreset[] = []
  private draft?: ScreenRegionSet
  private pipeline?: ScreenPipeline
  private processing = false
  private pendingFrame?: ScreenFrame
  private readonly observedHashes = new Map<string, string>()
  private readonly visualProbes = new Map<string, ScreenTextProbe>()
  private captureRegions: ScreenRegion[] = []
  private cursorTimer?: ReturnType<typeof setInterval>
  private switchingDisplay = false
  private observedSourceId?: string
  private overlayVisible = true
  private glossaryDocument = emptyGlossary()
  private singleRead = false
  private readonly requestedRegions = new Set<string>()
  private savedScreenConfig?: ScreenConfig
  private readonly listeners = new Set<(snapshot: ScreenSnapshot) => void>()
  private userPaused = false
  private sourceAvailable = true
  private targetForeground = true
  private bounds?: Rectangle
  private stopObserver?: () => void
  private captureDimensions?: { width: number; height: number }
  private readonly hashes = new Map<string, string>()
  private readonly ocrResults = new Map<string, { blocks: OcrBlock[]; width: number; height: number }>()
  private workAbort = new AbortController()
  private lease?: FeatureLease
  private releaseOcr?: () => void
  private registeredShortcuts: string[] = []
  private shortcutRecorder?: WebContents
  private readonly stopShortcutRecording = () => {
    this.shortcutRecorder?.removeListener('destroyed', this.stopShortcutRecording)
    this.shortcutRecorder?.removeListener('render-process-gone', this.stopShortcutRecording)
    this.shortcutRecorder = undefined
    if (!this.disposed) { this.registerShortcuts(); this.publish() }
  }
  private writeQueue = Promise.resolve()
  private disposed = false
  private lifecycle = 0
  private stopping?: Promise<void>

  constructor(private readonly options: ScreenTranslationOptions) {
    this.ready = readFile(options.configPath, 'utf8').then(raw => {
      const stored = JSON.parse(raw)
      const config = stored.version === 2 ? stored.config : stored
      this.state.config = screenConfigSchema.parse({ captureMode: 'regions', ...config })
      if (this.state.config.captureMode === 'window') {
        this.state.config.sourceId = ''; this.state.config.sourceName = ''; this.state.config.windowIdentity = ''
      }
      if (this.state.config.sourceId.startsWith('window:') && this.state.config.regions.length) this.state.config.reviewRequired = true
      this.presets = stored.version === 2 ? (stored.presets ?? []).map((item: unknown) => screenPresetSchema.parse(item)) : []
      this.draft = stored.draft ? screenRegionSetSchema.parse(stored.draft) : undefined
    }).catch(() => {}).then(() => { if (!this.disposed) { this.registerShortcuts(); this.publish() } })
    const handle = (channel: string, handler: (event: IpcMainInvokeEvent, raw?: unknown) => unknown) => {
      ipcMain.handle(channel, (event, raw) => { this.assertTrusted(event); return handler(event, raw) })
    }
    handle('screen:snapshot', async () => { await this.ready; return this.snapshot() })
    handle('screen:sources', () => this.sources())
    handle('screen:command', async (event, raw) => {
      const command = screenCommandSchema.parse(raw)
      if (command.action === 'regions' || command.action === 'cancelEdit') {
        if (event.sender !== this.editor?.webContents) throw new Error('Access denied')
      } else if (event.sender === this.capture?.webContents || event.sender === this.overlay?.webContents || event.sender === this.highlights?.webContents) throw new Error('Access denied')
      if (command.action === 'configure') await this.configure(command.config)
      else if (command.action === 'toolbarSize') {
        if (event.sender !== this.toolbar?.webContents) throw new Error('Access denied')
        const bounds = this.toolbar.getBounds(), area = screen.getDisplayMatching(bounds).workArea
        const width = Math.min(command.width, area.width), height = Math.min(command.height, area.height)
        const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
        if (bounds.width !== width || bounds.height !== height || bounds.x !== x || bounds.y !== y) this.toolbar.setBounds({ x, y, width, height })
      }
      else if (command.action === 'shortcutRecording') {
        await this.ready
        if (this.disposed) throw new Error('Screen translation is unavailable')
        if (command.active) {
          if (this.shortcutRecorder && this.shortcutRecorder !== event.sender) throw new Error('Shortcut recording is already active')
          if (!this.shortcutRecorder) {
            this.shortcutRecorder = event.sender
            event.sender.once('destroyed', this.stopShortcutRecording)
            event.sender.once('render-process-gone', this.stopShortcutRecording)
          }
          this.registerShortcuts()
        } else if (this.shortcutRecorder === event.sender) this.stopShortcutRecording()
      }
      else if (command.action === 'shortcuts') await this.configureShortcuts(command.shortcuts)
      else if (command.action === 'regions') {
        const previous = this.state.config.regions
        const previousReview = this.state.config.reviewRequired
        this.state.config.regions = command.regions
        this.state.config.reviewRequired = false
        try { await this.save() } catch (error) { this.state.config.regions = previous; this.state.config.reviewRequired = previousReview; throw error }
        await this.finishEdit()
      }
      else if (command.action === 'cancelEdit') await this.finishEdit()
      else if (command.action === 'savePreset') await this.savePreset(command.name, command.id)
      else if (command.action === 'loadPreset') await this.loadPreset(command.id)
      else if (command.action === 'renamePreset') await this.renamePreset(command.id, command.name)
      else if (command.action === 'deletePreset') await this.deletePreset(command.id)
      else await this[command.action]()
      return this.snapshot()
    })
    handle('screen:bootstrap', event => {
      const role = event.sender === this.capture?.webContents ? 'capture' : event.sender === this.editor?.webContents ? 'editor' : event.sender === this.overlay?.webContents ? 'overlay' : event.sender === this.highlights?.webContents ? 'regions' : event.sender === this.toolbar?.webContents ? 'toolbar' : undefined
      if (!role) throw new Error('Access denied')
      return { role, snapshot: this.snapshot() }
    })
    handle('screen:frame', (event, raw) => {
      if (event.sender !== this.capture?.webContents) throw new Error('Access denied')
      return this.frame(screenFrameSchema.parse(raw))
    })
    handle('screen:capture-error', event => {
      if (event.sender !== this.capture?.webContents) throw new Error('Access denied')
      this.fail('captureFailed')
    })
  }

  snapshot(): ScreenSnapshot { return { ...this.state, config: { ...this.state.config, regions: [...this.state.config.regions] }, blocks: [...this.state.blocks], presets: structuredClone(this.presets), regionsVisible: !!this.highlights, captureRegions: this.captureRegions, overlayVisible: this.overlayVisible, visualProbes: [...this.visualProbes.values()] } }

  subscribe(listener: (snapshot: ScreenSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async startForGame(gameId: string, config: ScreenConfig): Promise<void> {
    await this.ready
    await this.stop()
    this.savedScreenConfig = this.state.config
    this.state.config = config
    this.state.gameId = gameId
    await this.start()
  }

  async sources(): Promise<ScreenSource[]> {
    const own = new Set(BrowserWindow.getAllWindows().map(window => window.getMediaSourceId()))
    return (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }))
      .filter(source => !own.has(source.id))
      .map(source => ({ id: source.id, name: source.name, kind: source.id.startsWith('window:') ? 'window' : 'screen', preview: '' }))
  }

  async showToolbar(): Promise<void> {
    await this.ready
    if (this.disposed) return
    if (!this.toolbar || this.toolbar.isDestroyed()) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
      this.toolbar = this.openWindow('toolbar', { x: area.x + Math.max(0, area.width - 640), y: area.y, width: Math.min(640, area.width), height: 64 })
      this.toolbar.once('ready-to-show', () => this.toolbar?.showInactive())
      this.toolbar.once('closed', () => { this.toolbar = undefined })
    } else this.toolbar.showInactive()
  }

  async hideToolbar(): Promise<void> { this.toolbar?.hide() }
  async toggleOverlay(): Promise<void> { this.overlayVisible = !this.overlayVisible; this.publish() }
  async readOnce(): Promise<void> {
    const continuous = this.state.status === 'running' && !this.singleRead
    if (this.state.status !== 'running') await this.start()
    this.singleRead = !continuous
    this.requestedRegions.clear()
    for (const region of this.captureRegions) this.requestedRegions.add(region.id)
    this.hashes.clear()
  }

  async refreshGlossary(): Promise<void> {
    if (!this.options.glossary) return
    const document = await this.options.glossary()
    if (document.revision < this.glossaryDocument.revision) return
    const changed = document.matchingRevision !== this.glossaryDocument.matchingRevision
    this.glossaryDocument = document
    if (!changed) return
    for (const [regionId, result] of this.ocrResults) {
      this.pipeline?.update(regionId, result.blocks, result.width, result.height, Date.now(), this.hashes.get(regionId) === this.observedHashes.get(regionId))
    }
  }

  private glossaryMatch(text: string) {
    return resolveGlossaryTerms(this.glossaryDocument, { text, targetLanguage: this.state.config.targetLanguage,
      context: this.state.gameId ? { scenario: 'game', projectId: this.state.gameId } : { scenario: 'screen' }, selection: this.state.config.glossarySelection })
  }

  private updateCursorRegion(): void {
    if (!this.bounds || this.state.config.captureMode !== 'cursor' || this.userPaused || this.switchingDisplay) return
    const point = screen.getCursorScreenPoint(), bounds = this.bounds
    const contains = (rect: Rectangle) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
    const ownSurface = BrowserWindow.getAllWindows().some(window => window !== this.capture && window !== this.overlay && window !== this.highlights && window.isVisible() && contains(window.getBounds()))
    if (!contains(bounds) && !ownSurface && this.capture && String(screen.getDisplayNearestPoint(point).id) !== this.state.config.display?.id) {
      void this.switchCursorDisplay()
      return
    }
    if (!contains(bounds) || ownSurface) {
      this.sourceAvailable = false
      if (this.state.status === 'running') { this.invalidate(); this.state.status = 'waiting'; this.publish() }
      return
    }
    const available = this.sourceAvailable
    this.sourceAvailable = true
    const width = Math.min(480 / bounds.width, 1), height = Math.min(220 / bounds.height, 1)
    const x = (point.x - bounds.x) / bounds.width, y = (point.y - bounds.y) / bounds.height
    const previous = this.captureRegions[0]
    if (available && previous && previous.width === width && previous.height === height && Math.abs(x - previous.x - width / 2) < width / 4 && Math.abs(y - previous.y - height / 2) < height / 4) return
    this.captureRegions = [{ id: previous?.id ?? randomUUID(), x: Math.max(0, Math.min(1 - width, x - width / 2)), y: Math.max(0, Math.min(1 - height, y - height / 2)), width, height }]
    if (this.pipeline || this.state.status === 'waiting') this.resetPipeline()
    if (this.state.status === 'waiting' && this.canRun()) this.state.status = 'running'
    this.publish()
  }

  private async switchCursorDisplay(): Promise<void> {
    if (this.switchingDisplay) return
    this.switchingDisplay = true
    const lifecycle = ++this.lifecycle
    this.invalidate(); this.sourceAvailable = false; this.state.status = 'waiting'; this.publish()
    try {
      await this.closeCapture()
      if (lifecycle !== this.lifecycle || this.disposed) return
      await this.openCapture(lifecycle)
      if (lifecycle !== this.lifecycle || this.disposed) return
      this.switchingDisplay = false
      this.captureRegions = []
      this.updateCursorRegion()
      this.resetPipeline()
      this.state.status = this.canRun() ? 'running' : 'waiting'
      this.publish()
    } catch {
      if (lifecycle === this.lifecycle && !this.disposed) this.fail('targetUnavailable')
    } finally { this.switchingDisplay = false }
  }

  private regionSet(): ScreenRegionSet {
    return structuredClone(screenRegionSetSchema.parse(this.state.config))
  }

  async savePreset(name: string, id?: string): Promise<void> {
    await this.ready
    if (!this.state.config.regions.length || this.state.config.reviewRequired || this.editor) throw new Error('invalidConfig')
    if (id && !this.presets.some(preset => preset.id === id)) throw new Error('invalidConfig')
    const preset = screenPresetSchema.parse({ ...this.regionSet(), id: id ?? randomUUID(), name })
    if (this.presets.some(item => item.id !== preset.id && item.name === preset.name)) throw new Error('presetNameExists')
    const previous = this.presets, previousId = this.state.config.presetId
    this.presets = [...this.presets.filter(item => item.id !== preset.id), preset]
    this.state.config.presetId = preset.id
    try { await this.save() } catch (error) { this.presets = previous; this.state.config.presetId = previousId; throw error }
    this.publish()
  }

  async renamePreset(id: string, name: string): Promise<void> {
    const preset = this.presets.find(item => item.id === id)
    if (!preset) throw new Error('invalidConfig')
    const parsed = screenPresetSchema.parse({ ...preset, name })
    if (this.presets.some(item => item.id !== id && item.name === parsed.name)) throw new Error('presetNameExists')
    const previous = this.presets
    this.presets = this.presets.map(item => item.id === id ? parsed : item)
    try { await this.save() } catch (error) { this.presets = previous; throw error }
    this.publish()
  }

  async deletePreset(id: string): Promise<void> {
    const previous = this.presets, previousId = this.state.config.presetId
    this.presets = this.presets.filter(item => item.id !== id)
    if (previousId === id) this.state.config.presetId = ''
    try { await this.save() } catch (error) { this.presets = previous; this.state.config.presetId = previousId; throw error }
    this.publish()
  }

  async loadPreset(id: string): Promise<void> {
    await this.ready
    if (this.editor) throw new Error('Finish editing the translation regions first')
    const preset = id === 'draft' ? this.draft : this.presets.find(item => item.id === id)
    if (!preset) throw new Error('invalidConfig')
    const running = this.state.status === 'running' || this.state.status === 'waiting'
    const currentPreset = this.presets.find(item => item.id === this.state.config.presetId)
    if (!currentPreset || JSON.stringify(screenRegionSetSchema.parse(currentPreset)) !== JSON.stringify(this.regionSet())) this.draft = this.regionSet()
    const previous = this.state.config
    await this.stop()
    this.state.config = screenConfigSchema.parse({ ...previous, ...screenRegionSetSchema.parse(preset), presetId: id === 'draft' ? '' : id, windowIdentity: '', reviewRequired: false })
    try { await this.save() } catch (error) { this.state.config = previous; throw error }
    if (await this.desktopSource()) {
      await this.edit()
      this.editReturn = running ? 'running' : 'ready'
    } else {
      if (running) await this.start()
      await this.showRegions(true)
    }
    this.publish()
  }

  async showRegions(autoHide = false): Promise<void> {
    await this.ready
    if (this.highlights) { this.hideRegions(); this.publish(); return }
    if (this.editor || !this.state.config.regions.length) return
    const lifecycle = this.lifecycle
    const changed = await this.desktopSource()
    if (lifecycle !== this.lifecycle || this.disposed) return
    if (changed) { await this.edit(); return }
    const window = this.openWindow('regions', this.bounds!)
    this.highlights = window
    if (autoHide) this.highlightTimer = setTimeout(() => { if (this.highlights === window) { this.hideRegions(); this.publish() } }, 2000)
    window.once('ready-to-show', () => { if (!window.isDestroyed()) window.showInactive() })
    window.once('closed', () => { if (this.highlights === window) this.highlights = undefined })
    if (!globalShortcut.isRegistered('Escape')) this.escapeRegistered = globalShortcut.register('Escape', () => { this.hideRegions(); this.publish() })
    this.publish()
  }

  private hideRegions(): void {
    if (this.highlightTimer) clearTimeout(this.highlightTimer)
    this.highlightTimer = undefined
    if (!this.highlights) return
    const window = this.highlights; this.highlights = undefined
    window.destroy()
    if (this.escapeRegistered) globalShortcut.unregister('Escape')
    this.escapeRegistered = false
  }

  private async desktopSource(): Promise<boolean> {
    const lifecycle = this.lifecycle
    if (this.state.config.captureMode === 'window') {
      const selected = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })).find(item => item.id === this.state.config.sourceId)
      if (!selected) throw new Error('targetUnavailable')
      this.state.config.sourceName = selected.name
      if (this.observedSourceId === selected.id && this.bounds) return false
      this.stopObserver?.()
      await new Promise<void>((resolve, reject) => {
        let initialized = false
        const timeout = setTimeout(() => reject(new Error('targetUnavailable')), 5000)
        this.observedSourceId = selected.id
        this.stopObserver = observeScreenWindow(selected.id, target => {
          if (this.observedSourceId !== selected.id) return
          if (!initialized) {
            initialized = true; clearTimeout(timeout)
            if (!target.available) { reject(new Error('targetUnavailable')); return }
            this.state.config.windowIdentity = target.identity
            this.bounds = target.bounds
            this.sourceAvailable = target.available; this.targetForeground = target.foreground
            resolve()
            return
          }
          if (target.identity !== this.state.config.windowIdentity) { this.fail('targetChanged'); return }
          const wasAvailable = this.sourceAvailable && this.targetForeground
          this.sourceAvailable = target.available; this.targetForeground = target.foreground
          const dimensions = this.captureDimensions
          const candidate = dimensions && target.candidates.find(item => Math.abs(item.width / item.height - dimensions.width / dimensions.height) < 0.03)
          const bounds = candidate ? candidate.bounds : target.bounds
          const resized = this.bounds && (bounds.width !== this.bounds.width || bounds.height !== this.bounds.height)
          this.bounds = bounds
          if (resized) { this.captureDimensions = undefined; if (this.pipeline) this.resetPipeline(); this.publish() }
          this.updateBounds()
          if (!this.canRun() && this.state.status === 'running') { this.invalidate(); this.state.status = 'waiting'; this.publish() }
          else if (!wasAvailable && this.canRun() && this.state.status === 'waiting') { this.resetPipeline(); this.state.status = 'running'; this.publish() }
        }, () => { clearTimeout(timeout); if (!initialized) reject(new Error('targetUnavailable')); else this.fail('targetUnavailable') })
      })
      return false
    }
    const displays = screen.getAllDisplays()
    const stored = displays.find(item => String(item.id) === this.state.config.display?.id)
    const display = this.state.config.captureMode === 'cursor' ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : stored ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const selected = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })).find(item => item.display_id === String(display.id))
    if (lifecycle !== this.lifecycle || this.disposed) return false
    if (!selected) throw new Error('targetUnavailable')
    const previous = this.state.config.display
    const changed = this.state.config.captureMode === 'regions' && (this.state.config.reviewRequired || this.state.config.sourceId.startsWith('window:') && !!this.state.config.regions.length
      || !!previous && (!stored || previous.width !== display.bounds.width || previous.height !== display.bounds.height || previous.scale !== display.scaleFactor)
    )
    this.state.config = { ...this.state.config, sourceId: selected.id, sourceName: selected.name, windowIdentity: '',
      display: { id: String(display.id), width: display.bounds.width, height: display.bounds.height, scale: display.scaleFactor }, reviewRequired: changed }
    this.bounds = display.bounds
    return changed
  }

  async configure(config: ScreenConfig): Promise<void> {
    await this.ready
    if (this.shortcutRecorder) throw new Error('Finish recording the shortcut first')
    if (this.editor) throw new Error('Finish editing the translation regions first')
    const sourceChanged = config.sourceId !== this.state.config.sourceId
    const previous = this.state.config
    const gameId = this.state.gameId, saved = this.savedScreenConfig
    const toolbar = this.toolbar; this.toolbar = undefined
    await this.stop()
    this.toolbar = toolbar
    this.state.gameId = gameId; this.savedScreenConfig = saved
    this.state.config = screenConfigSchema.parse({ ...config, ...(sourceChanged ? { regions: [], windowIdentity: '' } : {}) })
    this.registerShortcuts()
    try { await this.save() }
    catch (error) { this.state.config = previous; this.registerShortcuts(); this.publish(); throw error }
    this.publish()
  }

  async configureShortcuts(shortcuts: ScreenShortcuts): Promise<void> {
    await this.ready
    if (this.shortcutRecorder) throw new Error('Finish recording the shortcut first')
    const previous = this.state.config
    const parsed = screenShortcutsSchema.parse(shortcuts)
    this.state.config = { ...previous, ...parsed, editorShortcuts: parsed.editorShortcuts ?? previous.editorShortcuts }
    this.registerShortcuts()
    if (this.state.shortcutError) {
      this.state.config = previous
      this.registerShortcuts()
      this.state.shortcutError = true
    } else {
      try { await this.save() }
      catch (error) { this.state.config = previous; this.registerShortcuts(); this.publish(); throw error }
    }
    this.publish()
  }

  async start(): Promise<void> {
    await this.ready
    await this.stopping
    await this.showToolbar()
    if (this.state.status === 'starting' || this.state.status === 'running' || this.editor) return
    if (this.capture && this.lease) { await this.resume(); return }
    if (this.disposed) return
    if (this.options.gatewaySnapshot().state !== 'running') { this.fail('gatewayNotReady'); return }
    if (screenProcessingMode(this.state.config) === 'default' && defaultRealtimeS2s(this.options.settings())) {
      this.fail('s2sUnsupported'); return
    }
    const lifecycle = ++this.lifecycle
    this.state.status = 'starting'; this.state.error = undefined; this.publish()
    let stage: 'backend' | 'capture' = 'backend'
    try {
      this.lease = this.options.activity?.acquire('screen-translation', () => this.stop())
      const release = await this.options.prepareOcr()
      if (lifecycle !== this.lifecycle || this.disposed) { release(); return }
      this.releaseOcr = release
      const model = screenTranslationModel(this.state.config, this.options.settings())
      if (!model) { this.fail('translationModelMissing'); return }
      if (!this.options.gatewaySnapshot().availableModels?.mt?.some(candidate => candidate.binding === model && model !== 'cloud:recognition')) {
        this.fail('translationModelNotReady'); return
      }
      stage = 'capture'
      const changed = await this.desktopSource()
      if (lifecycle !== this.lifecycle || this.disposed) return
      if (changed) { await this.edit(); this.editReturn = 'running'; return }
      const config = this.state.config
      if (config.captureMode === 'regions' && !config.regions.length) { await this.edit(); this.editReturn = 'running'; return }
      if (config.sourceLanguage === config.targetLanguage) { this.fail('sameLanguage'); return }
      this.state.sessionId = randomUUID()
      this.state.frames = 0
      this.userPaused = false
      this.singleRead = false
      this.captureRegions = config.captureMode === 'regions' ? config.regions : [{ id: randomUUID(), x: 0, y: 0, width: 1, height: 1 }]
      if (config.captureMode === 'cursor') this.updateCursorRegion()
      await this.openCapture(lifecycle)
      if (lifecycle !== this.lifecycle || this.disposed) return
      this.resetPipeline()
      if (config.captureMode === 'cursor') this.cursorTimer = setInterval(() => this.updateCursorRegion(), 100)
      this.state.status = this.canRun() ? 'running' : 'waiting'
      this.lease?.running()
      this.publish()
    } catch (error) {
      if (lifecycle !== this.lifecycle || this.disposed) return
      if (this.options.gatewaySnapshot().state !== 'running') { this.fail('gatewayNotReady'); return }
      this.fail(error instanceof Error && error.message === 'targetChanged' ? 'targetChanged' : error instanceof Error && error.message === 'targetUnavailable' ? 'targetUnavailable' : stage === 'backend' ? 'ocrNotReady' : 'captureFailed')
    }
  }

  async pause(): Promise<void> {
    if (this.state.status === 'starting') await this.stop()
    ++this.lifecycle
    this.userPaused = true
    this.invalidate()
    this.state.status = 'paused'
    this.state.error = undefined
    this.publish()
  }

  async resume(): Promise<void> {
    await this.ready
    if (this.options.gatewaySnapshot().state !== 'running') { this.fail('gatewayNotReady'); return }
    if (screenProcessingMode(this.state.config) === 'default' && defaultRealtimeS2s(this.options.settings())) {
      this.fail('s2sUnsupported'); return
    }
    if (!this.capture || !this.lease && this.options.activity) { await this.stop(); await this.start(); return }
    if (this.editor) return
    this.userPaused = false
    this.singleRead = false
    this.state.error = undefined
    this.resetPipeline()
    this.state.status = this.canRun() ? 'running' : 'waiting'
    this.publish()
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    ++this.lifecycle
    if (this.cursorTimer) clearInterval(this.cursorTimer)
    this.cursorTimer = undefined
    this.toolbar?.destroy(); this.toolbar = undefined
    this.hideRegions()
    this.lease?.stopping(); this.invalidate()
    const editor = this.editor; this.editor = undefined
    this.state.status = 'ready'; editor?.destroy()
    if (this.savedScreenConfig) this.state.config = this.savedScreenConfig
    this.savedScreenConfig = undefined; this.state.gameId = undefined
    this.restoreMainWindow()
    const task = (async () => {
      await this.closeCapture()
      this.releaseOcr?.(); this.releaseOcr = undefined
      this.userPaused = false
      if (this.state.status !== 'error') this.state.error = undefined
      this.lease?.release(); this.lease = undefined
      this.publish()
    })().finally(() => { if (this.stopping === task) this.stopping = undefined })
    this.stopping = task
    return task
  }

  async edit(): Promise<void> {
    await this.ready
    await this.stopping
    if (this.disposed || this.editor) return
    this.editReturn = this.state.status === 'running' || this.state.status === 'waiting' ? 'running' : this.state.status === 'paused' ? 'paused' : 'ready'
    this.hideRegions()
    const toolbar = this.toolbar; this.toolbar = undefined
    await this.pause()
    this.toolbar = toolbar
    const lifecycle = ++this.lifecycle
    await this.desktopSource()
    if (lifecycle !== this.lifecycle || this.disposed) return
    this.state.status = 'editing'
    const window = this.openWindow('editor', this.bounds!)
    this.editor = window
    const mainWindow = this.options.getMainWindow?.()
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      this.hiddenMainWindow = mainWindow
      mainWindow.hide()
    }
    window.once('closed', () => { if (this.editor === window) { this.editor = undefined; void this.finishEdit().catch(() => this.fail('captureFailed')) } })
    this.publish()
  }

  async dispose(): Promise<void> {
    await this.stop(); this.disposed = true
    this.stopShortcutRecording()
    for (const accelerator of this.registeredShortcuts) globalShortcut.unregister(accelerator)
    for (const channel of ['snapshot', 'sources', 'command', 'bootstrap', 'frame', 'capture-error']) ipcMain.removeHandler(`screen:${channel}`)
    await this.writeQueue.catch(() => {})
  }

  private async frame(frame: ScreenFrame): Promise<void> {
    if (frame.sessionId !== this.state.sessionId || frame.epoch !== this.state.epoch) return
    if (this.state.status !== 'running' && this.state.status !== 'editing') return
    const dimensions = this.captureDimensions
    if (dimensions && Math.abs(dimensions.width / dimensions.height - frame.width / frame.height) > 0.03) {
      if (this.state.config.captureMode === 'window') {
        this.captureDimensions = { width: frame.width, height: frame.height }; this.resetPipeline(); this.publish()
      } else this.fail('targetChanged')
      return
    }
    this.captureDimensions = { width: frame.width, height: frame.height }
    if (this.state.status !== 'running' || !this.pipeline) return
    const knownProbes = new Set(this.visualProbes.keys())
    for (const region of frame.observed ?? frame.regions) {
      if (!this.captureRegions.some(item => item.id === region.regionId)) continue
      if (this.observedHashes.get(region.regionId) !== region.hash) this.pipeline.observeRegion(region.regionId, knownProbes)
      this.observedHashes.set(region.regionId, region.hash)
    }
    for (const check of frame.checked ?? []) {
      const probe = this.visualProbes.get(check.id)
      if (probe) this.pipeline.verifyVisual(check.id, check.matches, probe.sourceHash === this.observedHashes.get(probe.regionId))
    }
    if (!frame.regions.length) return
    if (this.processing) {
      const pending = new Map((this.pendingFrame?.regions ?? []).map(region => [region.regionId, region]))
      for (const region of frame.regions) pending.set(region.regionId, region)
      let bytes = [...pending.values()].reduce((total, region) => total + region.image.length, 0)
      while (bytes > 48 * 1024 * 1024 && pending.size) {
        const [id, oldest] = pending.entries().next().value!
        pending.delete(id); bytes -= oldest.image.length
      }
      // Pixel checks describe their own observation, never replay them after a newer frame.
      this.pendingFrame = { ...frame, observed: [], checked: [], regions: [...pending.values()] }
      return
    }
    this.processing = true
    const epoch = this.state.epoch, abort = this.workAbort, pipeline = this.pipeline
    this.state.frames++
    try {
      await this.refreshGlossary()
      if (epoch !== this.state.epoch || abort.signal.aborted) return
      // Every capture is bounded to one frame; regions rotate to avoid a permanently preferred first region.
      const offset = this.state.frames % Math.max(1, frame.regions.length)
      const regions = [...frame.regions.slice(offset), ...frame.regions.slice(0, offset)]
      for (const region of regions) {
        if (epoch !== this.state.epoch || abort.signal.aborted) break
        if (!this.captureRegions.some(item => item.id === region.regionId)) continue
        if (this.singleRead && !this.requestedRegions.has(region.regionId)) continue
        if (this.observedHashes.get(region.regionId) !== region.hash) continue
        let result = this.ocrResults.get(region.regionId)
        if (this.hashes.get(region.regionId) !== region.hash || !result) {
          const started = Date.now()
          result = await this.options.inferOcr({ image: region.image, appearance: this.state.config.strategy !== 'speed', language: this.state.config.sourceLanguage === 'zh-Hant' ? 'zh' : this.state.config.sourceLanguage }, abort.signal)
          if (epoch !== this.state.epoch || abort.signal.aborted) break
          const blocks = this.probeBlocks(region.regionId, region.hash, region.image, result)
          if (this.observedHashes.get(region.regionId) !== region.hash && !blocks.some(block => block.visualId)) continue
          result = { ...result, blocks }
          this.state.ocrMs = Date.now() - started
          this.hashes.set(region.regionId, region.hash)
          this.ocrResults.set(region.regionId, result)
        }
        const verified = this.observedHashes.get(region.regionId) === region.hash
        pipeline.update(region.regionId, result.blocks, result.width, result.height, Date.now(), verified)
        if (this.singleRead) {
          pipeline.update(region.regionId, result.blocks, result.width, result.height, Date.now(), verified)
          this.requestedRegions.delete(region.regionId)
        }
      }
    } catch (error) {
      if (epoch === this.state.epoch && !abort.signal.aborted && !(error instanceof Error && error.message === 'resourceBusy')) {
        const known = ['ocrMissing', 'ocrNotReady', 'ocrCorrupt', 'ocrRuntimeUnavailable', 'backendUnavailable'] as const
        this.fail(known.find(code => error instanceof Error && error.message === code) ?? 'ocrFailed')
      }
    } finally {
      this.processing = false
      const pending = this.pendingFrame; this.pendingFrame = undefined
      if (pending) void this.frame(pending)
    }
  }

  private probeBlocks(regionId: string, hash: string, image: string, result: { blocks: OcrBlock[]; width: number; height: number }): OcrBlock[] {
    const blocks = mergeScreenLines(result.blocks, result.width)
    const source = nativeImage.createFromDataURL(image)
    if (source.isEmpty()) return blocks
    const { width, height } = source.getSize()
    if (width !== result.width || height !== result.height) return blocks
    const pixels = source.toBitmap()
    for (let index = 0; index < pixels.length; index += 4) { const blue = pixels[index]; pixels[index] = pixels[index + 2]; pixels[index + 2] = blue }
    const previous = [...this.visualProbes.values()].filter(probe => probe.regionId === regionId)
    const next: ScreenTextProbe[] = []
    for (const block of blocks) {
      const visual = createScreenTextProbe({ data: pixels, width, height }, block.quad)
      if (!visual) continue
      const same = previous.find(probe => probe.x === visual.x && probe.y === visual.y && probe.width === visual.width && probe.height === visual.height
        && matchesScreenTextProbe({ data: pixels, width, height }, probe))
      const id = same?.id ?? randomUUID()
      next.push({ ...(same ?? visual), id, regionId, sourceHash: hash })
      block.visualId = id
    }
    if (next.length || this.observedHashes.get(regionId) === hash) {
      for (const probe of previous) this.visualProbes.delete(probe.id)
      for (const probe of next) this.visualProbes.set(probe.id, probe)
    }
    return blocks
  }

  private resetPipeline(): void {
    this.invalidate()
    const epoch = this.state.epoch
    const model = screenTranslationModel(this.state.config, this.options.settings())
    this.pipeline = new ScreenPipeline({ ...this.state.config, regions: this.captureRegions, model }, async (text, signal) => {
      const started = Date.now()
      const result = await this.options.inferModel({ id: randomUUID(), kind: 'mt', model, taskMode: 'realtime',
        text, source: this.state.config.sourceLanguage, target: this.state.config.targetLanguage, glossary: this.glossaryMatch(text).terms }, AbortSignal.any([signal, AbortSignal.timeout(25000)]))
      if (epoch === this.state.epoch) this.state.translationMs = Date.now() - started
      return result.text
    }, () => { if (epoch === this.state.epoch) { this.state.blocks = this.pipeline?.blocks() ?? []; this.publish() } },
    () => { if (epoch === this.state.epoch) { if (this.state.error !== 'translationFailed') this.state.errorId = randomUUID(); this.state.error = 'translationFailed'; this.publish() } }, text => this.glossaryMatch(text).signature)
  }

  private invalidate(): void {
    this.state.epoch++
    this.workAbort.abort(); this.workAbort = new AbortController()
    this.pipeline?.stop(); this.pipeline = undefined
    this.hashes.clear(); this.ocrResults.clear()
    this.observedHashes.clear(); this.pendingFrame = undefined
    this.visualProbes.clear()
    this.state.blocks = []
    this.overlay?.hide()
  }

  private canRun(): boolean { return this.sourceAvailable && this.targetForeground && !this.userPaused }
  private fail(error: ScreenSnapshot['error']): void {
    const toolbar = this.toolbar; this.toolbar = undefined
    const cleanup = this.stop()
    this.toolbar = toolbar
    const lifecycle = this.lifecycle
    this.state.status = 'error'; this.state.error = error; this.state.errorId = randomUUID(); this.publish()
    void cleanup.then(() => {
      if (this.disposed || lifecycle !== this.lifecycle) return
      this.state.status = 'error'; this.state.error = error; this.publish()
    })
  }

  private async openCapture(lifecycle: number): Promise<void> {
    if (this.capture && !this.capture.isDestroyed()) return
    if (await this.desktopSource()) throw new Error('targetChanged')
    if (lifecycle !== this.lifecycle || this.disposed) return
    const selected = (await desktopCapturer.getSources({ types: [this.state.config.captureMode === 'window' ? 'window' : 'screen'], thumbnailSize: { width: 0, height: 0 } })).find(source => source.id === this.state.config.sourceId)
    if (lifecycle !== this.lifecycle || this.disposed) return
    if (!selected) throw new Error('targetUnavailable')
    if (this.state.config.captureMode === 'regions') this.sourceAvailable = true
    if (this.state.config.captureMode !== 'window') this.targetForeground = true
    this.captureDimensions = undefined
    if (this.state.config.captureMode !== 'window') {
    const original = this.state.config.display!
    const update = () => {
      const display = screen.getAllDisplays().find(item => String(item.id) === original.id)
      if (!display || display.bounds.width !== original.width || display.bounds.height !== original.height || display.scaleFactor !== original.scale) this.fail('targetChanged')
      else { this.bounds = display.bounds; this.updateBounds() }
    }
    screen.on('display-removed', update); screen.on('display-metrics-changed', update)
    this.stopObserver = () => { screen.removeListener('display-removed', update); screen.removeListener('display-metrics-changed', update) }
    }
    const captureSession = session.fromPartition('screen-translation-capture')
    captureSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === this.capture?.webContents && permission === 'media'))
    captureSession.setPermissionCheckHandler((contents, permission) => contents === this.capture?.webContents && permission === 'media')
    captureSession.setDisplayMediaRequestHandler((request, callback) => {
      if (request.frame !== this.capture?.webContents.mainFrame) { callback({}); return }
      callback({ video: selected })
    })
    this.capture = this.openWindow('capture', { x: 0, y: 0, width: 320, height: 240 })
    const capture = this.capture
    capture.webContents.once('render-process-gone', () => { if (!this.disposed && this.capture === capture) this.fail('captureFailed') })
    if (this.bounds) this.overlay = this.openWindow('overlay', this.bounds)
  }

  private async closeCapture(): Promise<void> {
    this.stopObserver?.(); this.stopObserver = undefined
    this.observedSourceId = undefined
    this.capture?.destroy(); this.capture = undefined
    this.overlay?.destroy(); this.overlay = undefined
    this.bounds = undefined
  }

  private openWindow(role: 'capture' | 'editor' | 'overlay' | 'regions' | 'toolbar', bounds: Rectangle): BrowserWindow {
    const window = new BrowserWindow({ ...bounds, show: false, frame: false, transparent: role !== 'capture', backgroundColor: '#00000000',
      focusable: role === 'editor' || role === 'toolbar', skipTaskbar: true, resizable: false, movable: role === 'toolbar', hasShadow: false,
      webPreferences: { preload: resolvePreloadPath(this.options.mainDir), contextIsolation: true, sandbox: true, nodeIntegration: false,
        backgroundThrottling: false, ...(role === 'capture' ? { partition: 'screen-translation-capture' } : {}) },
    })
    window.setContentProtection(true)
    // Windows constrains initial bounds to the work area; OCR coordinates cover the entire display.
    if (role !== 'capture' && role !== 'toolbar') {
      window.setBounds(bounds)
      window.on('show', () => { if (!window.isDestroyed()) window.setBounds(this.bounds ?? bounds) })
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    if (role === 'overlay' || role === 'regions') { window.setIgnoreMouseEvents(true); window.setFocusable(false); window.setAlwaysOnTop(true, 'screen-saver') }
    if (role === 'editor') { window.setAlwaysOnTop(true, 'screen-saver'); window.once('ready-to-show', () => { window.show(); window.focus() }) }
    if (role === 'toolbar') window.setAlwaysOnTop(true, 'screen-saver')
    const query = { role, theme: this.options.settings().theme }
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const load = rendererUrl ? window.loadURL(new URL(`screen.html?${new URLSearchParams(query)}`, rendererUrl).href)
      : window.loadFile(join(this.options.mainDir, '../renderer/screen.html'), { query })
    void load.catch(() => this.fail('captureFailed'))
    return window
  }

  private async finishEdit(): Promise<void> {
    const editor = this.editor; this.editor = undefined
    this.state.status = 'paused'; editor?.destroy()
    this.restoreMainWindow()
    if (this.state.config.reviewRequired) await this.stop()
    else if (this.editReturn === 'running' && this.state.config.regions.length) await this.resume()
    else if (this.editReturn === 'ready') await this.stop()
    else { this.userPaused = true; this.publish() }
  }

  private restoreMainWindow(): void {
    const window = this.hiddenMainWindow
    this.hiddenMainWindow = undefined
    if (window && !window.isDestroyed()) { window.show(); window.focus() }
  }

  private updateBounds(): void {
    if (!this.bounds) return
    for (const window of [this.overlay, this.editor, this.highlights]) if (window && !window.isDestroyed()) window.setBounds(this.bounds)
  }

  private publish(): void {
    if (this.disposed) return
    const value = this.snapshot()
    this.options.publish(value)
    for (const listener of this.listeners) listener(value)
    for (const window of [this.capture, this.overlay, this.editor, this.highlights, this.toolbar]) {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && !window.webContents.isLoadingMainFrame()) window.webContents.send('screen:changed', value)
    }
    if (this.overlay && !this.overlay.isDestroyed()) {
      if (this.overlayVisible && this.state.status === 'running' && this.canRun() && this.state.blocks.some(block => block.status === 'ready' && !block.hidden)) this.overlay.showInactive()
      else this.overlay.hide()
    }
  }

  private registerShortcuts(): void {
    for (const accelerator of this.registeredShortcuts) globalShortcut.unregister(accelerator)
    this.registeredShortcuts = []
    this.state.shortcutError = false
    if (this.shortcutRecorder) return
    const actions: Array<[string, () => Promise<void>]> = [
      [this.state.config.toggleShortcut, () => this.state.status === 'running' || this.state.status === 'waiting' ? this.pause() : this.resume()],
      [this.state.config.showRegionsShortcut, () => this.showRegions()],
      [this.state.config.editShortcut, () => this.edit()], [this.state.config.stopShortcut, () => this.stop()],
    ]
    for (const [binding, action] of actions) {
      if (!binding) continue
      const accelerator = electronShortcut(binding)
      try {
        if (!globalShortcut.register(accelerator, () => { void action().catch(() => this.fail('captureFailed')) })) this.state.shortcutError = true
        else this.registeredShortcuts.push(accelerator)
      } catch { this.state.shortcutError = true }
    }
  }

  private save(): Promise<void> {
    const data = JSON.stringify({ version: 2, config: this.savedScreenConfig ?? this.state.config, presets: this.presets, draft: this.draft })
    const path = this.options.configPath
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(`${path}.tmp`, data, 'utf8')
      await rename(`${path}.tmp`, path)
    })
    return this.writeQueue
  }

  private assertTrusted(event: IpcMainInvokeEvent): void {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url, this.options.mainDir)) throw new Error('Access denied')
  }

}
