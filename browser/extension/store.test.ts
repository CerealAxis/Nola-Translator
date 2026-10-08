import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserResponse, BrowserSummary } from '../../src/shared/browser'
import { BrowserFailure, type ExtensionBridge, type RequestInput } from './bridge'
import { createExtensionStore } from './store'
import type { AudioChunk } from './capture'

const summary: BrowserSummary = { protocolVersion: 1, uiLanguage: 'en', sourceLanguage: 'en', targetLanguage: 'zh', devices: [], browserAudio: true, captionServiceActive: true, config: { videoCaptions: { showSource: true, showTranslation: false, layout: 'sentence', fontSize: 28, position: 60 }, sourceLanguage: 'en', targetLanguage: 'zh' } }
function setup(options: { wrongCapture?: boolean; deferredCapture?: boolean; deferredAudio?: boolean } = {}) {
  let listener: (response: BrowserResponse) => void = () => undefined
  let onChunk: (chunk: AudioChunk) => void = () => undefined
  const requests: RequestInput[] = []
  const bridge: ExtensionBridge = {
    request: vi.fn(async (request: RequestInput): Promise<BrowserSummary | { sessionId: string } | undefined> => { requests.push(request); if (request.type === 'hello') return summary; if (request.type === 'start') return { sessionId: 'session' }; if (request.type === 'audio' && options.deferredAudio) return new Promise(() => undefined); return undefined }),
    subscribe(callback) { listener = callback; return () => { listener = () => undefined } },
    close: vi.fn(),
  }
  const video = document.createElement('video')
  Object.defineProperties(video, { currentTime: { value: 12, writable: true }, playbackRate: { value: 1, writable: true }, paused: { value: false, writable: true }, readyState: { value: 4, writable: true }, seeking: { value: false, writable: true } })
  const stopVideo = vi.fn(); const stopAudio = vi.fn()
  const capture = { getVideoTracks: () => [{ getSettings: () => ({ displaySurface: 'browser' }), getCaptureHandle: () => ({ handle: options.wrongCapture ? 'other' : 'current', origin: location.origin }) }], getAudioTracks: () => [{}], getTracks: () => [{ stop: stopVideo, addEventListener: vi.fn() }, { stop: stopAudio, addEventListener: vi.fn() }] } as unknown as MediaStream
  let resolveCapture: (stream: MediaStream) => void = () => undefined
  const getDisplayMedia = vi.fn(() => options.deferredCapture ? new Promise<MediaStream>(resolve => { resolveCapture = resolve }) : Promise.resolve(capture))
  const audio = { enable: vi.fn(), close: vi.fn(async () => undefined) }
  const store = createExtensionStore({ bridge, getDisplayMedia, audioCapture: async (_stream, callback) => { onChunk = callback; return audio } })
  store.updateVideos([video])
  return { store, bridge, requests, video, capture, audio, getDisplayMedia, stopVideo, stopAudio, resolveCapture: () => resolveCapture(capture), emit: (response: BrowserResponse) => listener(response), chunk: (epoch = store.getSnapshot().epoch) => onChunk({ buffer: new Int16Array(4800).buffer, sampleRate: 48000, epoch, sourcePeak: 0.1 }) }
}
beforeEach(() => { document.documentElement.dataset.nolaCaptureHandle = 'current' })
function deferRequest(fixture: ReturnType<typeof setup>, matches: (request: RequestInput) => boolean) {
  const original = vi.mocked(fixture.bridge.request).getMockImplementation()!
  let resolve: (value?: BrowserSummary | { sessionId: string }) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  let captured = false
  vi.mocked(fixture.bridge.request).mockImplementation(request => {
    if (!captured && matches(request)) {
      captured = true; fixture.requests.push(request)
      return new Promise((accept, fail) => { resolve = accept; reject = fail })
    }
    return original(request)
  })
  return { get captured() { return captured }, resolve: () => resolve(), reject: () => reject(new BrowserFailure('appUnavailable')) }
}
describe('extension session lifecycle', () => {
  it('unpauses before resetting the anchor after playback resumes', async () => {
    const fixture = setup()
    await fixture.store.init(); fixture.store.pressStart()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    Object.defineProperty(fixture.video, 'paused', { value: true, writable: true })
    fixture.video.dispatchEvent(new Event('pause'))
    await vi.waitFor(() => expect(fixture.requests.at(-1)).toMatchObject({ type: 'pause', paused: true }))
    const boundary = fixture.requests.length
    Object.defineProperty(fixture.video, 'paused', { value: false, writable: true })
    fixture.video.dispatchEvent(new Event('playing'))
    await vi.waitFor(() => expect(fixture.audio.enable).toHaveBeenLastCalledWith(true, 1))
    const resumed = fixture.requests.slice(boundary)
    const unpause = resumed.findIndex(request => request.type === 'pause' && !request.paused)
    const reset = resumed.findIndex(request => request.type === 'reset')
    expect(unpause).toBeGreaterThanOrEqual(0)
    expect(unpause).toBeLessThan(reset)
    await fixture.store.destroy()
  })
  it('invokes browser capture synchronously and anchors audio after model loading', async () => {
    const fixture = setup()
    await fixture.store.init()
    fixture.store.pressStart()
    expect(fixture.getDisplayMedia).toHaveBeenCalledOnce()
    expect(fixture.store.getSnapshot().status).toBe('starting')
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    expect(fixture.requests.filter(request => request.type === 'reset')).toEqual([{ type: 'reset', sessionId: 'session', epoch: 0, videoTimeMs: 12000, playbackRate: 1 }])
    fixture.chunk(); fixture.chunk()
    expect(fixture.requests.filter(request => request.type === 'audio')).toMatchObject([{ capturedAtMs: 0, sequence: 0 }, { capturedAtMs: 100, sequence: 1 }])
    await fixture.store.destroy()
  })
  it('releases all tracks after wrong-tab rejection and remains retryable', async () => {
    const fixture = setup({ wrongCapture: true }); await fixture.store.init(); fixture.store.pressStart()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('idle'))
    expect(fixture.store.getSnapshot().error).toBe('wrongCapture')
    expect(fixture.stopVideo).toHaveBeenCalledOnce(); expect(fixture.stopAudio).toHaveBeenCalledOnce()
    expect(fixture.requests.some(request => request.type === 'start')).toBe(false)
  })
  it('stops a late sharing result after cancelling startup', async () => {
    const fixture = setup({ deferredCapture: true }); fixture.store.pressStart(); await fixture.store.stop(); fixture.resolveCapture()
    await vi.waitFor(() => expect(fixture.stopVideo).toHaveBeenCalledOnce())
    expect(fixture.store.getSnapshot().status).toBe('idle')
    expect(fixture.requests.some(request => request.type === 'start')).toBe(false)
  })
  it('takes caption configuration from the desktop summary and keeps it out of the start request', async () => {
    const fixture = setup(); await fixture.store.init()
    expect(fixture.store.getSnapshot().config).toMatchObject({ fontSize: 28, position: 60, showSource: true, showTranslation: false, targetLanguage: 'zh' })
    fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    expect(fixture.requests.find(request => request.type === 'start')).toMatchObject({ source: 'tab' })
    await fixture.store.destroy()
  })
  it('requires an explicit video choice when several players are present', () => {
    const fixture = setup(); const second = document.createElement('video')
    const separate = createExtensionStore({ bridge: fixture.bridge, getDisplayMedia: fixture.getDisplayMedia })
    separate.updateVideos([fixture.video, second]); separate.pressStart()
    expect(fixture.getDisplayMedia).not.toHaveBeenCalled()
    separate.chooseVideo(1); expect(separate.getSnapshot().selectedVideo).toBe(second)
  })
  it('fences audio immediately on seeking and discards stale epoch and caption revisions', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const emitCaption = (epoch: number, revision: number, sessionId = 'session') => fixture.emit({ type: 'event', event: { type: 'caption', protocolVersion: 1, requestId: 'event', sessionId, streamEpoch: epoch, videoStartedAtMs: 12000, segment: { segmentId: 'phrase', revision, startedAtMs: 0, sourceText: String(revision), translations: [], isFinal: true } } })
    emitCaption(0, 2); emitCaption(0, 1); emitCaption(0, 3, 'other')
    expect(fixture.store.getSnapshot().captions[0].revision).toBe(2)
    fixture.video.dispatchEvent(new Event('seeking')); fixture.chunk(0)
    expect(fixture.store.getSnapshot().captions).toEqual([])
    emitCaption(0, 4); expect(fixture.store.getSnapshot().captions).toEqual([])
    await vi.waitFor(() => expect(fixture.requests.some(request => request.type === 'reset' && request.epoch === 1)).toBe(true))
    expect(fixture.requests.some(request => request.type === 'audio')).toBe(false)
    await fixture.store.destroy()
  })
  it('shows late sentences and translations regardless of their video timestamp', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const emit = (segmentId: string, videoStartedAtMs: number, revision: number) => fixture.emit({ type: 'event', event: {
      type: 'caption', protocolVersion: 1, requestId: 'event', sessionId: 'session', streamEpoch: 0, videoStartedAtMs,
      segment: { segmentId, revision, startedAtMs: 0, sourceText: segmentId, translations: [], isFinal: true },
    } })
    emit('newer', 20000, 0)
    emit('late', 10000, 0)
    expect(fixture.store.getSnapshot().captions[0].segmentId).toBe('late')
    emit('late', 10000, 1)
    expect(fixture.store.getSnapshot().captions[0].revision).toBe(1)
    await fixture.store.destroy()
  })
  it('stops and releases capture at two seconds of unacknowledged audio', async () => {
    const fixture = setup({ deferredAudio: true }); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    for (let index = 0; index < 21; index++) fixture.chunk()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('idle'))
    expect(fixture.store.getSnapshot().error).toBe('slowAudio'); expect(fixture.stopAudio).toHaveBeenCalledOnce(); expect(fixture.audio.close).toHaveBeenCalledOnce()
  })
  it('cleans up on native disconnect and shows the actionable error', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    fixture.emit({ type: 'error', id: '*', code: 'connectionLost', message: '' })
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('idle'))
    expect(fixture.store.getSnapshot().error).toBe('connectionLost'); expect(fixture.stopVideo).toHaveBeenCalledOnce()
  })
  it('pauses input without changing captions and resumes on a fresh epoch', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    fixture.video.dispatchEvent(new Event('waiting')); fixture.chunk()
    expect(fixture.store.getSnapshot().playbackPaused).toBe(true)
    expect(fixture.requests.some(request => request.type === 'audio')).toBe(false)
    fixture.video.dispatchEvent(new Event('playing'))
    await vi.waitFor(() => expect(fixture.audio.enable).toHaveBeenLastCalledWith(true, 1))
    fixture.chunk(1)
    expect(fixture.requests.filter(request => request.type === 'audio')).toMatchObject([{ epoch: 1, capturedAtMs: 0 }])
    await fixture.store.destroy()
  })
  it('flushes the recognizer before cleanup on natural video end', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    Object.defineProperty(fixture.video, 'ended', { value: true })
    vi.useFakeTimers()
    try {
      fixture.video.dispatchEvent(new Event('ended'))
      expect(fixture.audio.enable).toHaveBeenLastCalledWith(false, 0)
      await vi.advanceTimersByTimeAsync(350)
      const finish = fixture.requests.findIndex(request => request.type === 'finish')
      const stop = fixture.requests.findIndex(request => request.type === 'stop')
      expect(finish).toBeGreaterThan(-1); expect(stop).toBeGreaterThan(finish)
      expect(fixture.store.getSnapshot().status).toBe('idle')
    } finally { vi.useRealTimers() }
  })
  it('reuses tab capture when an automatic next player replaces the ended element', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const replacement = document.createElement('video')
    Object.defineProperties(replacement, { currentTime: { value: 0 }, readyState: { value: 4 }, paused: { value: false } })
    fixture.video.dispatchEvent(new Event('ended')); fixture.store.updateVideos([replacement])
    await vi.waitFor(() => expect(fixture.audio.enable).toHaveBeenLastCalledWith(true, 1))
    expect(fixture.getDisplayMedia).toHaveBeenCalledOnce()
    expect(fixture.store.getSnapshot().selectedVideo).toBe(replacement)
    expect(fixture.requests.some(request => request.type === 'stop')).toBe(false)
    await fixture.store.destroy()
  })
  it('shows desktop availability failure without throwing at module initialization', async () => {
    const fixture = setup(); vi.mocked(fixture.bridge.request).mockRejectedValueOnce(new BrowserFailure('appUnavailable'))
    await fixture.store.init(); expect(fixture.store.getSnapshot().error).toBe('appUnavailable')
  })
  it('does not reopen audio when waiting occurs during a reset pause acknowledgement', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const ack = deferRequest(fixture, request => request.type === 'pause' && !request.paused)
    fixture.store.timelineChanged(); await vi.waitFor(() => expect(ack.captured).toBe(true))
    fixture.video.dispatchEvent(new Event('waiting')); ack.resolve()
    await vi.waitFor(() => expect(fixture.audio.enable).toHaveBeenLastCalledWith(false, 1))
    expect(fixture.audio.enable).not.toHaveBeenCalledWith(true, 1)
    fixture.chunk(1); expect(fixture.requests.some(request => request.type === 'audio')).toBe(false)
    await fixture.store.destroy()
  })
  it('honors waiting during startup even when the video readyState still looks playable', async () => {
    const fixture = setup(); await fixture.store.init()
    const ack = deferRequest(fixture, request => request.type === 'pause' && !request.paused)
    fixture.store.pressStart(); await vi.waitFor(() => expect(ack.captured).toBe(true))
    fixture.video.dispatchEvent(new Event('waiting')); ack.resolve()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    expect(fixture.audio.enable).toHaveBeenLastCalledWith(false, 0)
    expect(fixture.audio.enable).not.toHaveBeenCalledWith(true, 0)
    await fixture.store.destroy()
  })
  it('reanchors startup after a rate change while the initial reset is pending', async () => {
    const fixture = setup(); await fixture.store.init()
    const ack = deferRequest(fixture, request => request.type === 'reset' && request.epoch === 0)
    fixture.store.pressStart(); await vi.waitFor(() => expect(ack.captured).toBe(true))
    fixture.video.currentTime = 33; fixture.video.playbackRate = 1.5; fixture.video.dispatchEvent(new Event('ratechange')); ack.resolve()
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    expect(fixture.requests.filter(request => request.type === 'reset')).toMatchObject([{ epoch: 0 }, { epoch: 1, videoTimeMs: 33000, playbackRate: 1.5 }])
    expect(fixture.audio.enable).toHaveBeenLastCalledWith(true, 1)
    await fixture.store.destroy()
  })
  it('ignores a rejected reset from the prior generation after a new session starts', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const ack = deferRequest(fixture, request => request.type === 'reset' && request.epoch === 1)
    fixture.store.timelineChanged(); await vi.waitFor(() => expect(ack.captured).toBe(true)); await fixture.store.stop()
    fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    ack.reject(); await new Promise(resolve => setTimeout(resolve, 0))
    expect(fixture.store.getSnapshot()).toMatchObject({ status: 'active', error: undefined })
    expect(fixture.requests.filter(request => request.type === 'stop')).toHaveLength(1)
    await fixture.store.destroy()
  })
  it('requires a new explicit choice when a second video appears before start', () => {
    const fixture = setup(); const second = document.createElement('video')
    fixture.store.updateVideos([fixture.video, second]); fixture.store.pressStart()
    expect(fixture.store.getSnapshot().selectedVideo).toBeNull(); expect(fixture.getDisplayMedia).not.toHaveBeenCalled()
    fixture.store.chooseVideo(0); fixture.store.updateVideos([fixture.video, second])
    expect(fixture.store.getSnapshot().selectedVideo).toBe(fixture.video)
  })
  it('stops when the pinned player disappears and its replacement is ambiguous', async () => {
    const fixture = setup(); await fixture.store.init(); fixture.store.pressStart(); await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('active'))
    const replacements = [document.createElement('video'), document.createElement('video')]
    fixture.store.updateVideos(replacements)
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('idle'))
    expect(fixture.store.getSnapshot().selectedVideo).toBeNull(); expect(fixture.stopAudio).toHaveBeenCalledOnce()
  })
  it('exposes retry after disconnect even when a previous desktop summary remains', async () => {
    const fixture = setup(); await fixture.store.init()
    fixture.emit({ type: 'error', id: '*', code: 'connectionLost', message: '' })
    await vi.waitFor(() => expect(fixture.store.getSnapshot().status).toBe('idle'))
    expect(fixture.store.getSnapshot()).toMatchObject({ summary, connected: false })
    await fixture.store.init(); expect(fixture.store.getSnapshot()).toMatchObject({ connected: true, error: undefined })
  })
})
