import { writeFile } from 'node:fs/promises'

import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, screen } from 'electron'
import { z } from 'zod'

import { exportSrt, exportText, exportWebVtt, type HistoryStore } from './history-store'
import type { EngineProcess } from './engine-process'
import type { SettingsStore } from './settings-store'
import type { SecureCredentialStore } from './secure-store'
import { computeOverlayBounds } from './windows'
import type { AppSettings, AppSettingsPatch } from '../shared/settings'

const channels = {
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings',
  listHistory: 'history:list', clearHistory: 'history:clear', exportHistory: 'history:export',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
} as const

export const APP_IPC_CHANNELS = channels

const settingsPatchSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  historyEnabled: z.boolean().optional(),
  overlay: z.object({
    mode: z.enum(['free', 'top', 'bottom']).optional(), locked: z.boolean().optional(),
    alwaysOnTop: z.boolean().optional(), fontFamily: z.string().max(128).optional(),
    fontSize: z.number().min(14).max(72).optional(), fontWeight: z.number().min(300).max(800).optional(),
    sourceColor: z.string().max(32).optional(), translationColor: z.string().max(32).optional(),
    backgroundOpacity: z.number().min(0.2).max(1).optional(), maxLines: z.number().int().min(1).max(10).optional(),
    lineHeight: z.number().min(1).max(2).optional(), showSource: z.boolean().optional(), showTranslation: z.boolean().optional(),
  }).partial().optional(),
  translation: z.object({
    provider: z.enum(['argos', 'microsoft', 'openai', 'ollama']).optional(),
    microsoftEndpoint: z.string().min(1).max(2048).optional(), microsoftRegion: z.string().max(128).optional(),
    openaiEndpoint: z.string().min(1).max(2048).optional(), openaiModel: z.string().min(1).max(256).optional(),
    ollamaEndpoint: z.string().min(1).max(2048).optional(), ollamaModel: z.string().min(1).max(256).optional(),
    allowIntermediate: z.boolean().optional(),
  }).partial().optional(),
}).strict()

function diagnostics(engine: EngineProcess): Record<string, string | number> {
  return {
    应用版本: app.getVersion(), Electron: process.versions.electron,
    Chromium: process.versions.chrome, Node: process.versions.node,
    操作系统: `${process.platform} ${process.getSystemVersion()}`,
    引擎状态: engine.currentState, 引擎重启次数: engine.restartCount,
    语音识别: 'sherpa-onnx / faster-whisper',
    本地翻译: 'Argos Translate',
    数据目录: app.getPath('userData'),
  }
}

export function registerAppIpc(options: {
  settings: SettingsStore
  initialSettings: AppSettings
  history: HistoryStore
  credentials: SecureCredentialStore
  engine: EngineProcess
  getOverlayWindow: () => BrowserWindow | null
  getMainWindow: () => BrowserWindow | null
}): () => void {
  let current = options.initialSettings
  const applyOverlay = (): void => {
    const window = options.getOverlayWindow()
    if (!window) return
    window.setAlwaysOnTop(current.overlay.alwaysOnTop, 'screen-saver')
    window.setIgnoreMouseEvents(current.overlay.locked, { forward: true })
    window.setFocusable(!current.overlay.locked)
    const display = screen.getDisplayMatching(window.getBounds())
    window.setBounds(computeOverlayBounds(current.overlay.mode, display.workArea, window.getBounds()))
    window.webContents.send('settings:changed', current)
  }
  const broadcastSettings = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('settings:changed', current)
    }
  }
  const applyTheme = (): void => {
    nativeTheme.themeSource = current.theme
    options.getMainWindow()?.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1f1f1f',
      height: 48,
    })
  }
  applyOverlay()
  applyTheme()

  ipcMain.handle(channels.getSettings, () => current)
  ipcMain.handle(channels.updateSettings, async (_event, raw: unknown) => {
    const patch = settingsPatchSchema.parse(raw) as AppSettingsPatch
    current = await options.settings.update(patch)
    await options.history.setEnabled(current.historyEnabled)
    applyOverlay()
    applyTheme()
    broadcastSettings()
    return current
  })
  ipcMain.handle(channels.listHistory, () => options.history.list())
  ipcMain.handle(channels.clearHistory, () => options.history.clear())
  ipcMain.handle(channels.exportHistory, async (_event, format: unknown) => {
    if (!['txt', 'srt', 'vtt'].includes(String(format))) throw new Error('导出格式无效')
    const value = String(format) as 'txt' | 'srt' | 'vtt'
    const result = await dialog.showSaveDialog({
      title: '导出字幕', defaultPath: `FluentCaptions.${value === 'vtt' ? 'vtt' : value}`,
      filters: [{ name: value.toUpperCase(), extensions: [value] }],
    })
    if (result.canceled || !result.filePath) return null
    const segments = options.history.list()
    const content = value === 'srt' ? exportSrt(segments) : value === 'vtt' ? exportWebVtt(segments) : exportText(segments)
    await writeFile(result.filePath, content, 'utf8')
    return result.filePath
  })
  ipcMain.handle(channels.getDiagnostics, () => diagnostics(options.engine))
  ipcMain.handle(channels.copyDiagnostics, () => clipboard.writeText(JSON.stringify(diagnostics(options.engine), null, 2)))
  ipcMain.handle(channels.hasTranslationCredential, (_event, provider: unknown) => {
    if (provider !== 'microsoft' && provider !== 'openai') throw new Error('凭据类型无效')
    return options.credentials.has(provider)
  })
  ipcMain.handle(channels.setTranslationCredential, (_event, provider: unknown, value: unknown) => {
    if (provider !== 'microsoft' && provider !== 'openai') throw new Error('凭据类型无效')
    if (typeof value !== 'string' || value.length > 4096) throw new Error('凭据内容无效')
    return options.credentials.set(provider, value)
  })

  return () => Object.values(channels).forEach((channel) => ipcMain.removeHandler(channel))
}
