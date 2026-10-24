import { app, BrowserWindow, ipcMain, nativeTheme, shell, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { workbenchSurface, type WorkbenchSurface } from '../shared/workbench'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import type { AppSettings } from '../shared/settings'
import { createMainWindowOptions, resolvePreloadPath } from './window-options'
import { registerLanguageModelIpc, type LanguageModelServices } from './language-model'

const windows = new Map<WorkbenchSurface, BrowserWindow>()
export function isWorkbenchWindow(window: BrowserWindow): boolean {
  return [...windows.values()].includes(window)
}

export function registerWorkbench(
  getTheme: () => AppSettings['theme'],
  mainDirectory: string,
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow = (options) =>
    new BrowserWindow(options),
  services?: LanguageModelServices,
  activity?: FeatureActivity,
): { stop(): Promise<void> } {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const entryUrl = rendererUrl ? new URL('workbench.html', rendererUrl) : pathToFileURL(join(mainDirectory, '../renderer/workbench.html'))
  const trustedDocument = (raw: string, workbenchOnly = false): boolean => {
    try {
      const url = new URL(raw)
      if (rendererUrl) return url.origin === new URL(rendererUrl).origin && (!workbenchOnly || url.pathname === entryUrl.pathname)
      if (url.protocol !== 'file:') return false
      return url.pathname === entryUrl.pathname || (!workbenchOnly && url.pathname === pathToFileURL(join(mainDirectory, '../renderer/index.html')).pathname)
    } catch { return false }
  }
  let lease: FeatureLease | null = null
  let closing: Promise<void> | null = null
  const languageModels = services ? registerLanguageModelIpc(services, sender => {
    const owner = BrowserWindow.fromWebContents(sender)
    return !!owner && isWorkbenchWindow(owner) && trustedDocument(sender.getURL(), true) && !closing && (!activity || (activity.snapshot().owner === 'workbench' && activity.snapshot().phase !== 'stopping'))
  }) : null
  const stop = (): Promise<void> => {
    if (closing) return closing
    lease?.stopping()
    const task = (async () => {
      await languageModels?.cancelAll()
      for (const window of windows.values()) if (!window.isDestroyed()) window.destroy()
      windows.clear()
      lease?.release()
      lease = null
    })().finally(() => { if (closing === task) closing = null })
    closing = task
    return task
  }
  ipcMain.handle('workbench:open', async (event, raw: unknown) => {
    const surface = workbenchSurface(raw)
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (
      !surface ||
      !sender ||
      event.senderFrame !== event.sender.mainFrame || !trustedDocument(event.sender.getURL())
    )
      throw new Error('Workbench is unavailable for this window')
    activity?.assertAvailable('workbench')
    if (!lease) lease = activity?.acquire('workbench', stop) ?? null
    const url = new URL(entryUrl)
    url.searchParams.set('workbench', surface)
    url.searchParams.set('theme', getTheme())
    const existing = windows.get(surface)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      if (new URL(existing.webContents.getURL()).pathname !== url.pathname) await existing.loadURL(url.toString())
      existing.show()
      existing.focus()
      return
    }
    const window = createWindow({
      ...createMainWindowOptions(resolvePreloadPath(mainDirectory), getTheme(), mainDirectory),
      // Match the Elements surface before the independent renderer paints.
      backgroundColor: (getTheme() === 'system' ? nativeTheme.shouldUseDarkColors : getTheme() === 'dark') ? '#0a0a0a' : '#ffffff',
      backgroundMaterial: 'none',
      width: 1380,
      height: 900,
      minWidth: 760,
      minHeight: 600,
    })
    windows.set(surface, window)
    window.on('close', event => { event.preventDefault(); void stop().catch(error => console.error('workbench shutdown failed', error)) })
    window.on('closed', () => {
      if (windows.get(surface) === window) windows.delete(surface)
      if (!windows.size) void stop().catch(error => console.error('workbench shutdown failed', error))
    })
    const publish = () =>
      window.webContents.send('app:window:maximized-changed', window.isMaximized())
    window.on('maximize', publish)
    window.on('unmaximize', publish)
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => undefined)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (navigation, target) => {
      if (!trustedDocument(target, true)) navigation.preventDefault()
    })
    try {
      await window.loadURL(url.toString())
      lease?.running()
      window.show()
      window.focus()
    } catch (error) {
      window.destroy()
      await stop()
      throw error
    }
  })
  return { stop }
}
