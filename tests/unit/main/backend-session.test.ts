import { once } from 'node:events'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'

import { BackendSession, mapBrowserSessionConfig, mapSessionConfig } from '../../../src/main/backend-session'
import type { SessionConfig } from '../../../src/shared/contracts'
import { DEFAULT_SETTINGS, MIMO_TTS_BINDING, MIMO_TTS_MODEL, REALTIME_S2S_MODELS } from '../../../src/shared/settings'
import { INDEX_TRANSLATE_ENDPOINT } from '../../../src/shared/index-translate'

const asr = 'sensevoice-small-crisp-q8-0'
const models = new Set([asr, 'google', 'tts'])
const config: SessionConfig = {
  audioSource: { kind: 'microphone', deviceId: '' }, recognitionMode: 'realtime',
  recognitionModelId: asr, sourceLanguage: 'en', targetLanguages: ['zh'],
  translationProvider: 'google', translationOptions: { apiKey: 'private-provider-key' },
}

describe('desktop backend session', () => {
  it('routes Index Translate with MiMo synthesis and sends its key only in the private header', () => {
    const session = { ...config, translationProvider: 'index-translate' as const, translationOptions: { endpoint: INDEX_TRANSLATE_ENDPOINT } }
    const settings = { ...DEFAULT_SETTINGS, synthesis: { modelId: MIMO_TTS_BINDING, voice: '' } }
    const ids = new Set([asr, 'index-translate', MIMO_TTS_MODEL])
    expect(mapSessionConfig(session, settings, ids, { output: 'speech' })).toBeUndefined()
    const mapped = mapSessionConfig(session, settings, ids, { output: 'speech', ttsApiKey: 'test-mimo-key' })
    expect(mapped?.config.pipeline).toEqual({ kind: 'cascade', asr_model: asr, translation_model: 'index-translate', tts_model: MIMO_TTS_MODEL })
    expect(mapped?.headers).toEqual({ 'x-nola-tts-key': 'test-mimo-key' })
    expect(JSON.stringify(mapped?.config)).not.toContain('test-mimo-key')
  })
  it('preserves supported model IDs, private headers, and explicit capture routes', () => {
    const settings = { ...DEFAULT_SETTINGS, synthesis: { modelId: 'tts', voice: 'speaker' } }
    const mapped = mapSessionConfig(config, settings, models, { output: 'speech' })
    expect(mapped?.config).toMatchObject({
      pipeline: { kind: 'cascade', asr_model: asr, translation_model: 'google', tts_model: 'tts', tts_voice: 'speaker' },
      input: { kind: 'microphone', capture_backend: 'device', device_id: '' },
      required_outputs: ['source_text', 'translated_text', 'audio'],
      speech_target_language: 'zh',
    })
    expect(JSON.stringify(mapped?.config)).not.toContain('private-provider-key')
    expect(mapped?.headers).toEqual({ 'x-nola-provider-key': 'private-provider-key' })
    expect(mapSessionConfig({ ...config, recognitionModelId: 'unregistered' }, settings, models)).toBeUndefined()
    expect(mapSessionConfig({ ...config, audioSource: { kind: 'systemOutput', deviceId: 'selected' } },
      settings, models, { output: 'speech' })).toBeUndefined()
    const system = { ...config, audioSource: { kind: 'defaultOutput' as const } }
    expect(mapSessionConfig(system, settings, models, { output: 'speech' })?.config.input).toEqual({
      kind: 'system_audio', capture_backend: 'windows_process_exclude',
    })
    expect(mapSessionConfig(system, settings, models)?.config.input).toEqual({ kind: 'system_audio', capture_backend: 'device' })
    const selection = 'a'.repeat(32)
    const application = { ...config, audioSource: { kind: 'processAudio' as const, deviceId: `process:${selection}` } }
    expect(mapSessionConfig(application, settings, models, { output: 'speech' })?.config.input).toEqual({
      kind: 'process_audio', capture_backend: 'windows_process_include', process_selection_id: selection,
    })
  })

  it('maps the explicit S2S model independently of ASR and keeps both audio device selections', () => {
    const [selectedModel, asrModel] = REALTIME_S2S_MODELS
    const mapped = mapSessionConfig({
      ...config, audioSource: { kind: 'virtualInput', deviceId: 'recording-endpoint' },
      recognitionProvider: 'local',
      recognitionOptions: { model: asrModel, apiKey: 'private-key', workspaceId: 'workspace' },
    }, DEFAULT_SETTINGS, new Set([selectedModel]), {
      output: 'speech', s2sModel: selectedModel, outputDeviceId: 'chromium-sink',
    })
    expect(mapped).toMatchObject({
      config: {
        pipeline: { kind: 's2s', s2s_model: selectedModel },
        input: { kind: 'virtual_input', capture_backend: 'virtual_input', device_id: 'recording-endpoint' },
        required_outputs: ['source_text', 'translated_text', 'audio'],
      },
      outputDeviceId: 'chromium-sink',
    })
  })

  it.each(['desktop', 'system-speech', 'system-speech-blocked', 'cascade-speech', 's2s', 'virtual-s2s', 'browser-tab', 'browser-system'])('drives the %s lifecycle over private sockets', async mode => {
    const virtual = mode === 'virtual-s2s'
    const systemSpeech = mode === 'system-speech' || mode === 'system-speech-blocked'
    const s2sAudio = mode === 's2s' || virtual
    const browserTab = mode === 'browser-tab'
    const browser = browserTab || mode === 'browser-system'
    const instanceId = '7d31857f-3438-4555-b995-b444f6104b20'
    const sessionId = '8d31857f-3438-4555-b995-b444f6104b20'
    const identity = { schema_version: 2, server_instance_id: instanceId, session_id: sessionId }
    const requests: { url?: string; headers: unknown; body: Record<string, unknown> }[] = []
    let socket: WebSocket | undefined
    const audioSockets: WebSocket[] = []
    const audioOwners: string[] = []
    const inputFrames: { epoch: number; seq: bigint }[] = []
    const inputCloses: boolean[] = []
    const eventHellos: { consumer_id: string; resume_cursor: number }[] = []
    let generation = 0
    let sequence = 0
    const event = (event_type: string, payload: object, epoch = 0) => socket?.send(JSON.stringify({
      ...identity, event_type, payload, epoch, event_seq: ++sequence,
    }))
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
      requests.push({ url: request.url, headers: request.headers, body })
      let result: object = { session_id: sessionId }
      if (request.url?.endsWith('/gateway/capabilities')) {
        result = { models: [...models].map(model_id => ({ model_id, enabled: true })) }
      } else if (request.url?.endsWith('/audio/preflight')) {
        result = { safe: mode === 'system-speech', feedback_status: 'unknown', issues: [] }
      } else if (request.url?.endsWith('/input/end')) {
        event('pipeline_state', { state: 'closed' }, 2)
      } else if (request.url?.endsWith('/commands')) {
        const states: Record<string, string> = { start: 'running', pause: 'paused', resume: 'running', stop: 'closed', reset_stream: 'running' }
        if (body.type === 'start') {
          event('source_text', { segment_id: 'segment', source_revision: 1, text: 'hel' })
          event('source_committed', {
            segment_id: 'segment', source_revision: 2, text: 'hello', audio_span: { start_sample: 0, end_sample: 1600 },
          })
          event('translated_text', { segment_id: 'segment', target_revision: 1, target_language: 'zh', text: '你', state: 'provisional' })
          event('translation_committed', { segment_id: 'segment', target_revision: 2, target_language: 'zh', text: '你好' })
        }
        if (body.type === 'pause') generation += 1
        result = { ...result, accepted: true, command_id: body.command_id, result_state: states[body.type] }
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(result))
    })
    const ws = new WebSocketServer({ server })
    ws.on('connection', (connection, request) => {
      expect(request.headers.authorization).toBe('Bearer control')
      if (request.url?.endsWith('/input')) {
        let handle = 0
        let epoch = 0
        connection.on('message', (data, binary) => {
          if (binary && Buffer.isBuffer(data)) {
            const seq = data.readBigUInt64LE(16)
            inputFrames.push({ epoch: data.readUInt32LE(12), seq })
            connection.send(JSON.stringify({
              frame: 'audio_accepted', stream_handle: handle, epoch, through_chunk_seq: Number(seq),
              through_sample: Number(data.readBigUInt64LE(24)) + data.readUInt32LE(32),
            }))
          } else {
            const frame = JSON.parse(data.toString())
            if (frame.frame === 'stream_open') {
              handle = frame.stream_handle
              epoch = frame.epoch
              connection.send(JSON.stringify({ frame: 'stream_opened', stream_handle: handle, epoch, server_instance_id: instanceId }))
            } else if (frame.frame === 'stream_close') {
              inputCloses.push(frame.eof)
              if (frame.eof) event('pipeline_state', { state: 'closed' }, epoch)
            }
          }
        })
        return
      }
      const audio = request.url?.endsWith('/audio')
      if (audio) audioSockets.push(connection)
      else socket = connection
      connection.once('message', data => {
        const hello = JSON.parse(data.toString())
        const consumerId = hello.consumer_id
        if (!audio) eventHellos.push(hello)
        else audioOwners.push(consumerId)
        connection.send(JSON.stringify({
          ...identity, frame: 'hello_ack', consumer_id: consumerId,
          ...(audio ? { playback_owner_id: consumerId, snapshot: { playback_generation: generation } } : {}),
        }))
      })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server port')
    const onEvent = vi.fn()
    const onFence = vi.fn()
    const preparePlayback = vi.fn(async () => {
      expect(requests.some(request => request.url?.endsWith('/sessions'))).toBe(false)
    })
    const client = new BackendSession({
      baseUrl: 'http://127.0.0.1:' + address.port, instanceId,
      authorizationHeader: () => ({ Authorization: 'Bearer control' }),
    }, { onEvent, onFence, onChunk: vi.fn(), preparePlayback })
    try {
      const available = await client.models()
      const mapped = browser ? mapBrowserSessionConfig({
        ...config, audioSource: browserTab ? { kind: 'browserTab', streamId: 'tab' } : { kind: 'systemOutput', deviceId: 'loopback' },
        browserTimeline: { epoch: 4, videoTimeMs: 12000, playbackRate: 1.5 },
      }, DEFAULT_SETTINGS, available) : systemSpeech
        ? mapSessionConfig({ ...config, audioSource: { kind: 'defaultOutput' } },
          { ...DEFAULT_SETTINGS, synthesis: { modelId: 'tts', voice: '' } }, available, { output: 'speech' })
        : mapSessionConfig(virtual
          ? { ...config, audioSource: { kind: 'virtualInput', deviceId: 'recording-endpoint' } } : config,
        DEFAULT_SETTINGS, available, { outputDeviceId: virtual ? 'chromium-sink' : undefined })
      if (!mapped) throw new Error('Expected compatible config')
      if (s2sAudio) {
        mapped.config.pipeline = { kind: 's2s', s2s_model: 's2s' }
        mapped.config.required_outputs.push('audio')
      }
      if (mode === 'cascade-speech') {
        if (mapped.config.pipeline.kind !== 'cascade') throw new Error('Expected cascade')
        mapped.config.pipeline.tts_model = 'tts'
        mapped.config.required_outputs.push('audio')
      }
      if (mode === 'system-speech-blocked') {
        await expect(client.start(mapped)).rejects.toMatchObject({ code: 'systemAudioSpeechUnavailable' })
        expect(preparePlayback).not.toHaveBeenCalled()
        expect(requests.some(request => request.url?.endsWith('/sessions'))).toBe(false)
        return
      }
      expect(await client.start(mapped, '/trusted/meeting.mp3')).toBe(sessionId)
      if (systemSpeech) {
        expect(requests.find(request => request.url?.endsWith('/audio/preflight'))?.body).toEqual({
          input_mode: 'process_exclude', excluded_process_tree: [process.pid], probe_target_pid: process.pid,
        })
        expect(requests.find(request => request.url?.endsWith('/sessions'))?.body.config).toMatchObject({
          input: { kind: 'system_audio', capture_backend: 'windows_process_exclude', excluded_process_tree: [process.pid] },
        })
      }
      expect(preparePlayback).toHaveBeenCalledTimes(mapped.config.required_outputs.includes('audio') ? 1 : 0)
      if (virtual) expect(requests.find(request => request.url?.endsWith('/audio/preflight'))?.body).toEqual({
        input_mode: 'virtual_input', input_endpoint_id: 'recording-endpoint',
        speech_output_endpoint_id: 'chromium-sink', speech_output_endpoint_is_opaque: true,
      })
      expect(onEvent).not.toHaveBeenCalled()
      client.activate()
      await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(4))
      expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'caption', segment: expect.objectContaining({
          segmentId: 'segment', sourceText: 'hello', revision: 4, isFinal: true,
          translations: [expect.objectContaining({ text: '你好', state: 'complete' })],
        }),
      }))
      if (browser) {
        expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
          streamEpoch: 4, videoStartedAtMs: 12000, videoEndedAtMs: 12150,
        }))
        const frame = { streamId: 'tab', epoch: 4, sequence: 0, sampleRate: 48000, pcmBase64: 'AAA=' }
        if (browserTab) await Promise.all([client.pushBrowserAudio(frame), client.pushBrowserAudio({ ...frame, sequence: 1 })])
        await client.resetBrowser({ epoch: 5, videoTimeMs: 22000, playbackRate: 2 })
        await expect(client.pushBrowserAudio(frame)).rejects.toThrow('sessionStaleEpoch')
        await client.pause(true)
        await client.pause(false)
        if (browserTab) await client.pushBrowserAudio({ ...frame, epoch: 5 })
        else await expect(client.pushBrowserAudio({ ...frame, epoch: 5 })).rejects.toThrow('sessionStaleEpoch')
        event('source_committed', {
          segment_id: 'stale', source_revision: 1, text: 'stale',
        }, 1)
        event('source_committed', {
          segment_id: 'current', source_revision: 1, text: 'current', audio_span: { start_sample: 800, end_sample: 1600 },
        }, 2)
        await vi.waitFor(() => expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
          streamEpoch: 5, videoStartedAtMs: 22100, videoEndedAtMs: 22200,
        })))
        expect(onEvent.mock.calls.some(([value]) => value.segment?.segmentId === 'stale')).toBe(false)
        await client.finishBrowser(5)
        expect(inputFrames).toEqual(browserTab ? [{ epoch: 0, seq: 0n }, { epoch: 0, seq: 1n }, { epoch: 2, seq: 0n }] : [])
        expect(inputCloses).toEqual(browserTab ? [false, true] : [])
        expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sessionStopped' }))
        expect(requests[1].body).toMatchObject({ owner: 'browser_captions', config: {
          input: browserTab ? { kind: 'browser_tab', browser_stream_id: 'tab' }
            : { kind: 'system_audio', capture_backend: 'device', device_id: 'loopback' },
        } })
        expect(requests.map(request => request.body.type).filter(Boolean)).toEqual(['start', 'reset_stream', 'pause', 'resume'])
        expect(requests.some(request => request.url?.endsWith('/input/end'))).toBe(!browserTab)
        return
      }
      await client.pause(true)
      await client.pause(false)
      if (s2sAudio) {
        expect(audioSockets).toHaveLength(2)
        expect(audioSockets[0].readyState).toBe(3)
        expect(onFence).toHaveBeenLastCalledWith(1)
        generation += 1
        event('pipeline_state', { state: 'recovering' })
        event('pipeline_state', { state: 'running' }, 1)
        await vi.waitFor(() => expect(audioSockets).toHaveLength(3))
        expect(audioSockets[1].readyState).toBe(3)
        await vi.waitFor(() => expect(onFence).toHaveBeenLastCalledWith(2))
      }
      event('source_committed', {
        segment_id: 'next', source_revision: 1, text: 'next', audio_span: { start_sample: 0, end_sample: 1600 },
      }, 1)
      await vi.waitFor(() => expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'caption', segment: expect.objectContaining({ segmentId: 'next', startedAtMs: 100, endedAtMs: 200 }),
      })))
      if (s2sAudio) {
        event('synthesis_state', { job_id: 'speech', state: 'queued' }, 1)
        event('synthesis_state', { job_id: 'speech', state: 'running' }, 1)
        event('playback_state', { audio_stream_id: 'speech', state: 'claimed' }, 1)
        event('playback_state', { audio_stream_id: 'speech', state: 'playing' }, 1)
        event('playback_state', { audio_stream_id: 'speech', state: 'finished' }, 1)
        await vi.waitFor(() => expect(onEvent.mock.calls
          .map(([value]) => value).filter(value => value.type === 'realtimePlayback').map(value => [value.phase, value.waitingCount]))
          .toEqual([['waiting', 1], ['synthesizing', 0], ['waiting', 1], ['playing', 0], ['idle', 0]]))
      }
      if (mode === 'desktop') {
        const cursor = sequence
        socket?.terminate()
        await vi.waitFor(() => expect(eventHellos).toHaveLength(2))
        expect(eventHellos[1]).toMatchObject({ resume_cursor: cursor, consumer_id: eventHellos[0].consumer_id })
        event('speaker_changed', { segment_id: 'speaker-row', speaker_id: 'speaker-a', speaker_metadata_revision: 1 }, 1)
        event('source_committed', { segment_id: 'speaker-row', source_revision: 1, text: 'after replay' }, 1)
        event('error', { error: {
          code: 'PROVIDER_DISCONNECTED', stage: 'asr', scope: 'session', retryable: false, fatal: true,
          message_key: 'pipeline.disconnected', correlation_id: 'failure-id',
        } }, 1)
        event('pipeline_state', { state: 'failed' }, 1)
        await vi.waitFor(() => expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sessionStopped', sessionId })))
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'caption', segment: expect.objectContaining({
          segmentId: 'speaker-row', speakerId: 'speaker-a', speakerMetadataRevision: 1,
        }) }))
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', code: 'recognitionClosed', recoverable: false,
          details: expect.objectContaining({ backendCode: 'PROVIDER_DISCONNECTED', correlationId: 'failure-id' }) }))
        await client.stop()
        expect(requests.map(request => request.body.type).filter(Boolean)).toEqual(['start', 'pause', 'resume'])
        return
      }
      if (mode === 'cascade-speech') {
        audioSockets[0].terminate()
        await vi.waitFor(() => expect(audioOwners).toHaveLength(2))
        event('playback_state', { audio_stream_id: 'blocked-speech', state: 'unknown' }, 1)
        await vi.waitFor(() => expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
          type: 'realtimePlayback', phase: 'failed', playbackJob: { jobId: 'blocked-speech', state: 'unknown' },
        })))
        await client.resolvePlayback('blocked-speech', 'skip')
        expect(requests.at(-1)).toMatchObject({
          url: `/api/v2/sessions/${sessionId}/playback/blocked-speech/skip`, body: { owner_id: audioOwners[1] },
        })
      }
      await client.stop()
      expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sessionStopped', sessionId }))
      expect(requests.map(request => request.body.type).filter(Boolean)).toEqual(['start', 'pause', 'resume', 'stop'])
      expect(requests.find(request => request.url?.endsWith('/sessions'))?.body).toMatchObject({
        owner: 'quick_interpret', config: { recording_path: '/trusted/meeting.mp3' },
      })
      expect(requests.find(request => request.body.type === 'start')?.headers).toMatchObject({
        authorization: 'Bearer control', 'x-nola-provider-key': 'private-provider-key',
      })
    } finally {
      client.close()
      await new Promise<void>(resolve => ws.close(() => resolve()))
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
