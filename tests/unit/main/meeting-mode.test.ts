import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureActivity } from '../../../src/main/feature-activity'
import { MeetingMode } from '../../../src/main/meeting-mode'
import type { MappedBackendSession } from '../../../src/main/backend-session'
import { DEFAULT_MEETING_MODE } from '../../../src/shared/meeting-mode'

const lane: MappedBackendSession = {
  config: {
    pipeline: { kind: 'cascade', asr_model: 'asr', translation_model: 'mt', tts_model: 'tts' },
    input: { kind: 'microphone', device_id: 'mic', capture_backend: 'device' },
    source_language: 'zh', target_languages: ['en'], required_outputs: ['audio'],
  },
  headers: {},
}

function controller() {
  const activity = new FeatureActivity()
  const backend = Object.assign(new EventEmitter(), {
    ready: true, baseUrl: 'http://127.0.0.1:8000',
    authorizationHeader: () => ({ authorization: 'Bearer fixture' }),
  })
  const prepare = vi.fn(async () => ({ backend, uplink: lane, downlink: lane }))
  const changed = vi.fn()
  const meeting = new MeetingMode(activity, prepare, changed, async () => backend)
  return { meeting, activity, backend, prepare, changed }
}

function snapshot(id: string, state: 'running' | 'closed') {
  return Response.json({ meeting_id: id, state, passthrough_active: false, last_error: null })
}

function backendError(code: string, messageKey: string, details = {}) {
  return { error: { code, message_key: messageKey, stage: 'session', scope: 'session', retryable: false, fatal: true, ...details } }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('meeting audio ownership', () => {
  it('uses the start command id to stop the same group and releases its feature and model resources', async () => {
    const { meeting, activity } = controller()
    let id = ''
    const request = vi.fn(async (url: URL, init: RequestInit) => {
      if (init.method === 'POST') {
        expect(url.pathname).toBe('/api/v2/meetings')
        const payload = JSON.parse(String(init.body))
        expect(payload.duck_volume).toBe(0.2)
        id = payload.command_id
        return snapshot(id, 'running')
      }
      expect(url.pathname).toBe(`/api/v2/meetings/${id}`)
      return snapshot(id, 'closed')
    })
    vi.stubGlobal('fetch', request)
    expect(await meeting.start(DEFAULT_MEETING_MODE)).toMatchObject({ state: 'running' })
    expect(meeting.usesResource('tts')).toBe(true)
    expect(activity.snapshot()).toMatchObject({ owner: 'meeting', phase: 'running' })
    expect(await meeting.stop()).toMatchObject({ state: 'idle' })
    expect(request).toHaveBeenCalledTimes(2)
    expect(activity.snapshot().owner).toBeNull()
    expect(meeting.usesResource('tts')).toBe(false)
  })

  it('reports glossary preparation failure before opening audio and releases the meeting lease', async () => {
    const { meeting, prepare, changed, activity } = controller()
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    prepare.mockRejectedValueOnce(new Error('realtimeGlossarySyncFailed'))
    const failed = await meeting.start(DEFAULT_MEETING_MODE)
    expect(failed).toMatchObject({ state: 'failed', error: { key: 'suite.syncGlossaryFailed', code: 'realtimeGlossarySyncFailed' } })
    expect(changed).toHaveBeenLastCalledWith(failed)
    expect(request).not.toHaveBeenCalled()
    expect(activity.snapshot().owner).toBeNull()
  })

  it.each(['glossaryUnsupported', 'glossaryBudgetExceeded'])('publishes nonfatal %s and clears it after recovery without stopping the group', async reason => {
    vi.useFakeTimers()
    const { meeting, changed, activity } = controller()
    const warning = backendError('CAPABILITY_MISMATCH', reason, { fatal: false, scope: 'task', stage: 'mt', safe_details: { direction: 'uplink' } }).error
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(snapshot('fixture', 'running'))
      .mockResolvedValueOnce(Response.json({ meeting_id: 'fixture', state: 'running', passthrough_active: false, last_error: warning }))
      .mockResolvedValueOnce(snapshot('fixture', 'running'))
      .mockResolvedValueOnce(snapshot('fixture', 'closed')))
    await meeting.start(DEFAULT_MEETING_MODE)
    await vi.advanceTimersByTimeAsync(500)
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      state: 'running', error: expect.objectContaining({ key: reason, code: reason, direction: 'uplink' }),
    }))
    expect(activity.snapshot()).toMatchObject({ owner: 'meeting', phase: 'running' })
    await vi.advanceTimersByTimeAsync(500)
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'running', error: undefined }))
    await meeting.stop()
  })

  it('preserves the failed direction and closes a group when startup fails', async () => {
    const { meeting, activity } = controller()
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(backendError('PLAYBACK_DEVICE_LOST', 'meeting.audioOutputUnavailable', {
        correlation_id: 'device-failure',
        safe_details: { direction: 'downlink' },
      }), { status: 503 }))
      .mockResolvedValueOnce(Response.json(backendError('SESSION_NOT_FOUND', 'meeting.notFound'), { status: 404 }))
    vi.stubGlobal('fetch', request)
    await expect(meeting.start(DEFAULT_MEETING_MODE)).resolves.toMatchObject({
      state: 'failed',
      error: { key: 'meeting.audioOutputUnavailable', direction: 'downlink', correlationId: 'device-failure' },
    })
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'DELETE' })
    expect(activity.snapshot().owner).toBeNull()
  })

  it('keeps the stop action available if the backend cannot confirm cleanup', async () => {
    const { meeting, activity, backend } = controller()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(snapshot('fixture', 'running'))
      .mockResolvedValueOnce(Response.json(backendError('INTERNAL_ERROR', 'meeting.stopFailed'), { status: 503 })))
    await meeting.start(DEFAULT_MEETING_MODE)
    expect(await meeting.stop()).toMatchObject({ state: 'unknown', error: { key: 'meeting.stopFailed' } })
    expect(activity.snapshot().owner).toBe('meeting')
    backend.emit('exit')
    expect(activity.snapshot().owner).toBeNull()
  })
})

