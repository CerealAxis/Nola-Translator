import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettings } from '../shared/settings'
import type { LatencySession } from './latency-session'
import { createMainWindowOptions, isTrustedRendererUrl, resolvePreloadPath } from './window-options'

export class LatencyWindow {
  private window?: BrowserWindow
  private session?: LatencySession
  private sessionId?: string
  private timer?: NodeJS.Timeout

  constructor(private readonly mainDir: string) {
    ipcMain.handle('latency:snapshot', event => {
      const target = this.window?.webContents
      if (event.sender !== target || event.senderFrame !== target.mainFrame
          || !isTrustedRendererUrl(event.senderFrame.url, this.mainDir)) throw new Error('Access denied')
      return this.session?.snapshot()
    })
  }

  start(sessionId: string, session: LatencySession, theme: AppSettings['theme']): void {
    this.sessionId = sessionId
    this.session = session
    this.open(theme)
    this.startTimer()
    this.publish()
  }

  reopen(theme: AppSettings['theme']): void {
    if (!this.session) return
    this.open(theme)
    if (this.session.snapshot().active && !this.timer) this.startTimer()
    const window = this.window
    if (window?.isVisible()) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.publish(), 250)
    this.timer.unref()
  }

  current(sessionId: string): LatencySession | undefined {
    return this.sessionId === sessionId ? this.session : undefined
  }

  finish(sessionId?: string): void {
    if (sessionId !== undefined && this.sessionId !== sessionId) return
    this.session?.stop()
    this.stopTimer()
    this.publish()
  }

  private publish(): void {
    const window = this.window
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()
        && !window.webContents.isLoadingMainFrame() && this.session) {
      window.webContents.send('latency:changed', this.session.snapshot())
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private open(theme: AppSettings['theme']): void {
    if (this.window && !this.window.isDestroyed()) return
    const options = createMainWindowOptions(resolvePreloadPath(this.mainDir), theme, this.mainDir)
    const window = this.window = new BrowserWindow({
      ...options, width: 810, height: 735, minWidth: 480, minHeight: 600,
      titleBarStyle: 'default', titleBarOverlay: false,
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.once('ready-to-show', () => window.showInactive())
    window.once('closed', () => {
      if (this.window === window) {
        this.window = undefined
        this.stopTimer()
      }
    })
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const query = { theme }
    const load = rendererUrl
      ? window.loadURL(new URL(`latency.html?${new URLSearchParams(query)}`, rendererUrl).href)
      : window.loadFile(join(this.mainDir, '../renderer/latency.html'), { query })
    void load.catch(error => {
      console.error('[latency] window failed to load', error)
      if (!window.isDestroyed()) window.destroy()
    })
  }
}
