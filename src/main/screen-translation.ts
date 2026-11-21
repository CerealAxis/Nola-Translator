import { emptyWordRules, protectTranslation, resolveWordRules, type WordRulesDocument } from '../shared/word-rules'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen } from 'electron'
import type { IpcMainInvokeEvent, Rectangle, WebContents } from 'electron'
import { electronShortcut } from '../shared/keyboard-shortcuts'
import type { AppSettings } from '../shared/settings'
import { defaultRealtimeS2s } from '../shared/settings'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import { screenProcessingMode, screenTranslationModel } from '../shared/screen-translation'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { screenCommandSchema, screenConfigSchema, screenShortcutsSchema, screenPresetSchema, screenRegionSetSchema, type ScreenRegionSet, type ScreenRegionPreset, type ScreenShortcuts, type ScreenConfig, type ScreenCaptureRequest, type ScreenCaptureResult, type ScreenSnapshot, type ScreenSource, type ScreenOcrRequest, type ScreenOcrResult } from '../shared/screen-translation'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { isTrustedRendererUrl, resolvePreloadPath } from './window-options'
import { ScreenPipeline } from './screen-pipeline'
import { observeScreenWindow } from './screen-target'
import type { ScreenRegion } from '../shared/screen-translation'
import { emptyGlossary, type GlossaryDocument } from '../shared/glossary'
import { resolveGlossaryTerms } from '../shared/glossary-match'
import type { TextProcessing } from './text-processing'
import { defaultModelBinding } from '../shared/model-policy'
import { normalizeThrownError } from '../shared/ipc-error'
import { featureConflictOwner } from '../shared/feature-activity'
import { loggedHandle } from './logged-ipc'
import { logDiagnostic } from './session-log'

type GatewaySnapshot = Pick<ModelGatewaySnapshot, 'state' | 'availableModels'> & Partial<Pick<ModelGatewaySnapshot, 'services'>>
type ScreenOperation = 'start' | 'resume' | 'capture' | 'ocr' | 'translate' | 'window' | 'shortcut'
const ocrErrors = ['ocrMissing', 'ocrNotReady', 'ocrCorrupt', 'ocrRuntimeUnavailable', 'backendUnavailable', 'invalidConfig'] as const
const translationCauses = new Map([
  ['rate_limited', 'translationRateLimited'],
  ['request_timeout', 'translationTimeout'],
  ['network_unavailable', 'translationNetworkUnavailable'],
])

