import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { SessionConfig } from '@/bridge'
import { attachSessionStore, detachSessionStore, resetSessionError, sessionStore, startSession, stopSession } from './sessionStore'
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

it.each(['resource:index-translate-2b-q4-k-m', 'cloud:index-translate'])(
  'starts with the selected ASR and %s when the saved local defaults are not installed',
  async translationBinding => {
    const bridge = createIpcBridge()
    const recognitionModelId = 'qwen3-asr-0.6b-crisp-q4-k'
    const translationModelId = 'index-translate-2b-q4-k-m'
    const localTranslation = translationBinding.startsWith('resource:')
    const installed = { description: '', languages: [], installed: true, installedBytes: 1, state: 'idle', cancellable: false } as const
    vi.spyOn(bridge.settings, 'browserConnection').mockRejectedValue(new Error('status IPC unavailable'))
    vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
    vi.spyOn(bridge.engine, 'listResources').mockResolvedValue({
      storagePath: '',
      resources: [
        { ...installed, languages: [], provider: 'crisp-asr', resourceId: recognitionModelId, name: 'Qwen3-ASR', kind: 'recognitionModel' },
        ...(localTranslation ? [{ ...installed, languages: [], provider: 'index-translate', resourceId: translationModelId, name: 'Index Translate', kind: 'translationModel' as const }] : []),
      ],
    })
    const start = vi.spyOn(bridge.engine, 'startSession').mockResolvedValue({ sessionId: 'session-1', meetingId: null })
    attachSessionStore(bridge)

    await startSession({
      ...remoteConfig,
      recognitionProvider: 'local',
      translationProvider: 'local',
      translationModelId: 'hy-mt2-1.8b-q3-k-m',
      recognitionBinding: `resource:${recognitionModelId}`,
      translationBinding,
    })

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      recognitionModelId,
      translationProvider: localTranslation ? 'local' : 'index-translate',
      ...(localTranslation ? { translationModelId } : {}),
      translationBinding,
    }))
  },
)

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

it('keeps a failed stop retryable until the engine confirms the session ended', async () => {
  const bridge = createIpcBridge()
  attachSessionStore(bridge)
  vi.spyOn(bridge.engine, 'stopSession')
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockRejectedValueOnce(Object.assign(new Error('sessionNotRunning'), { code: 'sessionNotRunning' }))
  sessionStore.setState({ status: 'running', sessionId: 'session-1', meetingId: 'meeting-1', startedAtMs: Date.now(), elapsedMs: 1000 })

  await expect(stopSession()).rejects.toThrow('temporary failure')
  expect(sessionStore.getState()).toMatchObject({ status: 'error', sessionId: 'session-1', meetingId: 'meeting-1' })

  resetSessionError()
  expect(sessionStore.getState()).toMatchObject({ status: 'running', sessionId: 'session-1', meetingId: 'meeting-1' })
  await expect(stopSession()).rejects.toThrow('sessionNotRunning')
  expect(sessionStore.getState()).toMatchObject({ status: 'error', sessionId: null, meetingId: null })
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

it('clears the interim revision of a segment when a stale final for it arrives', async () => {
  const bridge = createIpcBridge()
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { receive = callback; return () => undefined })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  sessionStore.setState({ status: 'idle', sessionId: null, segments: [], interim: null })
  attachSessionStore(bridge)
  receive({ protocolVersion: 1, type: 'sessionStarted', requestId: 'start', sessionId: 'shared' })

  const final = { segmentId: 'line', revision: 2, startedAtMs: 0, sourceLanguage: 'en', sourceText: 'Hello', isFinal: true, translations: [] }
  receive({ protocolVersion: 1, type: 'caption', requestId: 'caption', sessionId: 'shared', segment: final })
  receive({ protocolVersion: 1, type: 'caption', requestId: 'caption', sessionId: 'shared', segment: { ...final, revision: 3, isFinal: false } })
  // Interim revisions are batched before they reach the store.
  await new Promise(resolve => setTimeout(resolve, 120))
  expect(sessionStore.getState().interim?.segmentId).toBe('line')

  receive({ protocolVersion: 1, type: 'caption', requestId: 'caption', sessionId: 'shared', segment: { ...final, revision: 1 } })
  expect(sessionStore.getState().interim).toBeNull()
  expect(sessionStore.getState().segments).toHaveLength(1)
})
