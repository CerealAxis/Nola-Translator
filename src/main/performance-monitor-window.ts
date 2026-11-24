import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { AppSettings } from '../shared/settings'
import { createMainWindowOptions, resolvePreloadPath } from './window-options'

export class PerformanceMonitorWindow {
  private window?: BrowserWindow
  private loading?: Promise<void>
  private requests?: AbortController

  constructor(private readonly mainDir: string, private readonly available: () => boolean) {}

  close(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
  }

  snapshotSignal(event: Electron.IpcMainInvokeEvent): AbortSignal {
    if (!this.window || this.window.isDestroyed() || !this.requests || event.sender !== this.window.webContents
      || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('Access denied')
    if (!this.available()) throw new Error('Gateway performance data unavailable')
    return this.requests.signal
  }

  async open(theme: AppSettings['theme']): Promise<void> {
    if (!this.available()) throw new Error('Gateway performance data unavailable')
    const existing = this.window
    if (existing && !existing.isDestroyed()) {
      try { await this.loading }
      catch (error) {
        if (existing.isDestroyed() && !this.available()) return
        throw error
      }
      if (existing.isDestroyed() || !this.available()) return
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return
    }

    const window = this.window = new BrowserWindow({
      ...createMainWindowOptions(resolvePreloadPath(this.mainDir), theme, this.mainDir),
      width: 1280, height: 850, minWidth: 640, minHeight: 480,
      titleBarStyle: 'default', titleBarOverlay: false,
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const requests = this.requests = new AbortController()
    window.once('closed', () => {
      requests.abort()
      if (this.window === window) {
        this.window = undefined
        this.loading = undefined
        this.requests = undefined
      }
    })
    const query = { theme }
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    try {
      this.loading = rendererUrl
        ? window.loadURL(new URL(`performance-monitor.html?${new URLSearchParams(query)}`, rendererUrl).href)
        : window.loadFile(join(this.mainDir, '../renderer/performance-monitor.html'), { query })
      await this.loading
      if (!window.isDestroyed() && this.available()) {
        window.maximize()
        window.show()
      } else if (!window.isDestroyed()) window.destroy()
    } catch (error) {
      if (window.isDestroyed()) return
      window.destroy()
      throw error
    } finally {
      if (this.window === window) this.loading = undefined
    }
  }
}
