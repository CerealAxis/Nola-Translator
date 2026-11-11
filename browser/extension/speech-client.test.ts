import { afterEach, expect, it, vi } from 'vitest'
import { createSpeechBridge, speechError, usesSpeechRuntime } from './speech-client'
import { DEFAULT_PREFERENCES } from './preferences'
import type { ExtensionBridge } from './bridge'
import type { BrowserResponse } from '../../src/shared/browser'

afterEach(() => vi.unstubAllGlobals())
function fixture(ready = true) {
  const messages: Array<(message: unknown) => void> = []
  const port = { name: 'nola-speech', onMessage: { addListener: (listener: (message: unknown) => void) => messages.push(listener) },
    onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn(),
    postMessage: vi.fn((message: { type: string }) => { if (ready && message.type === 'start') queueMicrotask(() => messages.forEach(listener => listener({ type: 'ready' }))) }) }
  vi.stubGlobal('chrome', { runtime: { connect: () => port } })
  const native: ExtensionBridge = { request: vi.fn(async request => request.type === 'start' ? { sessionId: 'native-id' } : undefined), subscribe: () => () => {}, close: vi.fn() }
  let preferences = { ...DEFAULT_PREFERENCES, asrProvider: 'desktop', pipeline: 'cascade' as const }
  const bridge = createSpeechBridge(native, () => preferences)
  return { bridge, port, native, setPreferences: (value: typeof DEFAULT_PREFERENCES) => { preferences = value as typeof preferences }, emit: (event: unknown) => messages.forEach(listener => listener(event)) }
}
const start = { type: 'start' as const, source: 'tab' as const, streamId: 'input', epoch: 0, videoTimeMs: 10000, playbackRate: 1.5 }

it('keeps the session backend pinned when preferences change before stopping', async () => {
  const f = fixture()
  const result = await f.bridge.request(start)
  f.setPreferences({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', subtitleProvider: 'desktop', pipeline: 'desktop' })
  await f.bridge.request({ type: 'stop', sessionId: (result as { sessionId: string }).sessionId })
  expect(f.port.disconnect).toHaveBeenCalled()
  expect(f.native.request).not.toHaveBeenCalled()
  f.bridge.close()
})

it('also stops a native session through native after switching to external settings', async () => {
  const f = fixture()
  f.setPreferences({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', subtitleProvider: 'desktop', pipeline: 'desktop' })
  await f.bridge.request(start)
  f.setPreferences({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', pipeline: 'cascade' })
  await f.bridge.request({ type: 'stop', sessionId: 'native-id' })
  expect(f.native.request).toHaveBeenLastCalledWith({ type: 'stop', sessionId: 'native-id' }, undefined)
  f.bridge.close()
})

it('maps per-item audio times to the player clock and retains final results while paused', async () => {
  const f = fixture(), events: BrowserResponse[] = []
  f.bridge.subscribe(event => events.push(event))
  await f.bridge.request(start)
  await f.bridge.request({ type: 'pause', sessionId: 'input', paused: true })
  f.emit({ type: 'caption', itemId: 'first', text: 'One', final: true, revision: 1, startedAtMs: 0, endedAtMs: 500 })
  f.emit({ type: 'caption', itemId: 'second', text: 'Two', final: true, revision: 2, startedAtMs: 800, endedAtMs: 1200 })
  expect(events).toMatchObject([
    { event: { videoStartedAtMs: 10000, videoEndedAtMs: 10750, segment: { sourceText: 'One', isFinal: true } } },
    { event: { videoStartedAtMs: 11200, videoEndedAtMs: 11800, segment: { sourceText: 'Two', isFinal: true } } },
  ])
  f.bridge.close()
})

it('rejects an opening session immediately when the owner closes', async () => {
  const f = fixture(false)
  const pending = f.bridge.request(start)
  f.bridge.close()
  await expect(pending).rejects.toThrow('connectionLost')
})

it('preserves permission, model and authentication errors through legal desktop codes', () => {
  expect(speechError('providerPermission')).toBe('browserPermissionDenied')
  expect(speechError('providerModel')).toBe('modelUnavailable')
  expect(speechError('providerAuthentication')).toBe('invalidCredential')
  expect(speechError('arbitrary secret-bearing error')).toBe('translationNetworkUnavailable')
})


it('uses split ASR and MT execution when only the subtitle translation provider is external', () => {
  expect(usesSpeechRuntime({ ...DEFAULT_PREFERENCES, pipeline: 'desktop', asrProvider: 'desktop', subtitleProvider: 'microsoft-translate' })).toBe(true)
  expect(usesSpeechRuntime({ ...DEFAULT_PREFERENCES, pipeline: 's2s', s2sProvider: 'desktop', subtitleProvider: 'microsoft-translate' })).toBe(false)
})
