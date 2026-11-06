import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'node:path'
import type { GameSnapshot } from '../shared/game-translation'
import type { AppSettings } from '../shared/settings'
import { resolvePreloadPath } from './window-options'
import { observeScreenWindow } from './screen-target'

/** Hook text has no glyph coordinates; place it in a separate, non-interactive subtitle window. */
export class GameSubtitleWindow {
  private window?: BrowserWindow
  private sessionId?: string
  private latest?: GameSnapshot
  private stopObserver?: () => void
  private bounds?: Rectangle
  private targetVisible = true
  private dismissedLineIds = new Set<string>()

  constructor(private readonly mainDir: string, private readonly settings: () => AppSettings, private readonly unavailable: () => void) {}

  owns(webContentsId: number): boolean { return !!this.window && !this.window.isDestroyed() && this.window.webContents.id === webContentsId }

  begin(sessionId: string, sourceId?: string): void {
    this.close()
    this.sessionId = sessionId
    this.bounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    this.targetVisible = !sourceId
    if (sourceId) {
      let identity: string | undefined
      this.stopObserver = observeScreenWindow(sourceId, target => {
        if (this.sessionId !== sessionId) return
        if (identity && identity !== target.identity) { this.unavailable(); return }
        identity = target.identity
        this.bounds = target.bounds
        this.targetVisible = target.available && target.foreground
        if (this.window && !this.window.isDestroyed()) this.window.setBounds(this.subtitleBounds())
        this.syncVisibility()
      }, () => { if (this.sessionId === sessionId) this.unavailable() })
    }
  }

  update(snapshot: GameSnapshot): void {
    if (!this.sessionId || snapshot.sessionId !== this.sessionId || snapshot.source === 'ocr') return
    this.latest = snapshot
    const line = snapshot.lines.at(-1)
    if (!this.window && snapshot.status === 'running' && line && (line.status === 'ready' || line.status === 'error')) this.open()
    const window = this.window
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) window.webContents.send('game:changed', snapshot)
    this.syncVisibility()
  }

  close(): void {
    this.sessionId = undefined; this.latest = undefined; this.dismissedLineIds.clear()
    this.stopObserver?.(); this.stopObserver = undefined
    const window = this.window; this.window = undefined
    window?.destroy()
  }

  clearCurrent(): void {
    this.dismissedLineIds = new Set(this.latest?.lines.map(line => line.id))
    this.window?.hide()
  }

  private subtitleBounds(): Rectangle {
    const area = this.bounds ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = Math.max(1, Math.min(900, Math.round(area.width * .85))), height = Math.max(1, Math.min(area.height, 220, Math.max(120, Math.round(area.height * .3))))
    return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + area.height - height - Math.min(32, area.height * .05)), width, height }
  }

  private syncVisibility(): void {
    if (!this.window || this.window.isDestroyed()) return
    const line = this.latest?.lines.at(-1)
    if (!this.window.webContents.isLoadingMainFrame() && this.targetVisible && this.latest?.status === 'running' && line && !this.dismissedLineIds.has(line.id) && (line.status === 'ready' || line.status === 'error')) this.window.showInactive()
    else this.window.hide()
  }

  private open(): void {
    const sessionId = this.sessionId!
    const window = new BrowserWindow({ ...this.subtitleBounds(), show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      focusable: false, skipTaskbar: true, resizable: false, hasShadow: false,
      webPreferences: { preload: resolvePreloadPath(this.mainDir), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } })
    this.window = window
    window.setContentProtection(true); window.setIgnoreMouseEvents(true); window.setAlwaysOnTop(true, 'screen-saver')
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.once('did-finish-load', () => {
      if (this.window !== window || this.sessionId !== sessionId || window.isDestroyed()) return
      if (this.latest) window.webContents.send('game:changed', this.latest)
      this.syncVisibility()
    })
    window.webContents.once('render-process-gone', () => { if (this.window === window) this.unavailable() })
    const query = { role: 'game-overlay', sessionId, theme: this.settings().theme }
    const load = process.env.ELECTRON_RENDERER_URL ? window.loadURL(new URL(`screen.html?${new URLSearchParams(query)}`, process.env.ELECTRON_RENDERER_URL).href)
      : window.loadFile(join(this.mainDir, '../renderer/screen.html'), { query })
    void load.catch(() => { if (this.window === window && this.sessionId === sessionId) this.unavailable() })
  }
}
