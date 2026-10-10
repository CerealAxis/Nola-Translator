import type { BrowserResponse, BrowserSummary } from '../../src/shared/browser'
import type { VideoCaptionAudioSource, VideoCaptionSettings } from '../../src/shared/settings'
import type { CaptionSegment } from '../../src/shared/contracts'
import { BrowserFailure, type ExtensionBridge } from './bridge'
import { CAPTURE_OPTIONS, createAudioCapture, pcmBase64, releaseTracks, validateCapture, type AudioCapture, type AudioChunk } from './capture'

export interface Caption extends CaptionSegment { videoStartedAtMs: number; videoEndedAtMs?: number }
/**
 * Caption presentation owned by the desktop application. The extension only reads it: font size is
 * in pixels and `position` is the percent of the video height at which the caption block's bottom
 * edge rests, matching the desktop settings units.
 */
export type CaptionConfig = VideoCaptionSettings & { sourceLanguage: string; targetLanguage: string }
/** Mirrors the desktop defaults so a desktop without the config field still renders as configured there. */
const DEFAULT_CAPTION_CONFIG: CaptionConfig = { showSource: true, showTranslation: true, layout: 'sentence', fontSize: 24, position: 82, sourceLanguage: 'auto', targetLanguage: 'none', audioSource: 'tab' }
/**
 * The desktop picker stores the system default output as a device id, because one flat list drives
 * the setting. It names a source kind rather than a device, so it never appears in `summary.devices`.
 */
export const SYSTEM_DEFAULT_OUTPUT_ID = 'defaultOutput'
/**
 * Only an explicit `system` asks the desktop to capture. The field is absent on a desktop that
 * predates it, and that desktop only ever shared tab audio, so an absent value reads as `tab`.
 */
