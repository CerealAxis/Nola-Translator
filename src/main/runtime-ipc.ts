import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { RuntimeManager } from './runtime-manager'

export function registerRuntimeIpc(manager: RuntimeManager, window: () => BrowserWindow | null,
  prepare: () => Promise<void>, isSessionBusy: () => boolean,
  whenRuntimeReady: () => Promise<void> = async () => {}): () => void {
  const channels = ['runtime:list', 'runtime:install', 'runtime:import', 'runtime:cancel', 'runtime:prepare']
  ipcMain.handle(channels[0], async () => { await whenRuntimeReady(); return manager.snapshot() })
  ipcMain.handle(channels[1], async (_event, id: unknown, repair: unknown) => {
    await whenRuntimeReady()
    if (isSessionBusy()) throw new Error('请先停止同传，再准备或修复环境')
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('运行包 ID 无效')
    if (repair !== undefined && typeof repair !== 'boolean') throw new Error('修复参数无效')
    return manager.install(id, repair === true)
  })
  ipcMain.handle(channels[2], async () => {
    await whenRuntimeReady()
    if (isSessionBusy()) throw new Error('请先停止同传，再导入环境')
    const parent = window()
    if (!parent) return false
    const result = await dialog.showOpenDialog(parent, {
      title: '导入离线推理运行包', properties: ['openFile'], filters: [{ name: 'Runtime package / dependency wheel', extensions: ['zip', 'whl'] }],
    })
    if (result.canceled || !result.filePaths[0]) return false
    await manager.importArchive(result.filePaths[0])
    return true
  })
  ipcMain.handle(channels[3], () => manager.cancel())
  ipcMain.handle(channels[4], async () => { await prepare(); return manager.snapshot() })
  return () => { manager.cancel(); for (const channel of channels) ipcMain.removeHandler(channel) }
}
