import { writeFile } from 'node:fs/promises'
import { normalize } from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, screen } from 'electron'

import { exportSrt, exportText, exportWebVtt, type MeetingStore } from './meeting-store'
import type { EngineProcess } from './engine-process'
import type { SettingsStore } from './settings-store'
import type { SecureCredentialStore } from './secure-store'
import { computeOverlayBounds, getOverlayInteractionPolicy, overlayMinimumHeight, OVERLAY_MIN_WIDTH } from './windows'
import type { AppSettings, AppSettingsPatch } from '../shared/settings'
import { RECOGNITION_MODEL_LABELS } from '../shared/settings'
import { modelStorageEnvironment, readEngineStatus, validateModelStorageDirectory } from './model-storage'
import { settingsPatchSchema } from './settings-schema'

const channels = {
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings',
  openAppearance: 'app:open-appearance',
  getModelStorage: 'storage:get', chooseModelStorageDirectory: 'storage:choose', restartApp: 'app:restart',
  listMeetings: 'meeting:list', getMeeting: 'meeting:get', readMeeting: 'meeting:read',
  renameMeeting: 'meeting:rename', setMeetingNotes: 'meeting:set-notes', deleteMeeting: 'meeting:delete', exportMeeting: 'meeting:export',
  meetingAudioUrl: 'meeting:audio-url',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
} as const

export const APP_IPC_CHANNELS = channels

/** Pages the caption overlay is allowed to send the main window to. */
const OVERLAY_PAGES = new Set(['appearance', 'captions', 'resources', 'translation'])

async function diagnostics(engine: EngineProcess, settings: AppSettings): Promise<Record<string, string | number>> {
  const modelDir = modelStorageEnvironment(settings.modelStoragePath || app.getPath('userData')).NOLA_TRANSLATOR_MODEL_DIR
  const status = await readEngineStatus(modelDir)
  const recognition = status?.recognition
  const hymt2 = status?.hymt2
  return {
    应用版本: app.getVersion(), Electron: process.versions.electron,
    Chromium: process.versions.chrome, Node: process.versions.node,
    操作系统: `${process.platform} ${process.getSystemVersion()}`,
    引擎状态: engine.currentState, 引擎重启次数: engine.restartCount,
    语音识别: recognition?.loaded
      ? `${RECOGNITION_MODEL_LABELS[recognition.modelId]}（${recognition.runtime}）`
      : '未运行',
    本地翻译: hymt2?.ready && hymt2.device
      ? `Hy-MT2 · llama.cpp（${hymt2.device}）`
      : '未运行',
    数据目录: app.getPath('userData'),
  }
}

