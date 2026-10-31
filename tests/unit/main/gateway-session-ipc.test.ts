import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineProcess } from '../../../src/main/engine-process'
import { SessionController } from '../../../src/main/session-controller'

const { send, handlers } = vi.hoisted(() => ({ send: vi.fn(), handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }] },
  ipcMain: { removeHandler: vi.fn() }, net: { fetch: vi.fn() }, screen: {} }))
vi.mock('../../../src/main/logged-ipc', () => ({ loggedHandle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) }))
vi.mock('../../../src/main/overlay-menu', () => ({ openOverlayMenu: vi.fn(), presentOverlayMenu: vi.fn(), closeOverlayMenu: vi.fn() }))
import { registerEngineIpc } from '../../../src/main/ipc'

afterEach(() => { send.mockClear(); handlers.clear() })

it('isolates inventory failures and reports a business process crash as its own stopped session', async () => {
  const inventory = Object.assign(new EventEmitter(), { currentState: 'ready', start: vi.fn() }) as unknown as EngineProcess
  const business = Object.assign(new EventEmitter(), { currentState: 'ready', request: vi.fn(async () => ({ sessionId: 'desktop-session' })), supports: () => true }) as unknown as EngineProcess
  const controller = new SessionController({ engine: business, meetings: null, useGateway: true,
    getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', prepare: async () => {}, whenReady: async () => {},
    startingChanged: () => {}, hideOverlay: vi.fn() })
  const dispose = registerEngineIpc(inventory, () => null, async () => '', null, () => DEFAULT_SETTINGS,
    async () => {}, () => {}, async () => {}, () => {}, controller)
  try {
    await controller.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: [] }, 'desktop')
    send.mockClear()
    inventory.emit('state', 'recovering')
    expect(controller.activeSessionId).toBe('desktop-session')
    expect(send).not.toHaveBeenCalled()
    business.emit('state', 'failed')
    expect(controller.activeSessionId).toBeNull()
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('engine:event', expect.objectContaining({ type: 'sessionStopped', sessionId: 'desktop-session' })))
    expect(send.mock.calls.some(([, event]) => event.type === 'engineStateChanged')).toBe(false)
  } finally { dispose() }
  expect(business.listenerCount('state')).toBe(0)
  expect(business.listenerCount('event')).toBe(0)
})
