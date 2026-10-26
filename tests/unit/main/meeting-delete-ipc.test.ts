import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

const { handlers, remove } = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), remove: vi.fn() }))
vi.mock('electron', () => ({
  app: {}, BrowserWindow: {}, clipboard: {}, dialog: {}, nativeTheme: {}, screen: {}, shell: {},
  ipcMain: { on: vi.fn(), off: vi.fn(), removeHandler: vi.fn() },
}))
vi.mock('../../../src/main/logged-ipc', () => ({
  loggedHandle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
}))
import { registerAppIpc } from '../../../src/main/app-ipc'

afterEach(() => { handlers.clear(); remove.mockReset() })

it('rejects traversal before calling the store and keeps valid missing IDs idempotent', async () => {
  const dispose = registerAppIpc({
    initialSettings: { ...DEFAULT_SETTINGS, modelStoragePath: 'C:\\nola-test' },
    meetings: { remove }, getMainWindow: () => null, getOverlayWindow: () => null,
  } as unknown as Parameters<typeof registerAppIpc>[0])
  try {
    const handler = handlers.get('meeting:delete')!
    for (const id of ['../outside', '..\\outside', 'C:\\outside', '', '.', 'a'.repeat(65), null]) {
      await expect(handler({}, id)).rejects.toThrow('INVALID_ARGUMENT')
    }
    expect(remove).not.toHaveBeenCalled()
    await expect(handler({}, 'missing-id')).resolves.toBe(true)
    expect(remove).toHaveBeenCalledExactlyOnceWith('missing-id')
  } finally { dispose() }
})
