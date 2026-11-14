import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type BrowserWindowConstructorOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { comicEditorRequestSchema } from '../shared/comic'
import { resolveUiLanguage, type UiLanguage } from '../shared/languages'
import { comicEditorCloseError, windowTitleForUrl } from '../shared/window-titles'
import type { AppSettings } from '../shared/settings'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { createMainWindowOptions, resolvePreloadPath, isTrustedRendererUrl } from './window-options'

type SenderEvent = IpcMainEvent | IpcMainInvokeEvent
interface EditorWindow {
  window: BrowserWindow
  projectId: string
  ready: boolean
  pendingPageId?: string
  closing?: Promise<void>
  token?: string
  finish?: (saved: boolean, timedOut?: boolean) => void
}

/** Each editor is permanently scoped to one project, including during its save/close handshake. */
export function registerComicEditor(
  getTheme: () => AppSettings['theme'],
  mainDirectory: string,
  getMainWindow: () => BrowserWindow | null,
  activity?: FeatureActivity,
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow = options => new BrowserWindow(options),
  getLanguage: () => UiLanguage = () => resolveUiLanguage('auto', app.getLocale()),
) {
  const entry = process.env.ELECTRON_RENDERER_URL
    ? new URL('comic-editor.html', process.env.ELECTRON_RENDERER_URL)
    : pathToFileURL(join(mainDirectory, '../renderer/comic-editor.html'))
  const windows = new Map<string, EditorWindow>()
  let lease: FeatureLease | null = null
  const trusted = (record: EditorWindow, raw: string) => {
    try {
      const url = new URL(raw)
      return url.protocol === entry.protocol && url.host === entry.host && url.pathname === entry.pathname
        && url.searchParams.get('projectId') === record.projectId
    } catch { return false }
  }
  const recordFor = (event: SenderEvent) => [...windows.values()].find(record =>
    !record.window.isDestroyed() && record.window.webContents === event.sender
    && event.senderFrame === event.sender.mainFrame && trusted(record, event.sender.getURL())
    && !!event.senderFrame && trusted(record, event.senderFrame.url))
  const isEditorSender = (event: SenderEvent, projectId?: string): boolean => {
    const record = recordFor(event)
    return !!record && (projectId === undefined || record.projectId === projectId)
  }
  const close = (record: EditorWindow): Promise<void> => {
    if (record.closing) return record.closing
    const token = randomUUID()
    record.token = token
    record.closing = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => record.finish?.(false, true), 15_000)
      record.finish = (saved, timedOut = false) => {
        clearTimeout(timeout)
        record.finish = undefined
        record.token = undefined
        if (saved) { record.window.destroy(); resolve() }
        else {
          record.closing = undefined
          if (timedOut && !record.window.isDestroyed()) {
            const language = getLanguage()
            const feedback = comicEditorCloseError(language)
            void dialog.showMessageBox(record.window, { type: 'error', title: windowTitleForUrl(record.window.webContents.getURL(), language), message: feedback.message, buttons: [feedback.ok] }).catch(error => console.error('comic editor error dialog failed', error))
          }
          reject(new Error('comicEditorSaveFailed'))
        }
      }
    })
    if (record.ready) record.window.webContents.send('comic:editor-close-requested', token)
    return record.closing
  }
  const stop = async () => { await Promise.all([...windows.values()].map(close)) }
  ipcMain.on('comic:editor-ready', event => {
    const record = recordFor(event)
    if (!record) return
    record.ready = true
    if (record.token) {
      record.window.webContents.send('comic:editor-close-requested', record.token)
      return
    }
    if (record.pendingPageId) {
      record.window.webContents.send('comic:editor-page-requested', record.pendingPageId)
      record.pendingPageId = undefined
    }
  })
  ipcMain.on('comic:editor-close-result', (event, raw: unknown) => {
    const record = recordFor(event)
    if (!record || !raw || typeof raw !== 'object') return
    const result = raw as { token?: unknown; ok?: unknown }
    if (record.token && result.token === record.token && typeof result.ok === 'boolean') record.finish?.(result.ok)
  })
  ipcMain.handle('comic:editor-open', async (event, raw: unknown) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()
      || event.senderFrame !== event.sender.mainFrame || !event.senderFrame
      || !isTrustedRendererUrl(event.senderFrame.url, mainDirectory)
      || !isTrustedRendererUrl(event.sender.getURL(), mainDirectory)) throw new Error('Access denied')
    const request = comicEditorRequestSchema.parse(raw)
    activity?.assertAvailable('comic-editor')
    const existing = windows.get(request.projectId)
    if (existing && !existing.window.isDestroyed()) {
      if (existing.closing) throw new Error('resourceBusy')
      if (existing.window.isMinimized()) existing.window.restore()
      if (request.pageId) {
        if (existing.ready) existing.window.webContents.send('comic:editor-page-requested', request.pageId)
        else existing.pendingPageId = request.pageId
      }
      existing.window.show(); existing.window.focus()
      return
    }
    if (!lease) lease = activity?.acquire('comic-editor', stop) ?? null
    const window = createWindow({ ...createMainWindowOptions(resolvePreloadPath(mainDirectory), getTheme(), mainDirectory) })
    const record: EditorWindow = { window, projectId: request.projectId, ready: false }
    windows.set(request.projectId, record)
    window.once('ready-to-show', () => { window.maximize(); window.show(); window.focus() })
    window.on('close', event => { event.preventDefault(); void close(record).catch(error => console.error('comic editor save failed', error)) })
    window.on('closed', () => {
      record.finish?.(false)
      if (windows.get(record.projectId) === record) windows.delete(record.projectId)
      if (!windows.size) { lease?.release(); lease = null }
    })
    window.on('maximize', () => window.webContents.send('app:window:maximized-changed', true))
    window.on('unmaximize', () => window.webContents.send('app:window:maximized-changed', false))
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => { if (!trusted(record, url)) event.preventDefault() })
    const url = new URL(entry)
    url.searchParams.set('projectId', request.projectId)
    url.searchParams.set('theme', getTheme())
    if (request.pageId) url.searchParams.set('pageId', request.pageId)
    try { await window.loadURL(url.href); if (!window.isDestroyed()) lease?.running() }
    catch (error) { window.destroy(); throw error }
  })
  return {
    isEditorSender,
    isWindow: (window: BrowserWindow) => [...windows.values()].some(record => record.window === window && !window.isDestroyed()),
    hasWindows: () => windows.size > 0,
    broadcast: (channel: string, payload: unknown) => {
      for (const record of windows.values()) if (!record.window.isDestroyed() && trusted(record, record.window.webContents.getURL())) record.window.webContents.send(channel, payload)
    },
    stop,
  }
}
