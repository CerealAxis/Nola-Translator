import { app, BrowserWindow, ipcMain, nativeTheme, shell, type BrowserWindowConstructorOptions } from 'electron'
import { localCallDemoSurface, type LocalCallDemoSurface } from '../shared/local-call-demo'
import type { AppSettings } from '../shared/settings'
import { createMainWindowOptions, resolvePreloadPath } from './window-options'
import { registerLanguageModelIpc, type LanguageModelServices } from './language-model'

const windows = new Map<LocalCallDemoSurface, BrowserWindow>()
export function isLocalCallDemoWindow(window: BrowserWindow): boolean {
  return [...windows.values()].includes(window)
}

export function registerLocalCallDemo(
  getTheme: () => AppSettings['theme'],
  mainDirectory: string,
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow = (options) =>
    new BrowserWindow(options),
  services?: LanguageModelServices,
): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!localCallDemoSurface(app.isPackaged, rendererUrl, 'chat')) return
  if (services) registerLanguageModelIpc(services, sender => {
    const owner = BrowserWindow.fromWebContents(sender)
    return !!owner && isLocalCallDemoWindow(owner) && sender.getURL().startsWith(new URL(rendererUrl!).origin + '/')
  })
  ipcMain.handle('app:local-call-demo', async (event, raw: unknown) => {
    const surface = localCallDemoSurface(app.isPackaged, rendererUrl, raw)
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (
      !surface ||
      !sender ||
      !event.sender.getURL().startsWith(new URL(rendererUrl!).origin + '/')
    )
      throw new Error('Development preview is unavailable')
    const url = new URL('native-agent.html', rendererUrl!)
    url.searchParams.set('localCallDemo', surface)
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
    window.on('closed', () => {
      if (windows.get(surface) === window) windows.delete(surface)
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
      if (new URL(target).origin !== new URL(rendererUrl!).origin) navigation.preventDefault()
    })
    try {
      await window.loadURL(url.toString())
      window.show()
      window.focus()
    } catch (error) {
      window.destroy()
      throw error
    }
  })
}
