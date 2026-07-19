import { randomUUID } from 'node:crypto'

import { BrowserWindow, ipcMain } from 'electron'

import type { EngineEvent, SessionConfig } from '../shared/contracts'
import { sessionConfigSchema } from '../shared/schemas'
import type { EngineProcess } from './engine-process'

export const IPC_CHANNELS = {
  listDevices: 'engine:list-devices',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  event: 'engine:event',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
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
  })

  ipcMain.handle(IPC_CHANNELS.showOverlay, () => getOverlayWindow()?.showInactive())
  ipcMain.handle(IPC_CHANNELS.hideOverlay, () => getOverlayWindow()?.hide())

  const forwardEvent = (event: EngineEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.event, event)
    }
    if (event.type === 'sessionStopped') activeSessionId = null
  }
  engine.on('event', forwardEvent)

  return () => {
    engine.off('event', forwardEvent)
    for (const channel of [
      IPC_CHANNELS.listDevices,
      IPC_CHANNELS.startSession,
      IPC_CHANNELS.stopSession,
      IPC_CHANNELS.showOverlay,
      IPC_CHANNELS.hideOverlay,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
