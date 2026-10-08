import { describe, expect, it, vi } from 'vitest'
import { SessionController } from '../../../src/main/session-controller'
import type { EngineProcess } from '../../../src/main/engine-process'
import type { MeetingStore } from '../../../src/main/meeting-store'
import type { SessionConfig } from '../../../src/shared/contracts'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { browserRequestSchema, BROWSER_EXTENSION_ID, BROWSER_EXTENSION_KEY } from '../../../src/shared/browser'
import { createHash } from 'node:crypto'
import { engineCommandSchema, engineEventSchema } from '../../../src/shared/schemas'

function fixture(prepare = async () => {}) {
  const request = vi.fn(async (command: { type: string }) => ({ sessionId: 'session', type: command.type === 'startSession' ? 'sessionStarted' : 'sessionStopped' }))
  const begin = vi.fn(async () => ({ meetingId: 'meeting' }))
  const finish = vi.fn(async () => {})
  const overlay = vi.fn()
  const engine = { currentState: 'ready', request, supports: () => true } as unknown as EngineProcess
  const meetings = { begin, finish, attach: vi.fn(), abandon: vi.fn(), recordingPathFor: () => 'private.wav' } as unknown as MeetingStore
  const controller = new SessionController({ engine, meetings, prepare, getSettings: () => DEFAULT_SETTINGS, getCredential: async () => 'secret', whenReady: async () => {}, startingChanged: () => {}, showOverlay: overlay, hideOverlay: () => {} })
  return { controller, request, begin, finish, overlay }
}
const config: SessionConfig = { audioSource: { kind: 'browserTab', streamId: 'stream' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['en'], browserTimeline: { epoch: 0, videoTimeMs: 45000, playbackRate: 1 } }

describe('browser session boundary', () => {
  it('never creates a meeting, recording or overlay and injects credentials privately', async () => {
    const f = fixture()
    await f.controller.start({ ...config, recordingPath: 'forbidden.wav', translationProvider: 'cloud' }, 'browser')
    expect(f.begin).not.toHaveBeenCalled()
    expect(f.overlay).not.toHaveBeenCalled()
    expect(f.request.mock.calls[0][0]).toMatchObject({ config: { translationOptions: { apiKey: 'secret' } } })
    expect(f.request.mock.calls[0][0]).not.toHaveProperty('config.recordingPath')
    await f.controller.stop('session')
    expect(f.finish).not.toHaveBeenCalled()
  })
  it('reserves the session during model preparation across both clients', async () => {
    let ready = () => {}
    const f = fixture(() => new Promise<void>(resolve => { ready = resolve }))
    const start = f.controller.start(config, 'browser')
    await expect(f.controller.start({ ...config, browserTimeline: undefined, audioSource: { kind: 'defaultOutput' } }, 'desktop')).rejects.toThrow('sessionAlreadyRunning')
    ready()
    await start
    expect(() => f.controller.assertOwner('session', 'desktop')).toThrow('sessionNotRunning')
    await expect(f.controller.start(config, 'browser')).rejects.toThrow('sessionAlreadyRunning')
  })
  it('retains desktop recording behavior', async () => {
    const f = fixture()
    const result = await f.controller.start({ ...config, audioSource: { kind: 'defaultOutput' }, browserTimeline: undefined }, 'desktop')
    expect(result.meetingId).toBe('meeting')
    expect(f.overlay).toHaveBeenCalledOnce()
    expect(f.request.mock.calls[0][0]).toHaveProperty('config.recordingPath', 'private.wav')
  })
  it('validates the restricted public protocol and fixed development identity', () => {
    expect(browserRequestSchema.safeParse({ id: 'id', type: 'readFile', path: 'private' }).success).toBe(false)
    expect(browserRequestSchema.safeParse({ id: 'id', type: 'hello', apiKey: 'secret' }).success).toBe(false)
    const derived = [...createHash('sha256').update(Buffer.from(BROWSER_EXTENSION_KEY, 'base64')).digest().subarray(0, 16)].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('')
    expect(derived).toBe(BROWSER_EXTENSION_ID)
  })
  it('accepts browser timeline events and rejects invalid PCM wire data', () => {
    expect(engineEventSchema.safeParse({ protocolVersion: 1, requestId: 'id', type: 'streamReset', sessionId: 's', epoch: 2 }).success).toBe(true)
    expect(engineCommandSchema.safeParse({ protocolVersion: 1, requestId: 'id', type: 'pushAudio', sessionId: 's', streamId: 't', epoch: 0, sequence: 0, sampleRate: 48000, capturedAtMs: 0, pcmBase64: 'invalid!' }).success).toBe(false)
  })
})
