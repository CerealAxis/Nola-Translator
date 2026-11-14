import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dialog, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
const ipc = vi.hoisted(() => ({ handles: new Map<string, (...args: any[]) => any>(), listeners: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (contents: { owner: unknown }) => contents.owner },
  ipcMain: { handle: (key: string, callback: (...args: any[]) => any) => ipc.handles.set(key, callback), on: (key: string, callback: (...args: any[]) => any) => ipc.listeners.set(key, callback) },
  app: { isPackaged: false, getLocale: () => 'en-US' },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })) },
}))
import { registerComicEditor } from '../../../src/main/comic-editor'
import { FeatureActivity } from '../../../src/main/feature-activity'

class FakeWindow extends EventEmitter {
  destroyed = false
  url = ''
  webContents = Object.assign(new EventEmitter(), { owner: this, mainFrame: { url: '' }, getURL: () => this.url, send: vi.fn(), setWindowOpenHandler: vi.fn() })
  loadURL = vi.fn(async (url: string) => { this.url = url; this.webContents.mainFrame.url = url })
  isDestroyed() { return this.destroyed }
  isMinimized() { return false }
  restore = vi.fn()
  maximize = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  destroy() { this.destroyed = true; this.emit('closed') }
  event() { return { sender: this.webContents, senderFrame: this.webContents.mainFrame } as unknown as IpcMainInvokeEvent }
}
const projectId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
function setup() {
  const main = new FakeWindow()
  main.url = 'http://localhost:5173/'
  main.webContents.mainFrame.url = main.url
  const windows: FakeWindow[] = []
  const activity = new FeatureActivity()
  const manager = registerComicEditor(() => 'dark', 'C:/app/out/main', () => main as unknown as BrowserWindow, activity, () => { const window = new FakeWindow(); windows.push(window); return window as unknown as BrowserWindow })
  const open = (id = projectId, pageId?: string) => ipc.handles.get('comic:editor-open')!(main.event(), { projectId: id, ...(pageId ? { pageId } : {}) })
  return { main, windows, manager, open, activity }
}
beforeEach(() => { ipc.handles.clear(); ipc.listeners.clear(); vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/') })
describe('independent comic editor', () => {
  it('opens one window per project, retains its document and tracks independent activity', async () => {
    const { open, windows, activity, manager } = setup()
    await open(); await open(projectId, secondId)
    expect(windows[0].webContents.send).not.toHaveBeenCalledWith('comic:editor-page-requested', secondId)
    ipc.listeners.get('comic:editor-ready')!(windows[0].event())
    expect(windows).toHaveLength(1)
    expect(windows[0].loadURL).toHaveBeenCalledTimes(1)
    windows[0].emit('ready-to-show')
    expect(windows[0].maximize).toHaveBeenCalledOnce()
    expect(windows[0].webContents.send).toHaveBeenCalledWith('comic:editor-page-requested', secondId)
    expect(new URL(windows[0].url).searchParams.get('projectId')).toBe(projectId)
    expect(activity.has('comic-editor')).toBe(true)
    const stop = manager.stop()
    ipc.listeners.get('comic:editor-close-result')!(windows[0].event(), { token: windows[0].webContents.send.mock.calls.at(-1)![1], ok: true })
    await stop
    expect(activity.has('comic-editor')).toBe(false)
  })
  it('denies subframes, foreign windows, changed entry routes and cross-project requests', async () => {
    const { open, windows, manager, main } = setup()
    await open()
    const editor = windows[0]
    expect(manager.isEditorSender(editor.event(), projectId)).toBe(true)
    expect(manager.isEditorSender(editor.event(), secondId)).toBe(false)
    expect(manager.isEditorSender({ ...editor.event(), senderFrame: { url: editor.url } } as IpcMainInvokeEvent)).toBe(false)
    const foreign = new FakeWindow(); await foreign.loadURL(editor.url)
    expect(manager.isEditorSender(foreign.event(), projectId)).toBe(false)
    editor.url = 'http://localhost:5173/index.html'; editor.webContents.mainFrame.url = editor.url
    expect(manager.isEditorSender(editor.event(), projectId)).toBe(false)
    await expect(ipc.handles.get('comic:editor-open')!({ ...main.event(), senderFrame: {} }, { projectId })).rejects.toThrow('Access denied')
    await expect(ipc.handles.get('comic:editor-open')!(foreign.event(), { projectId })).rejects.toThrow('Access denied')
    windows[0].destroy()
  })
  it('waits for readiness before requesting close, so the first painted draft cannot be discarded', async () => {
    const { open, windows, manager } = setup(); await open()
    const editor = windows[0]
    const stop = manager.stop()
    expect(editor.destroyed).toBe(false)
    expect(editor.webContents.send).not.toHaveBeenCalledWith('comic:editor-close-requested', expect.anything())
    ipc.listeners.get('comic:editor-ready')!(editor.event())
    const token = editor.webContents.send.mock.calls.at(-1)![1]
    ipc.listeners.get('comic:editor-close-result')!(editor.event(), { token, ok: true })
    await stop
    expect(editor.destroyed).toBe(true)
  })
  it('waits for the bound main-frame save acknowledgment before destruction', async () => {
    const { open, windows, manager } = setup(); await open()
    const editor = windows[0]
    ipc.listeners.get('comic:editor-ready')!(editor.event())
    const stop = manager.stop()
    expect(editor.destroyed).toBe(false)
    const token = editor.webContents.send.mock.calls.find(call => call[0] === 'comic:editor-close-requested')![1]
    ipc.listeners.get('comic:editor-close-result')!(editor.event(), { token: 'spoof', ok: true })
    expect(editor.destroyed).toBe(false)
    ipc.listeners.get('comic:editor-close-result')!(editor.event(), { token, ok: true })
    await stop
    expect(editor.destroyed).toBe(true)
  })
  it('keeps the editor and its permission alive after a failed save, and permits retry', async () => {
    const { open, windows, manager } = setup(); await open()
    const editor = windows[0]
    ipc.listeners.get('comic:editor-ready')!(editor.event())
    const failed = manager.stop()
    const token = editor.webContents.send.mock.calls.at(-1)![1]
    ipc.listeners.get('comic:editor-close-result')!(editor.event(), { token, ok: false })
    await expect(failed).rejects.toThrow('comicEditorSaveFailed')
    expect(editor.destroyed).toBe(false)
    expect(manager.isEditorSender(editor.event(), projectId)).toBe(true)
    const retry = manager.stop()
    ipc.listeners.get('comic:editor-close-result')!(editor.event(), { token: editor.webContents.send.mock.calls.at(-1)![1], ok: true })
    await retry
  })
  it('times out a hung save without destroying the editor or dropping permission', async () => {
    vi.useFakeTimers()
    try {
      const { open, windows, manager } = setup(); await open()
      ipc.listeners.get('comic:editor-ready')!(windows[0].event())
      const failed = expect(manager.stop()).rejects.toThrow('comicEditorSaveFailed')
      await vi.advanceTimersByTimeAsync(15_000)
      await failed
      expect(dialog.showMessageBox).toHaveBeenCalledWith(windows[0], expect.objectContaining({ type: 'error', message: expect.stringContaining('kept open') }))
      expect(windows[0].destroyed).toBe(false)
      expect(manager.isEditorSender(windows[0].event(), projectId)).toBe(true)
      windows[0].destroy()
    } finally { vi.useRealTimers() }
  })
  it('closing one project does not close another editor', async () => {
    const { open, windows, manager } = setup(); await open(); await open(secondId)
    for (const window of windows) ipc.listeners.get('comic:editor-ready')!(window.event())
    const event = { preventDefault: vi.fn() }
    windows[0].emit('close', event)
    ipc.listeners.get('comic:editor-close-result')!(windows[0].event(), { token: windows[0].webContents.send.mock.calls.at(-1)![1], ok: true })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(windows[0].destroyed).toBe(true)
    expect(windows[1].destroyed).toBe(false)
    const stop = manager.stop()
    ipc.listeners.get('comic:editor-close-result')!(windows[1].event(), { token: windows[1].webContents.send.mock.calls.at(-1)![1], ok: true })
    await stop
  })
})
