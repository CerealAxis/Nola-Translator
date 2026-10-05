import { writeFile } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, screen } from 'electron'

import { exportSrt, exportText, exportWebVtt, type MeetingStore } from './meeting-store'
import { freeBytesForDirectory } from './disk-usage'
import type { EngineProcess } from './engine-process'
import { resolveDataRoot, writeDataRootPointer, writePendingDataMigration } from './data-root'
import { isSameOrInside } from './data-migration'
import type { SettingsStore } from './settings-store'
import type { SecureCredentialStore } from './secure-store'
import { computeOverlayBounds, getOverlayInteractionPolicy, overlayMinimumHeight, OVERLAY_MIN_WIDTH } from './windows'
import type { AppSettings, AppSettingsPatch, CredentialProvider } from '../shared/settings'
import { RECOGNITION_MODEL_LABELS } from '../shared/settings'
import type { ModelStorageInfo } from '../shared/bridge'
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

/**
 * `credentials.json` 允许的顶层键。列表而不是 `provider === 'microsoft' || ...` 那种就地判断：
 * 密钥位的改名（openai → cloud）已经证明过这种写法漏改过一次。
 */
const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = ['cloud', 'microsoft']

function assertCredentialProvider(value: unknown): CredentialProvider {
  if (!CREDENTIAL_PROVIDERS.includes(value as CredentialProvider)) throw new Error('凭据类型无效')
  return value as CredentialProvider
}

async function diagnostics(engine: EngineProcess, settings: AppSettings): Promise<Record<string, string | number>> {
  const modelDir = modelStorageEnvironment(resolveDataRoot(), settings.modelStoragePath).NOLA_TRANSLATOR_MODEL_DIR
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
    数据目录: resolveDataRoot(),
  }
}

