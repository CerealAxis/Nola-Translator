import { BrowserWindow, ipcMain, screen } from 'electron'
import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { WorkspaceView } from '../shared/workspace-view'
import { resolveDataRoot } from './data-root'

const view = z.object({ pinned: z.boolean(), zoom: z.number().finite().min(0.5).max(2) })
const saved = view.extend({ bounds: z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(400), height: z.number().int().min(300) }) })
const persistWindow = new WeakMap<BrowserWindow, () => void>()
const path = () => join(resolveDataRoot(), 'workspace-window.json')

export function readWorkspaceWindow() {
  try { return saved.parse(JSON.parse(readFileSync(path(), 'utf8'))) }
  catch { return undefined }
}

export function rememberWorkspaceWindow(window: BrowserWindow): void {
  const previous = readWorkspaceWindow()
  if (previous) {
    const area = screen.getDisplayMatching(previous.bounds).workArea
    const width = Math.min(area.width, previous.bounds.width)
    const height = Math.min(area.height, previous.bounds.height)
    window.setBounds({ width, height, x: Math.max(area.x, Math.min(previous.bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(previous.bounds.y, area.y + area.height - height)) })
    window.setAlwaysOnTop(previous.pinned)
    window.webContents.once('did-finish-load', () => window.webContents.setZoomFactor(previous.zoom))
  }
  let timer: NodeJS.Timeout | undefined
  let writing = Promise.resolve()
  const persist = () => {
    if (window.isDestroyed()) return
    const content = JSON.stringify({ bounds: window.getNormalBounds(), pinned: window.isAlwaysOnTop(), zoom: window.webContents.getZoomFactor() })
    writing = writing.then(async () => {
      await writeFile(`${path()}.tmp`, content)
      await rename(`${path()}.tmp`, path())
    }).catch(error => console.error('workspace view save failed', error))
  }
  persistWindow.set(window, persist)
  const schedule = () => { clearTimeout(timer); timer = setTimeout(persist, 250) }
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('always-on-top-changed', schedule)
  window.webContents.on('zoom-changed', schedule)
  window.on('close', () => { clearTimeout(timer); persist() })
}

export function registerWorkspaceView(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('workspace:view', (event, value?: unknown): WorkspaceView => {
    const window = getWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Access denied')
    const patch = value === undefined ? {} : view.partial().strict().parse(value)
    if (patch.pinned !== undefined) window.setAlwaysOnTop(patch.pinned)
    if (patch.zoom !== undefined) window.webContents.setZoomFactor(patch.zoom)
    if (Object.keys(patch).length) persistWindow.get(window)?.()
    return { pinned: window.isAlwaysOnTop(), zoom: window.webContents.getZoomFactor() }
  })
}