interface ScreenTranslationOptions {
  mainDir: string; configPath: string; prepareOcr(language: string): Promise<() => void>
  gatewaySnapshot(): GatewaySnapshot
  captureScreen(request: ScreenCaptureRequest, signal: AbortSignal): Promise<ScreenCaptureResult>
  releaseScreenCapture?(sessionId: string): Promise<void>
  getMainWindow?(): BrowserWindow | null
  inferOcr(request: ScreenOcrRequest, signal: AbortSignal): Promise<ScreenOcrResult>
  settings(): AppSettings; inferModel(request: DirectModelRequest, signal: AbortSignal): Promise<DirectModelResult>
  publish(snapshot: ScreenSnapshot): void; activity?: FeatureActivity
  glossary?(): Promise<GlossaryDocument>
  wordRules?(): Promise<WordRulesDocument>
  textProcessing?: TextProcessing
}
export class ScreenTranslation {
  private state: ScreenSnapshot = { status: 'ready', config: screenConfigSchema.parse({}), sessionId: randomUUID(), epoch: 0, blocks: [], shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0 }
  private readonly ready: Promise<void>
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
  private sampling = false
  private captureTimer?: ReturnType<typeof setTimeout>
  private hiddenForCapture?: BrowserWindow
  private readonly lastOcr = new Map<string, number>()
  private captureRegions: ScreenRegion[] = []
  private cursorTimer?: ReturnType<typeof setInterval>
  private switchingDisplay = false
  private observedSourceId?: string
  private overlayVisible = true
  private glossaryDocument = emptyGlossary()
  private wordRulesDocument = emptyWordRules()
  private processingRevision = 0
  private singleRead = false
  private readRevision = 0
  private readonly requestedRegions = new Set<string>()
  private savedScreenConfig?: ScreenConfig
  private readonly listeners = new Set<(snapshot: ScreenSnapshot) => void>()
  private userPaused = false
  private sourceAvailable = true
  private targetForeground = true
  private bounds?: Rectangle
  private targetPixels?: Rectangle
  private stopObserver?: () => void
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
    const handle = (channel: string, handler: (event: IpcMainInvokeEvent, raw?: unknown) => unknown) =>
      loggedHandle(channel, handler, event => this.assertTrusted(event))
    handle('screen:snapshot', async () => { await this.ready; return this.snapshot() })
    handle('screen:sources', () => this.sources())
    handle('screen:command', async (event, raw) => {
      const parsed = screenCommandSchema.safeParse(raw)
      if (!parsed.success) throw new Error('invalidConfig')
      const command = parsed.data
      if (command.action === 'regions' || command.action === 'cancelEdit') {
        if (event.sender !== this.editor?.webContents) throw new Error('Access denied')
      } else if (event.sender === this.overlay?.webContents || event.sender === this.highlights?.webContents) throw new Error('Access denied')
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
      const role = event.sender === this.editor?.webContents ? 'editor' : event.sender === this.overlay?.webContents ? 'overlay' : event.sender === this.highlights?.webContents ? 'regions' : event.sender === this.toolbar?.webContents ? 'toolbar' : undefined
      if (!role) throw new Error('Access denied')
      return { role, snapshot: this.snapshot() }
    })
  }

  snapshot(): ScreenSnapshot { return { ...this.state, config: { ...this.state.config, regions: [...this.state.config.regions] }, blocks: [...this.state.blocks], presets: structuredClone(this.presets), regionsVisible: !!this.highlights, captureRegions: this.captureRegions, overlayVisible: this.overlayVisible } }

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
    if (this.disposed || !this.overlay && !this.editor || !['running', 'waiting', 'paused', 'editing'].includes(this.state.status)) return
    if (!this.toolbar || this.toolbar.isDestroyed()) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
      const toolbar = this.openWindow('toolbar', { x: area.x + Math.max(0, area.width - 640), y: area.y, width: Math.min(640, area.width), height: 64 })
      this.toolbar = toolbar
      toolbar.once('ready-to-show', () => { if (this.toolbar === toolbar && !toolbar.isDestroyed()) toolbar.showInactive() })
      toolbar.once('closed', () => { if (this.toolbar === toolbar) this.toolbar = undefined })
    } else this.toolbar.showInactive()
  }

  async hideToolbar(): Promise<void> { this.toolbar?.hide() }
  async toggleOverlay(): Promise<void> { this.overlayVisible = !this.overlayVisible; this.publish() }
  async readOnce(): Promise<void> {
    const continuous = this.state.status === 'running' && !this.singleRead
    if (this.state.status !== 'running') await this.start()
    if (this.state.status !== 'running' && this.state.status !== 'waiting') return
    this.singleRead = !continuous
    this.requestedRegions.clear()
    for (const region of this.captureRegions) this.requestedRegions.add(region.id)
    this.readRevision++
    this.scheduleCapture()
  }

  async refreshWordRules(): Promise<void> {
    if (!this.options.wordRules) return
    const document = await this.options.wordRules()
    if (document.matchingRevision === this.wordRulesDocument.matchingRevision) return
    this.wordRulesDocument = document
    this.pipeline?.refreshRules()
  }

  async refreshGlossary(): Promise<void> {
    await this.refreshWordRules()
    const revision = this.options.textProcessing?.snapshot().revision ?? 0
    const rulesChanged = revision !== this.processingRevision
    this.processingRevision = revision
    if (!this.options.glossary) return
    const document = await this.options.glossary()
    if (document.revision < this.glossaryDocument.revision) return
    const changed = document.matchingRevision !== this.glossaryDocument.matchingRevision
    this.glossaryDocument = document
    if (!changed && !rulesChanged) return
    this.pipeline?.refreshRules()
  }

  private processingScope() {
    const scene = this.state.gameId ? 'game:' + this.state.gameId : 'screen'
    return this.options.textProcessing?.snapshot().values['scene:' + scene] === true ? { mode: 'auto' as const } : undefined
  }

  private glossaryMatch(text: string, selection = this.processingScope() ?? this.state.config.glossarySelection) {
    return resolveGlossaryTerms(this.glossaryDocument, { text, targetLanguage: this.state.config.targetLanguage,
      context: this.state.gameId ? { scenario: 'game', projectId: this.state.gameId } : { scenario: 'screen' }, selection })
  }

  private updateCursorRegion(): void {
    if (!this.bounds || this.state.config.captureMode !== 'cursor' || this.userPaused || this.switchingDisplay) return
    const point = screen.getCursorScreenPoint(), bounds = this.bounds
    const contains = (rect: Rectangle) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
    const ownSurface = BrowserWindow.getAllWindows().some(window => window !== this.overlay && window !== this.highlights && window.isVisible() && contains(window.getBounds()))
    if (!contains(bounds) && !ownSurface && this.overlay && String(screen.getDisplayNearestPoint(point).id) !== this.state.config.display?.id) {
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
    } catch (error) {
      if (lifecycle === this.lifecycle && !this.disposed) this.fail('targetUnavailable', 'capture', error)
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
          const bounds = target.clientBounds ?? target.bounds
          if (!initialized) {
            initialized = true; clearTimeout(timeout)
            if (!target.available) { reject(new Error('targetUnavailable')); return }
            this.state.config.windowIdentity = target.identity
            this.bounds = bounds
            this.targetPixels = target.clientPixels
            this.sourceAvailable = target.available; this.targetForeground = target.foreground
            resolve()
            return
          }
          if (target.identity !== this.state.config.windowIdentity) { this.fail('targetChanged', 'capture'); return }
          const wasAvailable = this.sourceAvailable
          this.sourceAvailable = target.available; this.targetForeground = target.foreground
          const resized = this.bounds && (bounds.width !== this.bounds.width || bounds.height !== this.bounds.height)
          this.bounds = bounds
          this.targetPixels = target.clientPixels
          if (resized) { if (this.pipeline) this.resetPipeline(); this.publish() }
          this.updateBounds()
          if (!this.canRun() && this.state.status === 'running') { this.invalidate(); this.state.status = 'waiting'; this.publish() }
          else if (!wasAvailable && this.canRun() && this.state.status === 'waiting') { this.resetPipeline(); this.state.status = 'running'; this.publish() }
          else this.updateOverlayVisibility()
        }, () => { clearTimeout(timeout); if (!initialized) reject(new Error('targetUnavailable')); else this.fail('targetUnavailable', 'capture') })
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

  private checkGateway(operation: 'start' | 'resume', gateway: GatewaySnapshot): boolean {
    if (gateway.state !== 'running') { this.fail('gatewayNotReady', operation, undefined, gateway); return false }
    if (screenProcessingMode(this.state.config) === 'default' && defaultRealtimeS2s(this.options.settings())) {
      this.fail('s2sUnsupported', operation)
      return false
    }
    return true
  }

  private checkTranslationModel(operation: 'start' | 'resume', gateway: GatewaySnapshot): boolean {
    const model = screenTranslationModel(this.state.config, this.options.settings())
    if (!model) { this.fail('translationModelMissing', operation, undefined, gateway); return false }
    if (model === 'cloud:recognition' || !gateway.availableModels?.mt?.some(candidate => candidate.binding === model)) {
      this.fail('translationModelNotReady', operation, undefined, gateway)
      return false
    }
    return true
  }

  async start(): Promise<void> {
    await this.ready
    await this.stopping
    if (this.disposed || this.state.status === 'starting' || this.state.status === 'running' || this.editor) return
    if (this.overlay && this.releaseOcr) { await this.resume(); await this.showToolbar(); return }
    if (!this.checkGateway('start', this.options.gatewaySnapshot())) return
    const lifecycle = ++this.lifecycle
    this.state.status = 'starting'; this.clearFailure(); this.publish()
    let stage: 'start' | 'ocr' | 'capture' = 'start'
    try {
      this.lease = this.options.activity?.acquire('screen-translation', () => this.stop())
      stage = 'ocr'
      const release = await this.options.prepareOcr(this.ocrLanguage())
      if (lifecycle !== this.lifecycle || this.disposed) { release(); return }
      this.releaseOcr = release
      const gateway = this.options.gatewaySnapshot()
      if (!this.checkGateway('start', gateway) || !this.checkTranslationModel('start', gateway)) return
      stage = 'capture'
      const changed = await this.desktopSource()
      if (lifecycle !== this.lifecycle || this.disposed) return
      const currentGateway = this.options.gatewaySnapshot()
      if (!this.checkGateway('start', currentGateway) || !this.checkTranslationModel('start', currentGateway)) return
      if (changed) { await this.edit(); this.editReturn = 'running'; return }
      const config = this.state.config
      if (config.captureMode === 'regions' && !config.regions.length) { await this.edit(); this.editReturn = 'running'; return }
      if (config.sourceLanguage === config.targetLanguage) { this.fail('sameLanguage', 'start'); return }
      this.state.sessionId = randomUUID()
      this.state.frames = 0
      this.userPaused = false
      this.singleRead = false
      this.captureRegions = config.captureMode !== 'cursor' && config.regions.length
        ? config.regions : [{ id: randomUUID(), x: 0, y: 0, width: 1, height: 1 }]
      if (config.captureMode === 'cursor') this.updateCursorRegion()
      await this.openCapture(lifecycle)
      if (lifecycle !== this.lifecycle || this.disposed) return
      const readyGateway = this.options.gatewaySnapshot()
      if (!this.checkGateway('start', readyGateway) || !this.checkTranslationModel('start', readyGateway)) return
      this.resetPipeline()
      if (config.captureMode === 'cursor') this.cursorTimer = setInterval(() => this.updateCursorRegion(), 100)
      this.state.status = this.canRun() ? 'running' : 'waiting'
      this.lease?.running()
      this.publish()
      await this.showToolbar()
    } catch (error) {
      if (lifecycle !== this.lifecycle || this.disposed) return
      const gateway = this.options.gatewaySnapshot()
      const reason = error instanceof Error ? error.message : ''
      if (gateway.state !== 'running') { this.fail('gatewayNotReady', 'start', error, gateway); return }
      const known = [...ocrErrors, 'targetChanged', 'targetUnavailable'] as const
      this.fail(known.find(code => code === reason) ?? (stage === 'capture' ? 'captureFailed' : 'startFailed'), stage, error, gateway)
    }
  }

  async pause(): Promise<void> {
    if (this.state.status === 'starting') await this.stop()
    ++this.lifecycle
    this.userPaused = true
    this.invalidate()
    this.state.status = 'paused'
    this.clearFailure()
    this.publish()
  }

  async resume(): Promise<void> {
    await this.ready
    await this.stopping
    if (this.disposed || this.editor || this.state.status === 'starting') return
    const gateway = this.options.gatewaySnapshot()
    if (!this.checkGateway('resume', gateway)) return
    if (!this.overlay || !this.lease && this.options.activity) { await this.stop(); await this.start(); return }
    if (gateway.services?.ocr && gateway.services.ocr.state !== 'ready') {
      this.fail('ocrNotReady', 'resume', undefined, gateway)
      return
    }
    if (!this.checkTranslationModel('resume', gateway)) return
    this.userPaused = false
    this.singleRead = false
    this.requestedRegions.clear()
    if (this.state.config.captureMode !== 'cursor' && this.state.config.regions.length) {
      this.captureRegions = this.state.config.regions
    }
    this.clearFailure()
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
      if (this.state.status !== 'error') this.clearFailure()
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
    window.once('closed', () => { if (this.editor === window) { this.editor = undefined; void this.finishEdit().catch(error => this.fail('captureFailed', 'window', error)) } })
    this.publish()
  }

  async dispose(): Promise<void> {
    await this.stop(); this.disposed = true
    await this.writeQueue.catch(() => {})
    this.stopShortcutRecording()
    for (const accelerator of this.registeredShortcuts) globalShortcut.unregister(accelerator)
    for (const channel of ['snapshot', 'sources', 'command', 'bootstrap']) ipcMain.removeHandler(`screen:${channel}`)
    await this.writeQueue.catch(() => {})
  }

  private scheduleCapture(delay = 0): void {
    if (this.captureTimer || this.sampling || !this.overlay || this.state.status !== 'running'
        || this.singleRead && !this.requestedRegions.size) return
    this.captureTimer = setTimeout(() => {
      this.captureTimer = undefined
      void this.sample()
    }, delay)
    this.captureTimer.unref?.()
  }

  private async sample(): Promise<void> {
    const pipeline = this.pipeline, bounds = this.bounds
    if (!pipeline || !bounds || this.state.status !== 'running') return
    const { epoch, sessionId, config } = this.state
    const { signal } = this.workAbort
    const readRevision = this.readRevision
    const manual = this.requestedRegions.size > 0
    const now = Date.now()
    const regions = this.captureRegions.filter(region => manual ? this.requestedRegions.has(region.id)
      : config.ocrMode !== 'period' || now - (this.lastOcr.get(region.id) ?? -Infinity) > config.intervalMs)
    const delay = config.ocrMode === 'trigger' && !manual ? 15 : 100
    if (!regions.length) { this.scheduleCapture(delay); return }
    const physical = this.targetPixels ?? screen.dipToScreenRect(null, bounds)
    const request: ScreenCaptureRequest = {
      session_id: sessionId, epoch, mode: config.ocrMode, manual,
      target: config.captureMode === 'window' ? /^window:(\d+):\d+$/.exec(config.sourceId)?.[1] ?? '' : '',
      overlay: '', composition_changed: false, owner_pid: process.pid,
      regions: regions.map(region => {
        const left = Math.round(region.x * physical.width), top = Math.round(region.y * physical.height)
        const right = Math.min(physical.width, Math.round((region.x + region.width) * physical.width))
        const bottom = Math.min(physical.height, Math.round((region.y + region.height) * physical.height))
        return { id: region.id, x: physical.x + left, y: physical.y + top,
          width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
      }),
    }
    this.sampling = true
    let errorStage: ScreenSnapshot['error'] = 'captureFailed'
    try {
      const captured = await this.captureExcludingOverlay(request, signal)
      if (signal.aborted || readRevision !== this.readRevision
          || this.bounds?.x !== bounds.x || this.bounds?.y !== bounds.y) return
      if (captured.unavailable) {
        if (config.captureMode !== 'window') this.fail('captureFailed', 'capture')
        return
      }
      if (!captured.frames.length) return
      this.state.frames++
      errorStage = 'ocrFailed'
      await this.refreshGlossary()
      for (const frame of captured.frames) {
        if (signal.aborted || readRevision !== this.readRevision) break
        const region = regions.find(region => region.id === frame.id)
        if (!region) continue
        const started = Date.now()
        const result = await this.options.inferOcr({ image: frame.image, overlay: true, language: this.ocrLanguage() }, signal)
        if (signal.aborted || readRevision !== this.readRevision) break
        this.lastOcr.set(region.id, Date.now())
        this.state.ocrMs = Date.now() - started
        pipeline.update(region, result.blocks, result.width, result.height, manual || config.ocrMode === 'trigger')
        if (manual) this.requestedRegions.delete(region.id)
      }
    } catch (error) {
      if (signal.aborted || readRevision !== this.readRevision) return
      const reason = error instanceof Error ? error.message : ''
      if (reason !== 'resourceBusy') {
        this.fail(ocrErrors.find(code => code === reason) ?? errorStage, errorStage === 'ocrFailed' ? 'ocr' : 'capture', error)
      }
    } finally {
      this.sampling = false
      this.scheduleCapture(delay)
    }
  }

  private async captureExcludingOverlay(request: ScreenCaptureRequest, signal: AbortSignal): Promise<ScreenCaptureResult> {
    const overlay = this.overlay
    if (!overlay?.isVisible()) return this.options.captureScreen(request, signal)
    const native = overlay.getNativeWindowHandle()
    const handle = (native.length === 8 ? native.readBigUInt64LE() : native.readUInt32LE()).toString()
    const probe = await this.options.captureScreen({ ...request, overlay: handle }, signal)
    if (!probe.hide_overlay || signal.aborted || overlay.isDestroyed()) return probe
    overlay.setContentProtection(true)
    try {
      const result = await this.options.captureScreen({ ...request, overlay: handle }, signal)
      if (!result.hide_overlay || signal.aborted || overlay.isDestroyed()) return result
      this.hiddenForCapture = overlay
      overlay.hide()
      return await this.options.captureScreen({ ...request, composition_changed: true }, signal)
    } finally {
      if (!overlay.isDestroyed()) overlay.setContentProtection(false)
      if (this.hiddenForCapture === overlay) {
        this.hiddenForCapture = undefined
        this.updateOverlayVisibility()
      }
    }
  }

  private resetPipeline(): void {
    this.invalidate()
    const epoch = this.state.epoch
    const model = screenTranslationModel(this.state.config, this.options.settings())
    this.pipeline = new ScreenPipeline({ ...this.state.config, regions: this.captureRegions, model }, async (text, signal) => {
      const started = Date.now()
      const context = this.state.gameId ? { scenario: 'game' as const, projectId: this.state.gameId } : { scenario: 'screen' as const }
      const source = this.state.config.sourceLanguage, target = this.state.config.targetLanguage
      const prepared = await this.options.textProcessing?.prepare(this.state.gameId ? 'game:' + this.state.gameId : 'screen', {
        text, source, target,
      }, signal)
      if (prepared?.skip) return prepared.text || text
      const input = prepared?.text ?? text
      const protection = protectTranslation(prepared?.protect === false ? emptyWordRules() : this.wordRulesDocument,
        input, source, context, prepared?.selection ?? this.state.config.excludedSelection)
      const terms = prepared?.glossary === false ? [] : this.glossaryMatch(input, prepared?.selection).terms
      const result = await this.options.inferModel({ id: randomUUID(), kind: 'mt', model, taskMode: 'realtime',
        text: protection.text, source, target, glossary: terms,
        skipUnsupportedGlossary: prepared ? true : undefined },
      AbortSignal.any([signal, AbortSignal.timeout(25000)]))
      if (epoch === this.state.epoch) this.state.translationMs = Date.now() - started
      const output = protection.restore(result.text)
      return prepared ? prepared.finish(output) : output
    }, () => {
      if (epoch !== this.state.epoch) return
      this.state.blocks = this.pipeline?.blocks() ?? []
      if (this.state.error === 'translationFailed' && this.state.blocks.length && this.state.blocks.every(block => block.status === 'ready')) this.clearFailure()
      this.publish()
    }, error => {
      if (epoch !== this.state.epoch) return
      this.recordFailure('translationFailed', 'translate', error)
      this.publish()
    }, text => this.processingRevision + ':' + this.glossaryMatch(text).signature + resolveWordRules(this.wordRulesDocument, { kind: 'preserve', text, language: this.state.config.sourceLanguage, context: this.state.gameId ? { scenario: 'game', projectId: this.state.gameId } : { scenario: 'screen' }, selection: this.processingScope() ?? this.state.config.excludedSelection }).signature)
  }

  private invalidate(): void {
    this.state.epoch++
    this.workAbort.abort(); this.workAbort = new AbortController()
    if (this.captureTimer) clearTimeout(this.captureTimer)
    this.captureTimer = undefined
    this.pipeline?.stop(); this.pipeline = undefined
    this.lastOcr.clear()
    this.state.blocks = []
    this.overlay?.hide()
  }

  private canRun(): boolean { return this.sourceAvailable && !this.userPaused }

  private ocrLanguage(): string {
    return this.state.config.sourceLanguage === 'zh-Hant' ? 'zh' : this.state.config.sourceLanguage
  }

  private clearFailure(): void {
    this.state.error = undefined
    this.state.errorId = undefined
    this.state.failure = undefined
  }

  private recordFailure(error: NonNullable<ScreenSnapshot['error']>, operation: ScreenOperation, cause?: unknown,
    gateway = this.options.gatewaySnapshot()): void {
    const settings = this.options.settings()
    const capability = error === 'ocrNotReady' ? 'ocr'
      : error === 'translationModelNotReady' || error === 'translationModelMissing' ? 'mt' : undefined
    const modelBinding = capability === 'ocr' ? settings.modelGateway.ocrModel || defaultModelBinding(settings, 'ocr')
      : capability === 'mt' ? screenTranslationModel(this.state.config, settings) : undefined
    const service = capability && gateway.services?.[capability]
    const serviceFailed = !!service && service.state === 'failed' && (!modelBinding || service.model === modelBinding)
    const upstream = normalizeThrownError(cause)
    const translationCode = operation === 'translate' ? translationCauses.get(upstream.code) : undefined
    const causeClassification = translationCode ? normalizeThrownError({ code: translationCode }) : upstream
    const serviceError = serviceFailed ? normalizeThrownError({ code: service.errorCode, message: service.error }) : undefined
    const classification = error === 'gatewayNotReady' ? normalizeThrownError({ code: error })
      : featureConflictOwner(cause) ? normalizeThrownError({ code: 'sessionAlreadyRunning' })
        : serviceError && serviceError.supportCode !== 'ERR-999' ? serviceError
          : causeClassification.supportCode !== 'ERR-999' ? causeClassification : normalizeThrownError({ code: error })
    if (operation === 'translate' && this.state.error === error && this.state.failure?.supportCode === classification.supportCode) return
    const correlationId = randomUUID()
    const failure = { ...classification, correlationId, gatewayState: gateway.state, modelBinding, serviceFailed, gameId: this.state.gameId }
    this.state.error = error
    this.state.errorId = correlationId
    this.state.failure = failure
    const upstreamError = cause instanceof Error ? cause as Error & { status?: number; backendCode?: string; correlationId?: string } : undefined
    logDiagnostic('screen.failed', { operation, reason: error, status: this.state.status, sessionId: this.state.sessionId, epoch: this.state.epoch,
      captureMode: this.state.config.captureMode, classification: failure,
      cause: upstreamError && { name: upstreamError.name, ...upstream, status: upstreamError.status,
        backendCode: upstreamError.backendCode, correlationId: upstreamError.correlationId } })
  }

  private fail(error: NonNullable<ScreenSnapshot['error']>, operation: ScreenOperation, cause?: unknown, gateway?: GatewaySnapshot): void {
    if (this.disposed) return
    this.recordFailure(error, operation, cause, gateway)
    void this.stop()
    this.state.status = 'error'
    this.publish()
  }

  private async openCapture(lifecycle: number): Promise<void> {
    if (this.overlay && !this.overlay.isDestroyed()) return
    if (await this.desktopSource()) throw new Error('targetChanged')
    if (lifecycle !== this.lifecycle || this.disposed) return
    if (!this.bounds) throw new Error('targetUnavailable')
    if (this.state.config.captureMode !== 'window') {
      this.sourceAvailable = true
      this.targetForeground = true
      const original = this.state.config.display!
      const update = () => {
        const display = screen.getAllDisplays().find(item => String(item.id) === original.id)
        if (!display || display.bounds.width !== original.width || display.bounds.height !== original.height
            || display.scaleFactor !== original.scale) this.fail('targetChanged', 'capture')
        else { this.bounds = display.bounds; this.updateBounds() }
      }
      screen.on('display-removed', update)
      screen.on('display-metrics-changed', update)
      this.stopObserver = () => {
        screen.removeListener('display-removed', update)
        screen.removeListener('display-metrics-changed', update)
      }
    }
    this.overlay = this.openWindow('overlay', this.bounds)
  }

  private async closeCapture(): Promise<void> {
    const active = !!this.overlay
    const sessionId = this.state.sessionId
    this.stopObserver?.()
    this.stopObserver = undefined
    this.observedSourceId = undefined
    this.overlay?.destroy()
    this.overlay = undefined
    this.targetPixels = undefined
    this.bounds = undefined
    if (active) await this.options.releaseScreenCapture?.(sessionId).catch(error => {
      logDiagnostic('screen.release.failed', { sessionId, classification: normalizeThrownError(error), error })
    })
  }

  private openWindow(role: 'editor' | 'overlay' | 'regions' | 'toolbar', bounds: Rectangle): BrowserWindow {
    const window = new BrowserWindow({ ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      focusable: role === 'editor' || role === 'toolbar', skipTaskbar: true, resizable: false, movable: role === 'toolbar', hasShadow: false,
      webPreferences: { preload: resolvePreloadPath(this.options.mainDir), contextIsolation: true, sandbox: true, nodeIntegration: false,
        backgroundThrottling: false },
    })
    if (role !== 'overlay') window.setContentProtection(true)
    // Windows constrains initial bounds to the work area; OCR coordinates cover the entire display.
    if (role !== 'toolbar') {
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
    void load.catch(error => { if (!window.isDestroyed()) this.fail('captureFailed', 'window', error) })
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
    if (!this.state.shortcutError) this.state.shortcutErrorId = undefined
    else if (!this.state.shortcutErrorId) {
      const correlationId = randomUUID()
      this.state.shortcutErrorId = correlationId
      logDiagnostic('screen.failed', { operation: 'shortcut', reason: 'shortcutConflict', sessionId: this.state.sessionId,
        classification: normalizeThrownError({ code: 'shortcutConflict' }, { correlationId }) })
    }
    const value = this.snapshot()
    this.options.publish(value)
    for (const listener of this.listeners) listener(value)
    for (const window of [this.overlay, this.editor, this.highlights, this.toolbar]) {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && !window.webContents.isLoadingMainFrame()) window.webContents.send('screen:changed', value)
    }
    this.updateOverlayVisibility()
    this.scheduleCapture()
  }

  private updateOverlayVisibility(): void {
    if (this.overlay && !this.overlay.isDestroyed() && this.overlay !== this.hiddenForCapture) {
      if (this.overlayVisible && this.targetForeground && this.state.status === 'running' && this.canRun()
          && this.state.blocks.some(block => block.status === 'ready' && block.translation)) this.overlay.showInactive()
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
        if (!globalShortcut.register(accelerator, () => { void action().catch(error => this.fail('captureFailed', 'shortcut', error)) })) this.state.shortcutError = true
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
