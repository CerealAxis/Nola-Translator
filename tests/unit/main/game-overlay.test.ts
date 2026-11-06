import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { BrowserWindow } from 'electron'
import { GameSubtitleWindow } from '../../../src/main/game-overlay'
import { observeScreenWindow, type ScreenTargetState } from '../../../src/main/screen-target'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { GameSnapshot } from '../../../src/shared/game-translation'

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: -1280, y: 0, width: 1280, height: 720 } }) } }))
vi.mock('../../../src/main/screen-target', () => ({ observeScreenWindow: vi.fn(() => vi.fn()) }))
const windows: Array<ReturnType<typeof fakeWindow>> = []
let nextWindowId = 0
function fakeWindow() {
  const window = { destroyed: false, visible: false, destroy() { this.destroyed = true; this.visible = false }, isDestroyed() { return this.destroyed },
    showInactive() { this.visible = true }, hide() { this.visible = false }, setBounds: vi.fn(), setContentProtection: vi.fn(), setIgnoreMouseEvents: vi.fn(), setAlwaysOnTop: vi.fn(),
    loadFile: vi.fn(async () => {}), loadURL: vi.fn(async () => {}),
    webContents: Object.assign(new EventEmitter(), { id: ++nextWindowId, setWindowOpenHandler: vi.fn(), isLoadingMainFrame: () => false, send: vi.fn() }) }
  return window
}
const overlays: GameSubtitleWindow[] = []
afterEach(() => { for (const overlay of overlays.splice(0)) overlay.close(); windows.length = 0; vi.clearAllMocks() })
function create() {
  vi.mocked(BrowserWindow).mockImplementation(function () { const window = fakeWindow(); windows.push(window); return window as unknown as BrowserWindow })
  const unavailable = vi.fn(), overlay = new GameSubtitleWindow('C:/Nola/out/main', () => DEFAULT_SETTINGS, unavailable)
  overlays.push(overlay)
  return { overlay, unavailable }
}
function snapshot(sessionId = 'session'): GameSnapshot {
  return { version: 1, revision: 0, profiles: [], status: 'running', source: 'clipboard', sessionId, hookAvailable: false,
    lines: [{ id: 'line', text: 'source', translation: 'translated', status: 'ready' }] }
}

it('creates a protected click-through subtitle, hides during replacement and pause, and destroys on stop', () => {
  const { overlay } = create()
  overlay.begin('session'); overlay.update(snapshot())
  const window = windows[0]
  expect(window.visible).toBe(true)
  expect(window.setContentProtection).toHaveBeenCalledWith(true)
  expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
  expect(overlay.owns(window.webContents.id)).toBe(true)
  overlay.clearCurrent(); overlay.update(snapshot())
  expect(window.visible).toBe(false)
  const next = snapshot(); next.lines = [{ id: 'new', text: 'new source', status: 'translating' }]
  overlay.update(next); expect(window.visible).toBe(false)
  next.lines[0] = { ...next.lines[0], status: 'ready', translation: 'new translation' }
  overlay.update(next); expect(window.visible).toBe(true)
  overlay.update({ ...next, status: 'paused' }); expect(window.visible).toBe(false)
  overlay.close(); expect(window.destroyed).toBe(true); expect(overlay.owns(window.webContents.id)).toBe(false)
  overlay.update(next); expect(windows).toHaveLength(1)
})

it('fences old snapshots and renderer load callbacks after a replacement session', () => {
  const { overlay, unavailable } = create()
  overlay.begin('old'); overlay.update(snapshot('old'))
  const old = windows[0]
  overlay.begin('new'); overlay.update(snapshot('new'))
  overlay.update(snapshot('old')); old.webContents.emit('did-finish-load'); old.webContents.emit('render-process-gone')
  expect(old.destroyed).toBe(true)
  expect(windows[1].webContents.send).toHaveBeenLastCalledWith('game:changed', expect.objectContaining({ sessionId: 'new' }))
  expect(unavailable).not.toHaveBeenCalled()
})

it('tracks Hook target geometry and gates Alt-Tab, minimize and replaced HWND identities', () => {
  const { overlay, unavailable } = create()
  overlay.begin('session', 'window:123:0')
  const targetChanged = vi.mocked(observeScreenWindow).mock.calls[0][1]
  const state: ScreenTargetState = { available: true, foreground: true, identity: 'original', bounds: { x: 100, y: 150, width: 800, height: 600 }, candidates: [] }
  overlay.update({ ...snapshot(), source: 'hook' }); expect(windows[0].visible).toBe(false)
  targetChanged(state); expect(windows[0].visible).toBe(true)
  expect(windows[0].setBounds).toHaveBeenLastCalledWith({ x: 160, y: 540, width: 680, height: 180 })
  targetChanged({ ...state, foreground: false }); expect(windows[0].visible).toBe(false)
  targetChanged({ ...state, available: false }); expect(windows[0].visible).toBe(false)
  targetChanged({ ...state, bounds: { ...state.bounds, x: -1000 } }); expect(windows[0].visible).toBe(true)
  targetChanged({ ...state, identity: 'replacement' }); expect(unavailable).toHaveBeenCalledOnce()
  overlay.close(); targetChanged(state); expect(windows[0].visible).toBe(false)
})
