import { randomUUID } from 'node:crypto'

import { BrowserWindow, ipcMain, screen } from 'electron'

import type { EngineEvent, SessionConfig } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import type { EngineProcess } from './engine-process'
import { computeOverlayBounds } from './windows'

export const IPC_CHANNELS = {
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  event: 'engine:event',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  resizeOverlay: 'overlay:resize',
} as const

export function registerEngineIpc(
  engine: EngineProcess,
  getOverlayWindow: () => BrowserWindow | null,
  getTranslationCredential: (provider: 'microsoft' | 'openai') => Promise<string> = async () => ''
): () => void {
  let activeSessionId: string | null = null

  const ensureReady = async (): Promise<void> => {
    if (engine.currentState !== 'ready') await engine.start()
  }

  ipcMain.handle(IPC_CHANNELS.listDevices, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listDevices', requestId: `devices-${randomUUID()}` },
      'devices'
    )
    return response.devices
  })

  ipcMain.handle(IPC_CHANNELS.listResources, async () => {
    await ensureReady()
    const response = await engine.request(
      { protocolVersion: 1, type: 'listResources', requestId: `resources-${randomUUID()}` },
      'resources'
    )
    return { storagePath: response.storagePath, resources: response.resources }
  })

  ipcMain.handle(
    IPC_CHANNELS.manageResource,
    async (_event, resourceId: unknown, action: unknown) => {
      if (typeof resourceId !== 'string' || !['install', 'remove', 'cancel'].includes(String(action))) {
        throw new Error('资源操作参数无效')
      }
      await ensureReady()
      const response = await engine.request(
        {
          protocolVersion: 1,
          type: 'manageResource',
          requestId: `resource-action-${randomUUID()}`,
          resourceId,
          action: action as 'install' | 'remove' | 'cancel',
        },
        'resourceActionResult'
      )
      return response.resource
    }
  )

  ipcMain.handle(IPC_CHANNELS.startSession, async (_event, rawConfig: unknown) => {
    await ensureReady()
    if (activeSessionId) throw new Error('已有字幕会话正在运行')
    const parsed = sessionConfigSchema.parse(rawConfig) as SessionConfig
    const provider = parsed.translationProvider ?? 'argos'
    const apiKey = provider === 'microsoft' || provider === 'openai'
      ? await getTranslationCredential(provider)
      : ''
    const config: SessionConfig = apiKey
      ? { ...parsed, translationOptions: { ...parsed.translationOptions, apiKey } }
      : parsed
    const response = await engine.request(
      {
        protocolVersion: 1,
        type: 'startSession',
        requestId: `start-${randomUUID()}`,
        config,
      },
      'sessionStarted',
      30 * 60 * 1000
    )
    activeSessionId = response.sessionId
    getOverlayWindow()?.showInactive()
    return { sessionId: response.sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.stopSession, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId !== activeSessionId) {
      throw new Error('字幕会话 ID 无效')
    }
    await ensureReady()
    await engine.request(
      {
        protocolVersion: 1,
        type: 'stopSession',
        requestId: `stop-${randomUUID()}`,
        sessionId,
      },
      'sessionStopped'
    )
    activeSessionId = null
    getOverlayWindow()?.hide()
  })

  ipcMain.handle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.show())
  ipcMain.handle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())
  ipcMain.handle(IPC_CHANNELS.resizeOverlay, (event, width: unknown, height: unknown) => {
    const window = getOverlayWindow()
    if (!window || event.sender !== window.webContents) return
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    const bounds = window.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    window.setBounds(computeOverlayBounds('free', workArea, { ...bounds,
      width: Math.min(workArea.width, Math.max(420, Math.round(width as number))),
      height: Math.min(workArea.height, Math.max(52, Math.round(height as number))),
    }))
  })

  const forwardEvent = (event: EngineEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, event)
    }
    if (event.type === 'sessionStopped') {
      activeSessionId = null
      getOverlayWindow()?.hide()
    }
  }
  engine.on('event', forwardEvent)

  return () => {
    engine.off('event', forwardEvent)
    for (const channel of [
      IPC_CHANNELS.listDevices,
      IPC_CHANNELS.listResources,
      IPC_CHANNELS.manageResource,
      IPC_CHANNELS.startSession,
      IPC_CHANNELS.stopSession,
      IPC_CHANNELS.showOverlay,
      IPC_CHANNELS.hideOverlay,
      IPC_CHANNELS.resizeOverlay,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
