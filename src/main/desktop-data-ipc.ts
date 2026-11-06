import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { backupOptionsSchema } from '../shared/desktop-data'
import { loggedHandle } from './logged-ipc'
import type { DesktopDataManager } from './desktop-data'

export function registerDesktopDataIpc(manager: DesktopDataManager, options: {
  getWindow(): BrowserWindow | null; busy(): boolean; selectRoot(root: string): void
}): () => void {
  let preparing = false
  const channels = ['desktop-data:snapshot', 'desktop-data:backup', 'desktop-data:restore']
  const handle = (channel: string, listener: (window: BrowserWindow, value: unknown) => Promise<unknown>) => {
    loggedHandle(channel, async (event, value: unknown) => {
      const window = options.getWindow()
      if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('INVALID_ARGUMENT')
      return listener(window, value)
    })
  }
  const check = () => { if (preparing || manager.pending || options.busy()) throw new Error('DATA_OPERATION_BUSY') }
  handle(channels[0], () => manager.snapshot())
  handle(channels[1], async (window, raw) => {
    const request = backupOptionsSchema.parse(raw)
    check(); preparing = true
    try {
      const selected = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      if (selected.canceled || !selected.filePaths[0]) return false
      if (options.busy()) throw new Error('DATA_OPERATION_BUSY')
      await manager.queueBackup(selected.filePaths[0], request, () => !options.busy())
      app.relaunch(); app.quit()
      return true
    } finally { preparing = false }
  })
  handle(channels[2], async (window, raw) => {
    const password = z.string().max(1024).optional().parse(raw)
    check(); preparing = true
    try {
      const selected = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      if (selected.canceled || !selected.filePaths[0]) return false
      await manager.queueRestore(selected.filePaths[0], join(dirname(manager.root), `Nola-Restored-${randomUUID()}`), password, options.selectRoot, () => !options.busy())
      app.relaunch(); app.quit()
      return true
    } finally { preparing = false }
  })
  return () => { for (const channel of channels) ipcMain.removeHandler(channel) }
}
