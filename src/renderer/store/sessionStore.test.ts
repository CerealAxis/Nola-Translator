import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { SessionConfig } from '@/bridge'
import { attachSessionStore, detachSessionStore, pauseSession, resumeSession, resetSessionError, sessionStore, startSession, stopSession } from './sessionStore'
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
  vi.unstubAllGlobals()
})

it('forwards the pause IPC rejection instead of dropping it at the bridge', async () => {
  const failure = new Error('pause transport unavailable')
  vi.stubGlobal('nolaTranslator', { setSessionPaused: vi.fn().mockRejectedValue(failure) })
  await expect(createIpcBridge().engine.setPaused('session-1', true)).rejects.toBe(failure)
})

it.each([false, true])('keeps the confirmed paused=%s state when changing it is rejected', async paused => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  vi.spyOn(bridge.engine, 'setPaused').mockRejectedValue(new Error('pause refused'))
  attachSessionStore(bridge)
  sessionStore.setState({ status: paused ? 'paused' : 'running', sessionId: 'session-1', startedAtMs: Date.now() })
  await expect(paused ? resumeSession() : pauseSession()).rejects.toThrow('pause refused')
  expect(sessionStore.getState()).toMatchObject({ status: paused ? 'paused' : 'running', pausePending: false })
})

it('waits for pause acknowledgement, prevents duplicates, and ignores a reply after stop', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => {}
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(listener => { receive = listener; return () => {} })
  let finish!: () => void
  const pause = vi.spyOn(bridge.engine, 'setPaused').mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  attachSessionStore(bridge)
  sessionStore.setState({ status: 'running', sessionId: 'session-1', startedAtMs: Date.now() })
  const result = pauseSession()
  await pauseSession()
  expect(pause).toHaveBeenCalledExactlyOnceWith('session-1', true)
  expect(sessionStore.getState()).toMatchObject({ status: 'running', pausePending: true })
  receive({ protocolVersion: 1, requestId: 'stopped', type: 'sessionStopped', sessionId: 'session-1' })
  finish(); await result
  expect(sessionStore.getState()).toMatchObject({ status: 'idle', sessionId: null, pausePending: false })
})

it('commits pause and resume only after the engine confirms each request', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  vi.spyOn(bridge.engine, 'setPaused').mockResolvedValue()
  attachSessionStore(bridge)
  sessionStore.setState({ status: 'running', sessionId: 'session-1', startedAtMs: Date.now() })
  await pauseSession()
  expect(sessionStore.getState()).toMatchObject({ status: 'paused', pausePending: false })
  await resumeSession()
  expect(sessionStore.getState()).toMatchObject({ status: 'running', pausePending: false })
})

it('stops a paused session directly, blocks duplicate stops, and preserves a newer session', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  const resume = vi.spyOn(bridge.engine, 'setPaused')
  let finish!: () => void
  const stop = vi.spyOn(bridge.engine, 'stopSession').mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => {}
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(listener => { receive = listener; return () => {} })
  attachSessionStore(bridge)
  sessionStore.setState({ status: 'paused', sessionId: 'session-1', startedAtMs: Date.now() })
  const result = stopSession()
  receive({ protocolVersion: 1, requestId: 'late-pause', type: 'status', code: 'paused' })
  receive({ protocolVersion: 1, requestId: 'late-listen', type: 'status', code: 'listening' })
  expect(sessionStore.getState().status).toBe('stopping')
  expect(resume).not.toHaveBeenCalled()
  await expect(stopSession()).rejects.toThrow('正在结束中')
  expect(stop).toHaveBeenCalledExactlyOnceWith('session-1')
  receive({ protocolVersion: 1, requestId: 'stopped', type: 'sessionStopped', sessionId: 'session-1' })
  sessionStore.setState({ status: 'running', sessionId: 'new-session', meetingId: 'new-record' })
  finish(); await result
  expect(sessionStore.getState()).toMatchObject({ status: 'running', sessionId: 'new-session', meetingId: 'new-record' })
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


it('hydrates a late reader and replays newer caption revisions without duplicate rows', async () => {
  const bridge = createIpcBridge()
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { receive = callback; return () => undefined })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  let finish!: (value: import('../../shared/session-reader').SessionReaderSnapshot | null) => void
  bridge.engine.getSessionSnapshot = () => new Promise(resolve => { finish = resolve })
  attachSessionStore(bridge)
  const segment = { segmentId: 'line', revision: 1, startedAtMs: 0, sourceText: 'Old', isFinal: true, translations: [] }
  receive({ protocolVersion: 1, requestId: 'newer', type: 'caption', sessionId: 'shared', segment: { ...segment, revision: 2, sourceText: 'Latest' } })
  finish({ sessionId: 'shared', meetingId: 'record', startedAtMs: Date.now() - 1000, status: 'running', elapsedMs: 1000, segments: [segment] })
  await vi.waitFor(() => expect(sessionStore.getState().segments).toEqual([{ ...segment, revision: 2, sourceText: 'Latest' }]))
  receive({ protocolVersion: 1, requestId: 'stale', type: 'caption', sessionId: 'foreign', segment })
  expect(sessionStore.getState().segments).toHaveLength(1)
})


it('does not replay the previous session pause across a new-session snapshot fence', async () => {
  const bridge = createIpcBridge()
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { receive = callback; return () => undefined })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  let finish!: (value: import('../../shared/session-reader').SessionReaderSnapshot | null) => void
  bridge.engine.getSessionSnapshot = () => new Promise(resolve => { finish = resolve })
  attachSessionStore(bridge)
  receive({ protocolVersion: 1, requestId: 'pause-old', type: 'status', code: 'paused' })
  receive({ protocolVersion: 1, requestId: 'stop-old', type: 'sessionStopped', sessionId: 'old' })
  receive({ protocolVersion: 1, requestId: 'new', type: 'sessionStarted', sessionId: 'new' })
  finish({ sessionId: 'new', meetingId: null, startedAtMs: Date.now(), status: 'running', elapsedMs: 0, segments: [] })
  await vi.waitFor(() => expect(sessionStore.getState()).toMatchObject({ sessionId: 'new', status: 'running' }))
})


it.each(['paused', 'stopped'] as const)('applies a %s edge received while the reader snapshot is in flight', async outcome => {
  const bridge = createIpcBridge()
  let receive: Parameters<typeof bridge.events.onEngineEvent>[0] = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { receive = callback; return () => undefined })
  vi.spyOn(bridge.engine, 'getEngineState').mockResolvedValue('ready')
  let finish!: (value: import('../../shared/session-reader').SessionReaderSnapshot | null) => void
  bridge.engine.getSessionSnapshot = () => new Promise(resolve => { finish = resolve })
  attachSessionStore(bridge)
  if (outcome === 'paused') receive({ protocolVersion: 1, requestId: 'pause', type: 'status', code: 'paused' })
  else receive({ protocolVersion: 1, requestId: 'stop', type: 'sessionStopped', sessionId: 'held' })
  finish({ sessionId: 'held', meetingId: null, startedAtMs: Date.now(), status: 'running', elapsedMs: 0, segments: [] })
  await vi.waitFor(() => expect(sessionStore.getState()).toMatchObject(outcome === 'paused' ? { sessionId: 'held', status: 'paused' } : { sessionId: null, status: 'idle' }))
})