export function captionAudioSource(config: CaptionConfig): VideoCaptionAudioSource { return config.audioSource === 'system' ? 'system' : 'tab' }
export interface ExtensionState {
  status: 'idle' | 'starting' | 'active' | 'stopping'
  playbackPaused: boolean
  connected: boolean
  panelOpen: boolean
  summary?: BrowserSummary
  /** Mirrors the desktop's caption-service gate. A closed gate admits no session, so the panel cannot offer to start. */
  captionServiceActive: boolean
  error?: string
  config: CaptionConfig
  videos: HTMLVideoElement[]
  selectedVideo: HTMLVideoElement | null
  epoch: number
  captions: Caption[]
}
export interface StoreDependencies {
  bridge: ExtensionBridge
  getDisplayMedia?: (options: DisplayMediaStreamOptions) => Promise<MediaStream>
  audioCapture?: typeof createAudioCapture
}
/** How often an open panel re-reads the desktop's caption-service gate, which the desktop never pushes. */
const GATE_REFRESH_MS = 2000
/** Per-event floor on diagnostic traffic; one line a second is enough to localize a stall. */
const DEBUG_THROTTLE_MS = 1000
/** Marks the instrumented build so a log proves which extension copy produced it. */
const DEBUG_BUILD_MARKER = 'nola-pipeline-debug-v1'
/** `timeupdate` fires several times a second and is the noisiest signal on the player. */
const VIDEO_EVENT_THROTTLE_MS = 2000
/** Round trips `synchronizePause` spends settling one pause state before leaving the gate as it found it. */
const PAUSE_SYNC_ATTEMPTS = 8
/** 100 ms chunks of exact digital silence, with playback moving, before the capture is called dead. */
const SILENCE_CHUNKS_TO_FAIL = 30
const record = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
const flag = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback
const code = (value: unknown, fallback: string): string => typeof value === 'string' && value.length > 0 && value.length <= 32 ? value : fallback
/** Device ids are opaque and much longer than a language code, so they are bounded on their own. */
const device = (value: unknown, fallback: string | undefined): string | undefined => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : fallback
/** An out-of-range value from the desktop must not be able to collapse or overflow the overlay. */
const measure = (value: unknown, min: number, max: number, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
/**
 * The desktop and the extension are versioned separately, so a hello response may carry no config
 * at all or only part of it. Every field falls back on its own, which keeps a partially upgraded
 * desktop rendering complete captions instead of throwing inside the overlay.
 */
function mergeDesktopConfig(previous: CaptionConfig, incoming: unknown): CaptionConfig {
  const root = record(incoming)
  if (!root) return previous
  const videoCaptions = record(root.videoCaptions)
  return {
    showSource: flag(videoCaptions?.showSource, previous.showSource),
    showTranslation: flag(videoCaptions?.showTranslation, previous.showTranslation),
    layout: 'sentence',
    fontSize: measure(videoCaptions?.fontSize, 8, 96, previous.fontSize),
    position: measure(videoCaptions?.position, 0, 100, previous.position),
    sourceLanguage: code(root.sourceLanguage, previous.sourceLanguage),
    targetLanguage: code(root.targetLanguage, previous.targetLanguage),
    audioSource: videoCaptions?.audioSource === 'system' ? 'system' : previous.audioSource,
    audioDeviceId: device(videoCaptions?.audioDeviceId, previous.audioDeviceId),
  }
}
/**
 * The desktop and the extension ship separately, so a summary may be missing fields the current
 * contract calls required. Each one is checked on its own and a summary that fails any check is
 * rejected as a whole, which is what keeps a partially upgraded desktop from being half trusted.
 * `captionServiceActive` is normalised here because a desktop without the gate never had one, and an
 * absent gate has to read as closed.
 */
function readSummary(value: unknown): BrowserSummary | null {
  if (!value || typeof value !== 'object' || !('uiLanguage' in value)) return null
  const summary = value as BrowserSummary
  if (summary.protocolVersion !== 1 || typeof summary.browserAudio !== 'boolean') return null
  return { ...summary, captionServiceActive: flag(summary.captionServiceActive, false) }
}
/** The packaged manifest version, which is what tells two loaded builds apart in a log. */
function manifestVersion(): string | null {
  try { return (chrome.runtime as { getManifest?: () => { version?: string } }).getManifest?.().version ?? null } catch { return null }
}
/** Full-scale is 32768 for Int16 PCM; the floor keeps a digital-silent chunk readable as -120. */
function dbfs(amplitude: number): number { return Math.max(-120, 20 * Math.log10(Math.max(amplitude, 1e-6))) }
function peakOf(buffer: ArrayBuffer): number {
  const samples = new Int16Array(buffer)
  let peak = 0
  for (let index = 0; index < samples.length; index++) { const value = Math.abs(samples[index]); if (value > peak) peak = value }
  return peak / 32768
}
function energyOf(buffer: ArrayBuffer): number {
  const samples = new Int16Array(buffer)
  let total = 0
  for (let index = 0; index < samples.length; index++) { const value = samples[index] / 32768; total += value * value }
  return total
}
export function createExtensionStore(dependencies: StoreDependencies) {
  let state: ExtensionState = { status: 'idle', playbackPaused: false, connected: false, panelOpen: false, captionServiceActive: false, config: DEFAULT_CAPTION_CONFIG, videos: [], selectedVideo: null, epoch: 0, captions: [] }
  const listeners = new Set<() => void>()
  let sessionId: string | null = null
  let streamId = ''
  let media: MediaStream | null = null
  let audio: AudioCapture | null = null
  let generation = 0
  let epochSamples = 0
  let sequence = 0
  let pendingMs = 0
  let accepting = false
  let transition: Promise<void> = Promise.resolve()
  let videoCleanup: (() => void) | null = null
  let endingTimer: ReturnType<typeof setTimeout> | null = null
  let gateTimer: ReturnType<typeof setInterval> | null = null
  let refreshingSummary = false
  let explicitVideo: HTMLVideoElement | null = null
  let playbackVersion = 0
  let timelineVersion = 0
  let previousStatus = state.status
  const sampleWindow = { count: 0, peak: 0, energy: 0, samples: 0, sequence: 0, atMs: 0 }
  let silenceChunks = 0
  let timeupdateLoggedAtMs = 0
  const debugGate = new Map<string, number>()
  /**
   * Fire-and-forget diagnostic line for the desktop's pipeline log. Throttled per event name so a
   * hot signal cannot turn into one request per audio chunk, and never awaited: the caption path
   * must not gain a round trip it can be blocked on.
   */
  const debug = (event: string, data?: Record<string, unknown>): void => {
    const now = Date.now()
    const last = debugGate.get(event)
    if (last !== undefined && now - last < DEBUG_THROTTLE_MS) return
    debugGate.set(event, now)
    try { void dependencies.bridge.request({ type: 'debug', event, ...(data ? { data } : {}) }).catch(() => undefined) } catch { /* A diagnostic cannot fail a session. */ }
  }
  const set = (patch: Partial<ExtensionState>): void => {
    const status = patch.status
    state = { ...state, ...patch }
    if (status !== undefined && status !== previousStatus) { previousStatus = status; debug('ext.status', { status, error: state.error }) }
    for (const listener of listeners) listener()
  }
  const failCode = (error: unknown): string => error instanceof BrowserFailure ? error.code : error instanceof DOMException && error.name === 'NotAllowedError' ? 'captureCancelled' : 'error'
  const anchor = () => ({ videoTimeMs: Math.max(0, (state.selectedVideo?.currentTime ?? 0) * 1000), playbackRate: state.selectedVideo?.playbackRate || 1 })
  const videoPaused = (): boolean => !state.selectedVideo || state.selectedVideo.paused || state.selectedVideo.seeking || state.selectedVideo.readyState < 3
  const paused = (): boolean => state.playbackPaused || videoPaused()
  /** The element itself, ignoring the latched `playbackPaused`, so a stale latch can be told apart from a real stall. */
  const advancing = (): boolean => !!state.selectedVideo && !videoPaused()
  /** Every transition of the audio gate is reported: which latch closed it is the whole question. */
  const setAccepting = (value: boolean, reason: string): void => {
    if (accepting === value) return
    accepting = value
    debug('ext.accepting', { value, reason, playbackPaused: state.playbackPaused, videoPaused: videoPaused() })
  }
  const fence = (): void => { setAccepting(false, 'fence'); audio?.enable(false, state.epoch) }
  const closeResources = async (): Promise<void> => {
    fence(); videoCleanup?.(); videoCleanup = null
    if (endingTimer) { clearTimeout(endingTimer); endingTimer = null }
    if (media) { releaseTracks(media); media = null }
    const previousAudio = audio; audio = null
    await previousAudio?.close().catch(() => undefined)
    set({ captions: [] })
  }
  const stop = async (error?: string): Promise<void> => {
    const stopGeneration = ++generation; fence()
    transition = Promise.resolve()
    const id = sessionId; sessionId = null
    set({ status: 'stopping', error })
    await closeResources()
    try { if (id) await dependencies.bridge.request({ type: 'stop', sessionId: id }) } catch { /* Cleanup must survive a disconnected desktop. */ }
    if (generation === stopGeneration) set({ status: 'idle', captions: [], error })
  }
  const enqueue = (operation: () => Promise<void>): void => {
    const operationGeneration = generation; const operationSession = sessionId
    transition = transition.then(async () => {
      if (operationGeneration === generation && operationSession === sessionId) await operation()
    }).catch(error => {
      if (operationGeneration === generation && operationSession === sessionId) void stop(failCode(error))
    })
  }
  const synchronizePause = async (id: string, operationGeneration: number, epoch: number): Promise<void> => {
    // A media event landing mid-round-trip invalidates the answer, so the pair is retried. The
    // bound is what keeps a player that stalls continuously from spinning here forever: a stalled
    // player keeps raising the events that invalidate each attempt, and an unbounded loop would
    // never hand `start()` back to declare the session active.
    for (let attempt = 0; attempt < PAUSE_SYNC_ATTEMPTS; attempt++) {
      if (id !== sessionId || operationGeneration !== generation || epoch !== state.epoch) return
      const version = playbackVersion
      const isPaused = paused()
      await dependencies.bridge.request({ type: 'pause', sessionId: id, paused: isPaused })
      if (id !== sessionId || operationGeneration !== generation || epoch !== state.epoch) return
      if (version === playbackVersion && isPaused === paused()) {
        setAccepting(!isPaused, 'pauseSync'); audio?.enable(accepting, epoch)
        return
      }
    }
  }
  const reset = (): void => {
    timelineVersion++
    if (state.status === 'starting') { fence(); set({ captions: [] }); return }
    if (!sessionId || state.status !== 'active') return
    fence()
    set({ epoch: state.epoch + 1, captions: [] })
    const epoch = state.epoch
    const id = sessionId
    const operationGeneration = generation
    enqueue(async () => {
      if (sessionId !== id) return
      // Unpausing invalidates the engine's anchor; resume first so reset can reopen capture.
      await dependencies.bridge.request({ type: 'pause', sessionId: id, paused: paused() })
      if (sessionId !== id || epoch !== state.epoch) return
      await dependencies.bridge.request({ type: 'reset', sessionId: id, epoch, ...anchor() })
      if (sessionId !== id || epoch !== state.epoch) return
      epochSamples = 0
      await synchronizePause(id, operationGeneration, epoch)
    })
  }
  const suspend = (): void => {
    playbackVersion++
    fence()
    set({ playbackPaused: true })
    if (!sessionId || state.status !== 'active') return
    const id = sessionId
    enqueue(async () => { if (sessionId === id && !state.selectedVideo?.ended) await dependencies.bridge.request({ type: 'pause', sessionId: id, paused: true }) })
  }
  /** Playback is moving again: drop the latch and re-anchor the stream onto the current position. */
  const resume = (): void => {
    playbackVersion++
    set({ playbackPaused: videoPaused() })
    reset()
  }
  const bind = (video: HTMLVideoElement | null): void => {
    videoCleanup?.(); videoCleanup = null
    set({ selectedVideo: video, playbackPaused: !video || video.paused || video.seeking || video.readyState < 3 })
    if (!video) return
    const handlers: [string, EventListener][] = [
      ['pause', suspend], ['waiting', suspend], ['seeking', () => { suspend(); reset() }], ['seeked', resume], ['ratechange', reset], ['playing', resume], ['loadedmetadata', reset], ['emptied', suspend],
      /*
       * `playbackPaused` is a latch: `suspend` raises it and only a resume event lowers it, so a
       * stall signal the element never followed up on — a `waiting` it recovered from silently, a
       * `playing` sampled while readyState was still below HAVE_FUTURE_DATA — would hold the audio
       * gate shut for the rest of the session with no error and no further event to clear it.
       * `timeupdate` only fires while currentTime actually advances, so it is the one signal that
       * distinguishes a player running on from a latch left over, and it reopens the gate.
       */
      ['timeupdate', () => { if (state.playbackPaused && advancing()) resume() }],
      ['ended', () => {
        fence(); set({ playbackPaused: true })
        // A short grace period allows an automatic next-player replacement to reuse the existing tab stream.
        endingTimer = setTimeout(() => {
          endingTimer = null
          const id = sessionId; const epoch = state.epoch
          if (!id || state.selectedVideo !== video || !video.ended) return
          enqueue(async () => {
            try { await dependencies.bridge.request({ type: 'finish', sessionId: id, epoch }) } catch { /* A failed tail flush still ends the session. */ }
            if (sessionId === id && state.epoch === epoch) await stop()
          })
        }, 350)
      }],
    ]
    /*
     * `readyState` and whether `timeupdate` fires at all are what separate a live player from one
     * the pause latch closed on, so every media event is reported with both. `timeupdate` fires
     * several times a second and is throttled far harder than the rest.
     */
    const bound: [string, EventListener][] = handlers.map(([name, handler]) => [name, event => {
      if (name !== 'timeupdate' || Date.now() - timeupdateLoggedAtMs >= VIDEO_EVENT_THROTTLE_MS) {
        if (name === 'timeupdate') timeupdateLoggedAtMs = Date.now()
        debug('ext.videoEvent', { name, playbackPaused: state.playbackPaused, videoPaused: videoPaused(), readyState: video.readyState, currentTimeMs: Math.round(video.currentTime * 1000) })
      }
      handler(event as Event)
    }])
    for (const [name, handler] of bound) video.addEventListener(name, handler)
    videoCleanup = () => { for (const [name, handler] of bound) video.removeEventListener(name, handler) }
  }
  const onAudio = (chunk: AudioChunk): void => {
    if (!accepting || !sessionId || chunk.epoch !== state.epoch) {
      debug('ext.chunkDropped', { reason: !accepting ? 'notAccepting' : !sessionId ? 'noSession' : 'epochMismatch', epoch: chunk.epoch, chunkEpoch: state.epoch })
      return
    }
    // A silent tab still delivers chunks at the right rate, so the level is what separates
    // "the worklet is not running" from "the worklet is running on zeroes".
    sampleWindow.count++
    sampleWindow.peak = Math.max(sampleWindow.peak, peakOf(chunk.buffer))
    sampleWindow.energy += energyOf(chunk.buffer)
    sampleWindow.samples += chunk.buffer.byteLength / 2
    sampleWindow.sequence = sequence
    if (Date.now() - sampleWindow.atMs >= DEBUG_THROTTLE_MS) {
      const reported = { count: sampleWindow.count, sampleRate: chunk.sampleRate, peakDbfs: dbfs(sampleWindow.peak), rmsDbfs: dbfs(Math.sqrt(sampleWindow.energy / Math.max(1, sampleWindow.samples))), sourcePeakDbfs: dbfs(chunk.sourcePeak ?? 0), workletPeakDbfs: dbfs(chunk.workletPeak ?? 0), sequence: sampleWindow.sequence, epoch: state.epoch }
      sampleWindow.count = 0; sampleWindow.peak = 0; sampleWindow.energy = 0; sampleWindow.samples = 0; sampleWindow.atMs = Date.now()
      debug('ext.chunk', reported)
    }
    // A tab that was shared without its audio still delivers chunks at the right rate, on zeroes,
    // and every other signal looks healthy, so the session would otherwise sit at "recognizing"
    // with nothing to show and no reason given. Advancing playback plus a few seconds of exact
    // digital silence is a capture that will not recover on its own.
    if (sampleWindow.count === 0) {
      silenceChunks = peakOf(chunk.buffer) > 0 ? 0 : silenceChunks + 1
      if (silenceChunks >= SILENCE_CHUNKS_TO_FAIL && advancing() && (chunk.sourcePeak ?? 0) <= 0) {
        debug('ext.silent', { silenceChunks, sourcePeakDbfs: dbfs(chunk.sourcePeak ?? 0), workletPeakDbfs: dbfs(chunk.workletPeak ?? 0) })
        void stop('tabAudioSilent'); return
      }
    }
    const duration = chunk.buffer.byteLength / 2 / chunk.sampleRate * 1000
    if (pendingMs + duration > 2000) { void stop('slowAudio'); return }
    const capturedAtMs = epochSamples / chunk.sampleRate * 1000
    epochSamples += chunk.buffer.byteLength / 2
    pendingMs += duration
    const requestGeneration = generation
    void dependencies.bridge.request({ type: 'audio', sessionId, streamId, epoch: state.epoch, sequence: sequence++, sampleRate: chunk.sampleRate, capturedAtMs, pcmBase64: pcmBase64(chunk.buffer) }).catch(error => { if (requestGeneration === generation) { debug('ext.audioFailed', { code: failCode(error) }); void stop(failCode(error)) } }).finally(() => { if (requestGeneration === generation) pendingMs = Math.max(0, pendingMs - duration) })
  }
  const start = async (capturePromise: Promise<MediaStream> | null, startGeneration: number): Promise<void> => {
    try {
      // A null capture promise is a desktop-side system capture; the tab path always brings a stream.
      if (capturePromise) {
        const stream = await capturePromise
        if (startGeneration !== generation) { releaseTracks(stream); return }
        media = stream
        validateCapture(stream, document.documentElement.dataset.nolaCaptureHandle, location.origin)
        // The audio track's own settings and mute state are the only place a wrong or silent
        // track shows up before any sample reaches the worklet.
        try {
          const videoTrack = stream.getVideoTracks()[0]
          const audioTrack = stream.getAudioTracks()[0]
          debug('ext.capture', { audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length, settings: audioTrack?.getSettings?.() ?? null, displaySurface: videoTrack?.getSettings?.().displaySurface ?? null, handleMatches: true, contextSampleRate: null, contextState: null, muted: audioTrack?.muted ?? null })
        } catch { /* A track that cannot be described is not a capture failure. */ }
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', () => { if (startGeneration === generation) void stop('captureCancelled') }, { once: true })
          track.addEventListener('capturehandlechange', () => { try { validateCapture(stream, document.documentElement.dataset.nolaCaptureHandle, location.origin) } catch { void stop('wrongCapture') } })
        }
        const createdAudio = await (dependencies.audioCapture ?? createAudioCapture)(stream, onAudio, (event, data) => debug(event, data))
        if (startGeneration !== generation) { await createdAudio.close(); releaseTracks(stream); return }
        audio = createdAudio
      }
      if (startGeneration !== generation) return
      streamId = crypto.randomUUID(); sequence = 0; epochSamples = 0; pendingMs = 0; silenceChunks = 0
      set({ epoch: 0, captions: [] })
      // A system capture is taken by the desktop from the configured output device, so the request
      // names that device and the extension keeps no stream of its own; `streamId` stays required
      // by the protocol either way.
      const source = captionAudioSource(state.config)
      const deviceId = source === 'system' ? state.config.audioDeviceId : undefined
      const result = await dependencies.bridge.request({ type: 'start', source, ...(deviceId ? { deviceId } : {}), streamId, epoch: 0, ...anchor() })
      if (!result || !('sessionId' in result)) throw new BrowserFailure('error')
      if (startGeneration !== generation) { await dependencies.bridge.request({ type: 'stop', sessionId: result.sessionId }); return }
      sessionId = result.sessionId
      // Events remain bound while models load; repeat the anchor if seeking/rate/video changed during an acknowledgement.
      let startupEpoch = 0
      while (startGeneration === generation) {
        const version = timelineVersion
        const id: string = sessionId
        set({ epoch: startupEpoch })
        await dependencies.bridge.request({ type: 'pause', sessionId: id, paused: paused() })
        if (startGeneration !== generation || sessionId !== id) return
        await dependencies.bridge.request({ type: 'reset', sessionId: id, epoch: startupEpoch, ...anchor() })
        if (startGeneration !== generation || sessionId !== id) return
        await synchronizePause(id, startGeneration, startupEpoch)
        if (startGeneration !== generation || sessionId !== id) return
        if (version === timelineVersion) break
        fence(); startupEpoch++
      }
      if (startGeneration !== generation) return
      set({ status: 'active' })
    } catch (error) { if (startGeneration === generation) await stop(failCode(error)) }
  }
  const onResponse = (response: BrowserResponse): void => {
    if (response.type === 'error' && response.id === '*') { set({ connected: false }); void stop(response.code); return }
    if (response.type !== 'event') return
    const event = response.event
    if (event.type === 'error' && state.status !== 'idle') { void stop(event.code === 'audioBufferOverflow' ? 'slowAudio' : event.code); return }
    if (event.type === 'sessionStopped' && event.sessionId === sessionId) { void stop(); return }
    if (event.type !== 'caption' || event.sessionId !== sessionId || event.streamEpoch !== state.epoch || typeof event.videoStartedAtMs !== 'number') return
    const previous = state.captions.find(caption => caption.segmentId === event.segment.segmentId)
    if (previous && previous.revision >= event.segment.revision) return
    // Show arriving sentences even when recognition or translation trails the video's timeline.
    set({ captions: [{ ...event.segment, videoStartedAtMs: event.videoStartedAtMs, videoEndedAtMs: event.videoEndedAtMs }] })
  }
  const unsubscribe = dependencies.bridge.subscribe(onResponse)
  // Sent at construction, before any connect attempt: it is the only line that proves the loaded
  // extension is the instrumented build, and it has to survive a desktop that is not up yet.
  debug('ext.build', { marker: DEBUG_BUILD_MARKER, builtAt: new Date().toISOString(), version: manifestVersion() })
  /**
   * The desktop owns the caption-service gate and never pushes it, so an open panel re-reads the
   * summary on a timer. A refresh only replaces what the desktop already owns, and only while
   * connected: a missed or rejected refresh leaves the current state untouched, because ending a live
   * session over a transient miss would cost the user their captions. The pipe-level disconnect
   * delivered through the bridge subscription is the only thing that stops a running session.
   */
  const refreshSummary = async (): Promise<void> => {
    if (!state.connected || refreshingSummary) return
    refreshingSummary = true
    try {
      const summary = readSummary(await dependencies.bridge.request({ type: 'hello' }))
      if (!summary) return
      set({ summary, captionServiceActive: summary.captionServiceActive, config: mergeDesktopConfig(state.config, summary.config) })
    } catch { /* A hello that times out or loses a race with a disconnect says nothing about the session. */ }
    finally { refreshingSummary = false }
  }
  const scheduleSummaryRefresh = (): void => {
    if (gateTimer !== null) clearInterval(gateTimer)
    gateTimer = setInterval(() => { void refreshSummary() }, GATE_REFRESH_MS)
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async init() {
      try {
        const summary = readSummary(await dependencies.bridge.request({ type: 'hello' }))
        if (!summary) throw new BrowserFailure('updateRequired')
        set({ summary, connected: true, captionServiceActive: summary.captionServiceActive, config: mergeDesktopConfig(state.config, summary.config), error: summary.browserAudio ? undefined : 'updateRequired' })
      } catch (error) { set({ connected: false, error: failCode(error) }) }
      scheduleSummaryRefresh()
    },
    async openRuntimeSettings() {
      await dependencies.bridge.request({ type: 'runtimeSettings', component: state.error === 'llamaUnavailable' ? 'llama' : 'engine' })
    },
    togglePanel() { set({ panelOpen: !state.panelOpen }) },
    closePanel() { set({ panelOpen: false }) },
    chooseVideo(index: number) { if (state.status === 'idle') { explicitVideo = state.videos[index] ?? null; bind(explicitVideo) } },
    updateVideos(videos: HTMLVideoElement[]) {
      set({ videos })
      if (state.status === 'idle' && videos.length > 1 && explicitVideo !== state.selectedVideo) { bind(null); return }
      if (!state.selectedVideo) { if (videos.length === 1) bind(videos[0]); return }
      if (!videos.includes(state.selectedVideo)) {
        explicitVideo = null
        if (videos.length === 1) { bind(videos[0]); if (endingTimer) { clearTimeout(endingTimer); endingTimer = null }; reset() }
        else if (videos.length > 1) { bind(null); if (state.status !== 'idle') void stop() }
        else if (state.status !== 'idle') { fence(); endingTimer ??= setTimeout(() => { endingTimer = null; if (!state.videos.length) void stop() }, 1000) }
        else bind(null)
      }
    },
    timelineChanged: reset,
    pressStart() {
      if (state.status !== 'idle' || !state.selectedVideo) return
      debug('ext.pressStart', { source: captionAudioSource(state.config) })
      if (!videoCleanup) bind(state.selectedVideo)
      // getDisplayMedia must run in the original onPress stack, before any await or desktop request.
      // A system capture needs neither the picker nor a gesture: the desktop owns the capture.
      let capturePromise: Promise<MediaStream> | null = null
      if (captionAudioSource(state.config) === 'tab') {
        try { capturePromise = (dependencies.getDisplayMedia ?? (options => navigator.mediaDevices.getDisplayMedia(options)))(CAPTURE_OPTIONS) }
        catch (error) { set({ error: failCode(error) }); return }
      }
      set({ status: 'starting', error: undefined })
      void start(capturePromise, ++generation)
    },
    stop,
    async destroy() { if (gateTimer !== null) { clearInterval(gateTimer); gateTimer = null } await stop(); unsubscribe(); dependencies.bridge.close(); listeners.clear() },
  }
}
export type ExtensionStore = ReturnType<typeof createExtensionStore>