export function registerAppIpc(options: {
  settings: SettingsStore
  initialSettings: AppSettings
  meetings: MeetingStore
  /**
   * 会议音频协议的**基址**，含结尾的 `://`（例如 `nola-audio://`）。
   * 拼完整地址时直接接路径，不要再补 `://`。
   */
  audioProtocol: string
  credentials: SecureCredentialStore
  engine: EngineProcess
  getOverlayWindow: () => BrowserWindow | null
  getMainWindow: () => BrowserWindow | null
}): () => void {
  let current = options.initialSettings
  // Single funnel for "where does the app store things when the user has not chosen": the data
  // root, not `userData` (see `data-root.ts`). `activeStoragePath` stays a snapshot of what this
  // process started with, which is what makes the `restartRequired` comparison below true rather
  // than self-cancelling.
  const activeStoragePath = normalize(current.modelStoragePath || resolveDataRoot())
  const configuredStoragePath = () => normalize(current.modelStoragePath || resolveDataRoot())
  const storageInfo = (): ModelStorageInfo => {
    const configuredPath = configuredStoragePath()
    return {
      activePath: activeStoragePath,
      configuredPath,
      restartRequired: activeStoragePath.toLowerCase() !== configuredPath.toLowerCase(),
      freeBytes: freeBytesForDirectory(configuredPath),
    }
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
      title: current.uiLanguage === 'en' ? 'Choose data folder' : '选择数据文件夹',
      defaultPath: configuredStoragePath(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    // The validator returns a normalised absolute path, and doubles as the write probe: it has just
    // created and removed a real directory there, which is the only honest gate for "this folder is
    // usable" before anything is recorded about it.
    const chosen = await validateModelStorageDirectory(result.filePaths[0])
    // Captured **before** the pointer is written, and it is the live root rather than
    // `configuredStoragePath()`: the source has to be where this process is really keeping its
    // files. `resolveDataRoot()` reads the pointer, so asking for it after `writeDataRootPointer`
    // would hand back the folder just picked and record a move of the root onto itself.
    const currentDataRoot = resolveDataRoot()
    // Re-picking the folder already in use is not a data-root change. Writing a pointer and a marker
    // for it would make the next launch try to move the root onto itself, so nothing is recorded and
    // `storageInfo()` comes back unchanged with `restartRequired: false`.
    if (chosen.toLowerCase() === currentDataRoot.toLowerCase()) return storageInfo()
    // **Nothing is moved here, on purpose.** At this moment the meeting store holds open audio files
    // and the credential store holds `credentials.json`, and a relocation moves gigabytes (the
    // runtimes alone are roughly 687 MB). Moving your own files from inside a running process makes
    // "the migration failed" indistinguishable from "something wrote while it was moving", and there
    // is no way to retry that safely. The pointer plus the marker are the whole contract here; the
    // move happens on the next launch, before any store opens a handle.
    //
    // **标记先写、指针后写，顺序不能反。** 两次写之间崩了，两种顺序的后果不对称：
    //   标记已写、指针未写 → 下次启动 `resolveDataRoot()` 拿不到指针，回到旧根，迁移源与当前根
    //     相同而被跳过，数据一根汗毛没动；下次再选目录时标记被覆盖，收敛。
    //   指针已写、标记未写 → 下次启动指向一个**空的新根**，且没有标记可重试。用户的会议记录、
    //     设置和 API key 看上去全部消失，而这正是这一整串改动要防的事。
    // 两个文件都是单次同步写，中间只有进程崩溃这一个窗口，所以顺序就是全部的安全性。
    // 旧版 `modelStoragePath` 允许把 models/runtimes 指向数据根之外的任意绝对目录，正常遍历
    // 看不见它，所以它必须记进标记 —— 而且**必须在下面把设置改空之前记**。
    //
    // 顺序的理由和上面「标记先写、指针后写」同源，但这次要保住的是那个遗留目录本身：标记是
    // 指针之外唯一能活到下次启动的记录，而紧接着的 `modelStoragePath: ''` 会把这条路径从
    // settings.json 里彻底抹掉。标记一旦漏了它，这次搬家就再没有任何地方写着用户的模型在哪儿
    // ——搬完之后应用只认新数据根，那边若是空的，遗留目录里的几个 GB 既没被复制也没被删除，
    // 而设置页正写着"设置、会议、模型和运行时都在这个文件夹里"。
    //
    // 空值本来就等于"跟着数据根走"，不用带；落在数据根**之内**的值也不用带，那已经是同一棵树
    // 的子目录，正常遍历覆盖得到，带上只会让同一份数据有两个来源。
    const legacySources = current.modelStoragePath === '' || !isAbsolute(current.modelStoragePath)
      || isSameOrInside(currentDataRoot, current.modelStoragePath)
      ? []
      : [normalize(current.modelStoragePath)]
    writePendingDataMigration(currentDataRoot, legacySources)
    writeDataRootPointer(chosen)
    // Cleared explicitly rather than left pointing at the old root: models, cache and runtimes must
    // follow the new data root instead of staying pinned where the data was before. (`settings.json`
    // already treats a non-absolute value as empty, but an explicit `''` says it on purpose.) The old
    // location is not lost by this rewrite — the marker above carries it, which is exactly why the
    // marker has to be written first.
    current = await options.settings.update({ modelStoragePath: '' })
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
    /*
     * `audioProtocol` 已经是**带 `://` 的基址**（`nola-audio://`，见 `index.ts`），
     * 这里只能直接拼路径。原来这里又写了一个 `://`，拼出来是
     * `nola-audio://://local/<id>/audio.wav` —— 那个字符串连 WHATWG 的
     * `new URL()` 都会抛 `ERR_INVALID_URL`（scheme 后面不能跟 `://://`），
     * 于是 `<audio>` 在 Chromium 解析阶段就失败，连一次请求都发不出去，
     * `audio-protocol.ts` 里那套 range / 206 的实现一次都没被调用。
     *
     * 表现是"点了播放没反应"而不是报错：总时长来自 meta 的 `audioDurationMs`，
     * 所以界面看着完全正常；`play()` 的 rejection 又被播放条按设计静默吞掉。
     *
     * 形状必须是 `nola-audio://local/<id>/audio.wav`（`local` 当 **host**）：
     * `tests/e2e/check-layout.mjs` 里的假桥返回的也是这个形状，处理器那边
     * 按 host + pathname 匹配。两边不一致时，以这里为准改假桥，不要各改各的。
     */
    return meta?.audioFile ? `${options.audioProtocol}local/${meetingId}/${meta.audioFile}` : null
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
  ipcMain.handle(channels.hasTranslationCredential, (_event, provider: unknown) =>
    options.credentials.has(assertCredentialProvider(provider)))
  ipcMain.handle(channels.setTranslationCredential, (_event, provider: unknown, value: unknown) => {
    const target = assertCredentialProvider(provider)
    if (typeof value !== 'string' || value.length > 4096) throw new Error('凭据内容无效')
    return options.credentials.set(target, value)
  })

  return () => Object.values(channels).forEach((channel) => ipcMain.removeHandler(channel))
}
