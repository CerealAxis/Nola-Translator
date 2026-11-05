import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { registerWorkspaceView, rememberWorkspaceWindow } from '../../../src/main/workspace-view'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(async (_path: string, _content: string) => {}), rename: vi.fn(async (_from: string, _to: string) => {}), handle: vi.fn() }))
vi.mock('node:fs', () => ({ default: { readFileSync: mocks.read }, readFileSync: mocks.read }))
vi.mock('node:fs/promises', () => ({ default: { writeFile: mocks.write, rename: mocks.rename }, writeFile: mocks.write, rename: mocks.rename }))
vi.mock('../../../src/main/data-root', () => ({ resolveDataRoot: () => 'D:/test-data' }))
vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { handle: mocks.handle }, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 700 } }) } }))

function windowFixture() {
  let pinned = false
  let zoom = 1
  const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, getZoomFactor: () => zoom, setZoomFactor: (value: number) => { zoom = value } })
  const window = Object.assign(new EventEmitter(), {
    webContents, isDestroyed: () => false, getNormalBounds: () => ({ x: 5, y: 5, width: 800, height: 600 }),
    setBounds: vi.fn(), isAlwaysOnTop: () => pinned, setAlwaysOnTop: (value: boolean) => { pinned = value },
  })
  return window as unknown as BrowserWindow & { setBounds: ReturnType<typeof vi.fn> }
}

beforeEach(() => { vi.clearAllMocks(); mocks.read.mockImplementation(() => { throw new Error('Missing') }) })

it('restores an off-screen reader within the current display work area', () => {
  mocks.read.mockReturnValue(JSON.stringify({ pinned: true, zoom: 1.2, bounds: { x: 3000, y: -2000, width: 1800, height: 900 } }))
  const window = windowFixture()
  rememberWorkspaceWindow(window)
  expect(window.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1000, height: 700 })
  window.webContents.emit('did-finish-load')
  expect(window.webContents.getZoomFactor()).toBe(1.2)
  expect(window.isAlwaysOnTop()).toBe(true)
})

it('rejects foreign renderers and subframes and validates zoom before updating the reader', () => {
  const window = windowFixture()
  registerWorkspaceView(() => window)
  const handle = mocks.handle.mock.calls[0][1]
  expect(() => handle({ sender: {}, senderFrame: window.webContents.mainFrame }, { pinned: true })).toThrow('Access denied')
  expect(() => handle({ sender: window.webContents, senderFrame: {} }, { pinned: true })).toThrow('Access denied')
  expect(() => handle({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, { zoom: 100 })).toThrow()
  expect(handle({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, { pinned: true, zoom: 1.4 })).toEqual({ pinned: true, zoom: 1.4 })
})

it('persists an explicit zoom update atomically in the product data root', async () => {
  const window = windowFixture()
  rememberWorkspaceWindow(window)
  registerWorkspaceView(() => window)
  mocks.handle.mock.calls[0][1]({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, { zoom: 1.5 })
  await vi.waitFor(() => expect(mocks.rename).toHaveBeenCalled())
  expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('test-data'), expect.stringContaining('"zoom":1.5'))
  expect(mocks.rename.mock.calls[0][0]).toMatch(/workspace-window\.json\.tmp$/)
  expect(mocks.rename.mock.calls[0][1]).toMatch(/workspace-window\.json$/)
})
