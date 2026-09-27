import { writeFile } from 'node:fs/promises'
import { normalize } from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, screen } from 'electron'
import { z } from 'zod'

import { exportSrt, exportText, exportWebVtt, type HistoryStore } from './history-store'
import type { EngineProcess } from './engine-process'
import type { SettingsStore } from './settings-store'
import type { SecureCredentialStore } from './secure-store'
import { computeOverlayBounds, getOverlayInteractionPolicy } from './windows'
import type { AppSettings, AppSettingsPatch } from '../shared/settings'
import { validateModelStorageDirectory } from './model-storage'

const channels = {
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings',
  getModelStorage: 'storage:get', chooseModelStorageDirectory: 'storage:choose', restartApp: 'app:restart',
  listHistory: 'history:list', clearHistory: 'history:clear', exportHistory: 'history:export',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
} as const

export const APP_IPC_CHANNELS = channels

const settingsPatchSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  uiLanguage: z.enum(['zh-CN', 'en']).optional(),
  historyEnabled: z.boolean().optional(),
  recognition: z.object({
    modelId: z.enum(['sherpa-zh-en-small', 'sensevoice-small', 'faster-whisper-small']).optional(),
  }).partial().optional(),
  overlay: z.object({
    mode: z.enum(['free', 'top', 'bottom']).optional(), locked: z.boolean().optional(),
    colorScheme: z.enum(['dark', 'light']).optional(),
    alwaysOnTop: z.boolean().optional(), fontFamily: z.string().max(128).optional(),
    fontSize: z.number().min(14).max(72).optional(), fontWeight: z.number().min(300).max(800).optional(),
    translationFontSize: z.number().min(12).max(72).optional(), translationFontWeight: z.number().min(300).max(800).optional(),
    sourceColor: z.string().max(32).optional(), translationColor: z.string().max(32).optional(), backgroundColor: z.string().max(32).optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(), maxLines: z.number().int().min(1).max(10).optional(),
    lineHeight: z.number().min(1).max(2).optional(), translationMaxLines: z.number().int().min(1).max(10).optional(),
    translationLineHeight: z.number().min(1).max(2).optional(), showSource: z.boolean().optional(), showTranslation: z.boolean().optional(),
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
    语音识别: 'sherpa-onnx / SenseVoice / faster-whisper',
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
  const activeStoragePath = normalize(current.modelStoragePath || app.getPath('userData'))
  const storageInfo = () => {
    const configuredPath = normalize(current.modelStoragePath || app.getPath('userData'))
    return { activePath: activeStoragePath, configuredPath, restartRequired: activeStoragePath.toLowerCase() !== configuredPath.toLowerCase() }
  }
  const applyOverlay = (reposition = false): void => {
    const window = options.getOverlayWindow()
    if (!window) return
    const interaction = getOverlayInteractionPolicy(current.overlay.locked)
    window.setAlwaysOnTop(current.overlay.alwaysOnTop, 'screen-saver')
    window.setIgnoreMouseEvents(interaction.ignoreMouseEvents, { forward: true })
    window.setFocusable(interaction.focusable)
    window.setMovable(interaction.movable)
    window.setResizable(interaction.resizable)
    // 只有用户改动位置模式时才重设窗口边界。外观滑块不应改变用户已调整的尺寸。
    if (reposition) {
      const display = screen.getDisplayMatching(window.getBounds())
      window.setBounds(computeOverlayBounds(current.overlay.mode, display.workArea, window.getBounds()))
    }
    window.webContents.send('settings:changed', current)
  }
  const broadcastSettings = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('settings:changed', current)
    }
  }
  const applyTheme = (): void => {
    // 主程序始终遵循 Windows；“字幕主题”仅控制字幕浮层，二者不能互相影响。
    nativeTheme.themeSource = 'system'
    options.getMainWindow()?.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1f1f1f',
      height: 48,
    })
  }
  applyOverlay(true)
  applyTheme()

  ipcMain.handle(channels.getSettings, () => current)
  ipcMain.handle(channels.getModelStorage, () => storageInfo())
  ipcMain.handle(channels.chooseModelStorageDirectory, async () => {
    const result = await dialog.showOpenDialog({
      title: current.uiLanguage === 'en' ? 'Choose model storage folder' : '选择模型存储文件夹',
      defaultPath: storageInfo().configuredPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const modelStoragePath = await validateModelStorageDirectory(result.filePaths[0])
    current = await options.settings.update({ modelStoragePath })
    broadcastSettings()
    return storageInfo()
  })
  ipcMain.handle(channels.restartApp, () => {
    app.relaunch()
    app.quit()
  })
  ipcMain.handle(channels.updateSettings, async (_event, raw: unknown) => {
    const patch = settingsPatchSchema.parse(raw) as AppSettingsPatch
    current = await options.settings.update(patch)
    await options.history.setEnabled(current.historyEnabled)
    applyOverlay(patch.overlay?.mode !== undefined)
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
      title: current.uiLanguage === 'en' ? 'Export captions' : '导出字幕', defaultPath: `FluentCaptions.${value === 'vtt' ? 'vtt' : value}`,
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
