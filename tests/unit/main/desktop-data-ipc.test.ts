import { beforeEach, expect, it, vi } from 'vitest'
import type { DesktopDataManager } from '../../../src/main/desktop-data'

const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<unknown>>(), dialog: vi.fn(), quit: vi.fn(), relaunch: vi.fn() }))
vi.mock('../../../src/main/logged-ipc', () => ({ loggedHandle: (name: string, callback: (...args: any[]) => Promise<unknown>) => mock.handlers.set(name, callback) }))
vi.mock('electron', () => ({ app: { quit: mock.quit, relaunch: mock.relaunch }, dialog: { showOpenDialog: mock.dialog }, ipcMain: { removeHandler: vi.fn() } }))
import { registerDesktopDataIpc } from '../../../src/main/desktop-data-ipc'

beforeEach(() => { mock.handlers.clear(); vi.clearAllMocks() })
function setup() {
  const frame = {}, window = { isDestroyed: () => false, webContents: { mainFrame: frame } }
  const event = { sender: window.webContents, senderFrame: frame }
  const manager = { pending: false, root: 'D:/Data', snapshot: vi.fn(), queueBackup: vi.fn(), queueRestore: vi.fn() }
  const busy = vi.fn(() => false)
  registerDesktopDataIpc(manager as unknown as DesktopDataManager, { getWindow: () => window as never, busy, selectRoot: vi.fn() })
  return { event, manager, busy }
}

it('rejects subframes before opening a filesystem dialog', async () => {
  const { event } = setup()
  await expect(mock.handlers.get('desktop-data:backup')!({ ...event, senderFrame: {} }, { audio: true, models: false })).rejects.toThrow('INVALID_ARGUMENT')
  expect(mock.dialog).not.toHaveBeenCalled()
})
it('cancelling the folder picker schedules nothing and keeps the app open', async () => {
  const { event, manager } = setup()
  mock.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
  expect(await mock.handlers.get('desktop-data:backup')!(event, { audio: true, models: false })).toBe(false)
  expect(manager.queueBackup).not.toHaveBeenCalled()
  expect(mock.quit).not.toHaveBeenCalled()
})
it('rejects running tasks and queues a backup before restarting', async () => {
  const { event, manager, busy } = setup()
  busy.mockReturnValue(true)
  await expect(mock.handlers.get('desktop-data:backup')!(event, { audio: true, models: false })).rejects.toThrow('DATA_OPERATION_BUSY')
  busy.mockReturnValue(false)
  mock.dialog.mockResolvedValue({ canceled: false, filePaths: ['D:/Backups'] })
  expect(await mock.handlers.get('desktop-data:backup')!(event, { audio: true, models: false })).toBe(true)
  expect(manager.queueBackup).toHaveBeenCalledWith('D:/Backups', { audio: true, models: false }, expect.any(Function))
  expect(mock.relaunch).toHaveBeenCalledOnce()
  expect(mock.quit).toHaveBeenCalledOnce()
})
it('a failed restore validation keeps the app open', async () => {
  const { event, manager } = setup()
  mock.dialog.mockResolvedValue({ canceled: false, filePaths: ['D:/Backup'] })
  manager.queueRestore.mockRejectedValue(new Error('DATA_PASSWORD_INVALID'))
  await expect(mock.handlers.get('desktop-data:restore')!(event, 'password')).rejects.toThrow('DATA_PASSWORD_INVALID')
  expect(mock.quit).not.toHaveBeenCalled()
})