describe('meeting setup probes', () => {
  it('tests a chosen native device without preparing models and preserves the playback destination', async () => {
    const { meeting, activity, prepare } = controller()
    const fetch = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.pathname).toBe('/api/v2/meetings/audio-test')
      expect(init.headers).toMatchObject({ authorization: 'Bearer fixture' })
      expect(JSON.parse(String(init.body))).toEqual({ kind: 'microphone', device_id: 'mic', playback_device_id: 'phones' })
      expect(activity.has('meeting')).toBe(true)
      return Response.json({ kind: 'microphone', has_signal: true, peak: 0.4, playback_sent: true })
    })
    vi.stubGlobal('fetch', fetch)
    await expect(meeting.testAudio({ kind: 'microphone', deviceId: 'mic', playbackDeviceId: 'phones' })).resolves.toEqual({
      kind: 'microphone', hasSignal: true, peak: 0.4, playbackSent: true,
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(activity.has('meeting')).toBe(false)
    expect(meeting.snapshot().state).toBe('idle')
  })

  it('keeps tests and interpretation mutually exclusive and waits for a probe on stop', async () => {
    const { meeting, activity } = controller()
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve })))
    const pending = meeting.testAudio({ kind: 'headphones', deviceId: 'phones' })
    await Promise.resolve()
    await expect(meeting.testAudio({ kind: 'cable', deviceId: 'cable' })).resolves.toMatchObject({ error: { key: 'meeting.busy' } })
    await expect(meeting.start(DEFAULT_MEETING_MODE)).resolves.toMatchObject({ error: { key: 'meeting.busy' } })
    let stopped = false
    const stop = meeting.stop().then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false)
    complete(Response.json({ kind: 'headphones', has_signal: false, peak: 0, playback_sent: true }))
    await pending
    await stop
    expect(activity.has('meeting')).toBe(false)
  })

  it('returns structured audio failures and releases ownership', async () => {
    const { meeting, activity } = controller()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(backendError('PLAYBACK_DEVICE_LOST', 'meeting.audioOutputUnavailable'), { status: 503 })))
    await expect(meeting.testAudio({ kind: 'headphones', deviceId: 'phones' })).resolves.toMatchObject({
      hasSignal: false, playbackSent: false, error: { key: 'meeting.audioOutputUnavailable', code: 'audioPlaybackUnavailable' },
    })
    expect(activity.has('meeting')).toBe(false)
  })

  it('rejects invalid request IDs before opening the backend', () => {
    const { meeting } = controller()
    expect(() => meeting.testAudio({ kind: 'cable', deviceId: '' })).toThrow()
  })

  it('publishes current route evidence received from the backend', async () => {
    vi.useFakeTimers()
    const { meeting, changed } = controller()
    const route = { input_peak: 0.2, input_age_ms: 12, source_text: 'Hello', translated_text: '你好', playback: 'finished' }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(snapshot('fixture', 'running'))
      .mockResolvedValueOnce(Response.json({ meeting_id: 'fixture', state: 'running', passthrough_active: false, telemetry: { uplink: route, downlink: route } }))
      .mockResolvedValueOnce(snapshot('fixture', 'closed')))
    await meeting.start(DEFAULT_MEETING_MODE)
    await vi.advanceTimersByTimeAsync(500)
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ telemetry: {
      uplink: { inputPeak: 0.2, inputAgeMs: 12, sourceText: 'Hello', translatedText: '你好', playback: 'finished' },
      downlink: { inputPeak: 0.2, inputAgeMs: 12, sourceText: 'Hello', translatedText: '你好', playback: 'finished' },
    } }))
    await meeting.stop()
  })

  it('clears stale audio evidence when polling fails and recovers on the next snapshot', async () => {
    vi.useFakeTimers()
    const { meeting } = controller()
    const route = { input_peak: 0.2, input_age_ms: 12, playback: 'finished' }
    const healthy = () => Response.json({ meeting_id: 'fixture', state: 'running', passthrough_active: false, telemetry: { uplink: route, downlink: route } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(healthy())
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(healthy())
      .mockResolvedValueOnce(snapshot('fixture', 'closed')))
    await meeting.start(DEFAULT_MEETING_MODE)
    await vi.advanceTimersByTimeAsync(500)
    expect(meeting.snapshot()).toMatchObject({ state: 'unknown', passthroughActive: false, error: { key: 'meeting.backendUnavailable' } })
    expect(meeting.snapshot().telemetry).toBeUndefined()
    await vi.advanceTimersByTimeAsync(500)
    expect(meeting.snapshot()).toMatchObject({ state: 'running', telemetry: { uplink: { playback: 'finished' } } })
    expect(meeting.snapshot().error).toBeUndefined()
    await meeting.stop()
    vi.restoreAllMocks()
  })
})