export function registerAppIpc(options: {
  settings: SettingsStore
  initialSettings: AppSettings
  meetings: MeetingStore
  audioProtocol: string
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
    const display = screen.getDisplayMatching(window.getBounds())
    // The minimum height is a function of the font sizes, so it is re-applied on every settings
    // change rather than frozen at window creation — otherwise raising the font size would leave
    // the bar draggable back down into the "no track gets a line" range we just removed.
    // This is a constraint, not a resize: it never calls setBounds, never repositions, and never
    // recomputes the height the user already chose.
    window.setMinimumSize(OVERLAY_MIN_WIDTH, overlayMinimumHeight(current.overlay, display.workArea.height))
    // Only reposition when the mode itself changed; appearance sliders must not resize a bar the user already sized.
    if (reposition) {
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
    // The app shell follows `settings.theme`, not Windows. nativeTheme stays on 'system' so that
    // media queries (prefers-color-scheme) keep describing the *user's* system, but the title bar
    // symbols must follow what is actually painted — following the system left dark-on-dark
    // minimise/maximise/close glyphs on a dark title bar.
    const dark = current.theme === 'dark' || (current.theme === 'system' && nativeTheme.shouldUseDarkColors)
    options.getMainWindow()?.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: dark ? '#ffffff' : '#1f1f1f',
      height: 48,
    })
  }
  applyOverlay(true)
  applyTheme()

  ipcMain.handle(channels.getSettings, () => current)
  ipcMain.handle(channels.openAppearance, (_event, page: unknown) => {
    const window = options.getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send('app:appearance-requested',
      typeof page === 'string' && OVERLAY_PAGES.has(page) ? page : 'appearance')
  })
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
    // The cast trusts that the schema accepts every field `AppSettingsPatch` declares; that parity
    // is what `settings-schema.test.ts` guards, and it is the one thing that can silently break it.
    const patch = settingsPatchSchema.parse(raw) as AppSettingsPatch
    current = await options.settings.update(patch)
    applyOverlay(patch.overlay?.mode !== undefined)
    applyTheme()
    broadcastSettings()
    return current
  })
  ipcMain.handle(channels.listMeetings, () => options.meetings.list())
  ipcMain.handle(channels.getMeeting, (_event, meetingId: unknown) => {
    if (typeof meetingId !== 'string') throw new Error('会议 ID 无效')
    return options.meetings.get(meetingId)
  })
  ipcMain.handle(channels.readMeeting, async (_event, meetingId: unknown) => {
    if (typeof meetingId !== 'string') throw new Error('会议 ID 无效')
    if (!options.meetings.get(meetingId)) throw new Error('会议不存在')
    return options.meetings.segments(meetingId)
  })
  ipcMain.handle(channels.meetingAudioUrl, (_event, meetingId: unknown) => {
    if (typeof meetingId !== 'string') throw new Error('会议 ID 无效')
    const meta = options.meetings.get(meetingId)
    return meta?.audioFile ? `${options.audioProtocol}://local/${meetingId}/${meta.audioFile}` : null
  })
  ipcMain.handle(channels.renameMeeting, async (_event, meetingId: unknown, title: unknown) => {
    if (typeof meetingId !== 'string' || typeof title !== 'string') throw new Error('会议名称无效')
    const meta = await options.meetings.rename(meetingId, title)
    if (!meta) throw new Error('会议不存在')
    return meta
  })
  ipcMain.handle(channels.setMeetingNotes, async (_event, meetingId: unknown, notes: unknown) => {
    if (typeof meetingId !== 'string' || typeof notes !== 'string') throw new Error('笔记内容无效')
    const meta = await options.meetings.setNotes(meetingId, notes)
    if (!meta) throw new Error('会议不存在')
    return meta
  })
  ipcMain.handle(channels.deleteMeeting, async (_event, meetingId: unknown) => {
    if (typeof meetingId !== 'string') throw new Error('会议 ID 无效')
    await options.meetings.remove(meetingId)
    return true
  })
  ipcMain.handle(channels.exportMeeting, async (_event, meetingId: unknown, format: unknown) => {
    if (typeof meetingId !== 'string') throw new Error('会议 ID 无效')
    if (!['txt', 'srt', 'vtt'].includes(String(format))) throw new Error('导出格式无效')
    const value = String(format) as 'txt' | 'srt' | 'vtt'
    const meta = options.meetings.get(meetingId)
    if (!meta) throw new Error('会议不存在')
    const result = await dialog.showSaveDialog({
      title: current.uiLanguage === 'en' ? 'Export captions' : '导出字幕',
      defaultPath: `${(meta.title || meetingId).slice(0, 60)}.${value}`,
      filters: [{ name: value.toUpperCase(), extensions: [value] }],
    })
    if (result.canceled || !result.filePath) return null
    const segments = await options.meetings.segments(meetingId)
    const content = value === 'srt' ? exportSrt(segments) : value === 'vtt' ? exportWebVtt(segments) : exportText(segments)
    await writeFile(result.filePath, content, 'utf8')
    return result.filePath
  })
  ipcMain.handle(channels.getDiagnostics, () => diagnostics(options.engine, current))
  ipcMain.handle(channels.copyDiagnostics, async () => clipboard.writeText(JSON.stringify(await diagnostics(options.engine, current), null, 2)))
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
