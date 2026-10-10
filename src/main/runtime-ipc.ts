import { loggedHandle } from './logged-ipc'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { RuntimeManager } from './runtime-manager'

export function registerRuntimeIpc(manager: RuntimeManager, window: () => BrowserWindow | null,
  prepare: () => Promise<void>, isSessionBusy: () => boolean,
  whenRuntimeReady: () => Promise<void> = async () => {},
  install: (id: string, repair: boolean) => Promise<void> = (id, repair) => manager.install(id, repair)): () => void {
  const channels = ['runtime:list', 'runtime:install', 'runtime:import', 'runtime:cancel', 'runtime:prepare', 'runtime:settings']
  loggedHandle(channels[5], (_event, component: unknown) => {
    if (component !== 'engine' && component !== 'llama') throw new Error('组件无效')
    const main = window()
    if (!main) return
    if (main.isMinimized()) main.restore()
    main.show(); main.focus()
    main.webContents.send('app:appearance-requested', component === 'engine' ? 'torch' : 'llama')
  })
  loggedHandle(channels[0], async () => { await whenRuntimeReady(); return manager.snapshot() })
  loggedHandle(channels[1], async (_event, id: unknown, repair: unknown) => {
    await whenRuntimeReady()
    if (isSessionBusy()) throw new Error('请先停止同传，再准备或修复环境')
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('运行包 ID 无效')
    if (repair !== undefined && typeof repair !== 'boolean') throw new Error('修复参数无效')
    return install(id, repair === true)
  })
  loggedHandle(channels[2], async () => {
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
  loggedHandle(channels[3], () => manager.cancel())
  loggedHandle(channels[4], async () => { await whenRuntimeReady(); await prepare(); return manager.snapshot() })
  return () => { manager.cancel(); for (const channel of channels) ipcMain.removeHandler(channel) }
}