describe('meeting transcript and controls', () => {
  it('keeps final transcript revisions available after stopping the group', async () => {
    const { meeting } = controller()
    const segment = { segmentId: 'session:0:one', direction: 'uplink', revision: 3, startedAtMs: 1, sourceText: 'Final', isFinal: true, translations: [] }
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => Response.json({
      meeting_id: 'group', state: init.method === 'DELETE' ? 'closed' : 'running', passthrough_active: false, segments: [segment],
    })))
    await meeting.start(DEFAULT_MEETING_MODE)
    expect((await meeting.stop()).segments).toEqual([segment])
  })

  it('cancels audio testing and releases its feature lease', async () => {
    const { meeting, activity } = controller()
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const testing = meeting.testAudio({ kind: 'headphones', deviceId: 'ears' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await meeting.cancelAudioTest()
    await expect(testing).resolves.toMatchObject({ error: { key: 'meeting.audioTestFailed' } })
    expect(activity.snapshot().owner).toBeNull()
  })

  it('sends pause and resume to the owned group without creating another session', async () => {
    const { meeting } = controller()
    const request = vi.fn(async (_url: URL, init: RequestInit) => Response.json({
      meeting_id: 'group', state: init.method === 'DELETE' ? 'closed' : 'running', passthrough_active: false,
      paused: init.method === 'PATCH' ? JSON.parse(String(init.body)).paused : false,
    }))
    vi.stubGlobal('fetch', request)
    await meeting.start(DEFAULT_MEETING_MODE)
    expect(await meeting.setPaused(true)).toMatchObject({ state: 'running', paused: true })
    expect(await meeting.setPaused(false)).toMatchObject({ state: 'running', paused: false })
    expect(request.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
    await meeting.stop()
  })
})


it('does not open devices after an audio test is cancelled during backend preparation', async () => {
  const { activity, backend } = controller()
  let ready!: (value: typeof backend) => void
  const preparation = new Promise<typeof backend>(resolve => { ready = resolve })
  const meeting = new MeetingMode(activity, async () => ({ backend, uplink: lane }), () => {}, () => preparation)
  const request = vi.fn()
  vi.stubGlobal('fetch', request)
  const testing = meeting.testAudio({ kind: 'microphone', deviceId: 'mic' })
  const cancelled = meeting.cancelAudioTest()
  ready(backend)
  await cancelled
  await expect(testing).resolves.toMatchObject({ error: { key: 'meeting.audioTestFailed' } })
  expect(request).not.toHaveBeenCalled()
  expect(activity.snapshot().owner).toBeNull()
})
