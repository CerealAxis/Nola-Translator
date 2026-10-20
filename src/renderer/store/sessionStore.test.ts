import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { SessionConfig } from '@/bridge'
import { attachSessionStore, detachSessionStore, sessionStore, startSession } from './sessionStore'
import { isSessionAlreadyRunningError } from '../../shared/ipc-error'

const remoteConfig: SessionConfig = {
  audioSource: { kind: 'defaultOutput' },
  recognitionMode: 'realtime',
  recognitionProvider: 'aliyun',
  recognitionModelId: 'sensevoice-small',
  sourceLanguage: 'auto',
  targetLanguages: ['zh'],
  translationProvider: 'mymemory',
}

afterEach(() => {
  detachSessionStore()
  vi.restoreAllMocks()
})

it('continues desktop startup when the advisory browser status query rejects', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.settings, 'browserConnection').mockRejectedValue(new Error('status IPC unavailable'))
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  vi.spyOn(bridge.engine, 'listResources').mockResolvedValue({ storagePath: '', resources: [] })
  const start = vi.spyOn(bridge.engine, 'startSession').mockResolvedValue({ sessionId: 'session-1', meetingId: null })
  attachSessionStore(bridge)

  await expect(startSession(remoteConfig)).resolves.toBeUndefined()

  expect(start).toHaveBeenCalledWith(remoteConfig)
  expect(sessionStore.getState()).toMatchObject({ status: 'running', sessionId: 'session-1', errorCode: null })
})

it('still rejects a browser session reservation before starting the engine session', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.settings, 'browserConnection').mockResolvedValue({
    enabled: true,
    registered: true,
    connections: 0,
    captionServiceActive: true,
    sessionActive: false,
    sessionStarting: false,
  })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  const start = vi.spyOn(bridge.engine, 'startSession')
  attachSessionStore(bridge)

  const result = startSession(remoteConfig)
  const error = await result.catch((reason: unknown) => reason)
  expect(isSessionAlreadyRunningError(error)).toBe(true)
  expect(start).not.toHaveBeenCalled()
})

it('keeps a runtime failure code after the IPC layer sends it as a plain message', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.settings, 'browserConnection').mockResolvedValue({
    enabled: true, registered: true, connections: 0, captionServiceActive: false, sessionActive: false,
  })
  vi.spyOn(bridge.engine, 'listResources').mockResolvedValue({ storagePath: '', resources: [] })
  vi.spyOn(bridge.engine, 'startSession').mockRejectedValue(new Error('RUNTIME_TORCH'))
  attachSessionStore(bridge)

  await expect(startSession(remoteConfig)).rejects.toThrow('RUNTIME_TORCH')
  expect(sessionStore.getState()).toMatchObject({ status: 'error', errorCode: 'RUNTIME_TORCH' })
})

it('attaches a recording to an adopted session without resetting its transcript', () => {
  const bridge = createIpcBridge()
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { receive = callback; return () => undefined })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  attachSessionStore(bridge)
  receive({ protocolVersion: 1, type: 'sessionStarted', requestId: 'start', sessionId: 'shared' })
  const segment = { segmentId: 'line', revision: 1, startedAtMs: 0, sourceLanguage: 'en', sourceText: 'Hello', isFinal: true, translations: [] }
  receive({ protocolVersion: 1, type: 'caption', requestId: 'caption', sessionId: 'shared', segment })
  receive({ protocolVersion: 1, type: 'sessionStarted', requestId: 'attached', sessionId: 'shared', meetingId: 'meeting-shared' })
  expect(sessionStore.getState()).toMatchObject({ status: 'running', sessionId: 'shared', meetingId: 'meeting-shared', segments: [segment] })
  receive({ protocolVersion: 1, type: 'sessionStarted', requestId: 'late', sessionId: 'old', meetingId: 'old-meeting' })
  expect(sessionStore.getState().meetingId).toBe('meeting-shared')
})
