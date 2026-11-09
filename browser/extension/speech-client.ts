import type { ExtensionBridge } from './bridge'
import { BrowserFailure } from './bridge'
import type { Preferences } from './preferences'
import { BROWSER_PROTOCOL_VERSION, type BrowserResponse, type BrowserSummary, type BrowserWireErrorCode } from '../../src/shared/browser'
import { pcmBase64 } from './capture'

export function usesSpeechRuntime(preferences?: Preferences): boolean {
  return Boolean(preferences && (preferences.pipeline === 'cascade' || (preferences.pipeline !== 's2s' && (preferences.asrProvider !== 'desktop' || preferences.subtitleProvider !== 'desktop')) || (preferences.pipeline === 's2s' && preferences.s2sProvider !== 'desktop')))
}

export function resamplePcm(buffer: ArrayBuffer, inputRate: number): ArrayBuffer {
  if (inputRate < 8000 || inputRate > 192000 || buffer.byteLength % 2) throw new BrowserFailure('invalidMessage')
  if (inputRate === 16000) return buffer
  const source = new Int16Array(buffer), output = new Int16Array(Math.floor(source.length * 16000 / inputRate))
  for (let i = 0; i < output.length; i++) {
    const from = i * inputRate / 16000, to = (i + 1) * inputRate / 16000
    let total = 0, weight = 0
    for (let sample = Math.floor(from); sample < Math.ceil(to) && sample < source.length; sample++) {
      const overlap = Math.min(to, sample + 1) - Math.max(from, sample)
      total += source[sample] * overlap; weight += overlap
    }
    output[i] = Math.round(total / Math.max(weight, 1e-9))
  }
  return output.buffer
}

export function speechError(code: unknown): BrowserWireErrorCode {
  const errors: Record<string, BrowserWireErrorCode> = {
    providerPermission: 'browserPermissionDenied', providerAuthentication: 'invalidCredential',
    providerModel: 'modelUnavailable', providerMissing: 'modelUnavailable', providerCapability: 'modelUnavailable',
    providerInvalid: 'invalidMessage', providerAddress: 'invalidConfiguration', providerTimeout: 'translationTimeout',
    providerRateLimit: 'browserTranslationRateLimited', providerResponseSize: 'lineTooLarge',
    browserTranslationRateLimited: 'browserTranslationRateLimited', resourceBusy: 'resourceBusy',
    browserAudioBacklog: 'browserAudioBacklog',
    providerDisconnected: 'browserConnectionLost', modelDisabled: 'modelDisabled', modelUnavailable: 'modelUnavailable',
    gatewayNotRunning: 'gatewayNotRunning', invalidCredential: 'invalidCredential',
    browserConnectionUnavailable: 'browserConnectionUnavailable',
    browserGlossaryModeUnsupported: 'browserGlossaryModeUnsupported',
  }
  return typeof code === 'string' ? errors[code] ?? 'translationNetworkUnavailable' : 'translationNetworkUnavailable'
}

/** Keep the existing player clock and capture lifecycle while moving provider execution off-page. */
export function createSpeechBridge(native: ExtensionBridge, preferences: () => Preferences | undefined, onWarning?: (code?: BrowserWireErrorCode) => void): ExtensionBridge {
  const listeners = new Set<(event: BrowserResponse) => void>()
  let port: ChromePort | undefined, epoch = 0, sessionId = '', videoTime = 0, playbackRate = 1, sentMs = 0, activeExternal: boolean | undefined
  let sessionPreferences: Preferences | undefined
  let ready: (() => void) | undefined, rejected: ((error: Error) => void) | undefined
  let finished: (() => void) | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const emit = (event: BrowserResponse) => { for (const listener of listeners) listener(event) }
  const unsubscribe = native.subscribe(event => { if (!(activeExternal ?? usesSpeechRuntime(preferences()))) emit(event) })
  const close = () => { const previous = port; port = undefined; previous?.disconnect(); rejected?.(new BrowserFailure('connectionLost')); rejected = undefined; ready = undefined; clearTimeout(timeout); finished?.(); finished = undefined }
  const open = async () => {
    close()
    const prefs = sessionPreferences!
    const current = chrome.runtime.connect({ name: 'nola-speech' }); port = current
    const promise = new Promise<void>((resolve, reject) => { ready = resolve; rejected = reject })
    timeout = setTimeout(() => { rejected?.(new BrowserFailure('translationTimeout')); close() }, 30000)
    current.onMessage.addListener(raw => {
      if (port !== current || !raw || typeof raw !== 'object') return
      const event = raw as Record<string, unknown>
      if (event.type === 'ready') { clearTimeout(timeout); ready?.(); ready = undefined; rejected = undefined }
      else if (event.type === 'warning') onWarning?.(speechError(event.code))
      else if (event.type === 'error') {
        const code = speechError(event.code)
        rejected?.(new BrowserFailure(code)); rejected = undefined
        emit({ type: 'error', id: '*', code, message: '' }); close()
      } else if (event.type === 'finished') { finished?.(); finished = undefined }
      else if (event.type === 'caption' && sessionId) {
        if (event.translation) onWarning?.()
        const started = Math.max(0, Number(event.startedAtMs ?? sentMs))
        const ended = typeof event.endedAtMs === 'number' ? Math.max(started, event.endedAtMs) : undefined
        emit({ type: 'event', event: { protocolVersion: 1, type: 'caption', requestId: sessionId, sessionId, streamEpoch: epoch, videoStartedAtMs: videoTime + started * playbackRate, videoEndedAtMs: ended === undefined ? undefined : videoTime + ended * playbackRate,
          segment: { segmentId: String(event.itemId ?? 'current'), revision: Number(event.revision ?? 1), startedAtMs: started, endedAtMs: ended,
            sourceText: String(event.text ?? ''), isFinal: event.final === true,
            translations: typeof event.translation === 'string' && event.translation ? [{ targetLanguage: prefs.videoLanguage, text: event.translation, state: event.final === true ? 'complete' : 'pending', provider: 'browser' }] : [] } } })
      }
    })
    current.onDisconnect.addListener(() => {
      void chrome.runtime.lastError
      if (port !== current) return
      port = undefined; clearTimeout(timeout); rejected?.(new BrowserFailure('connectionLost'))
      emit({ type: 'error', id: '*', code: 'connectionLost', message: '' })
    })
    current.postMessage({ type: 'start', capability: prefs.pipeline === 's2s' ? 's2s' : 'asr', sourceLanguage: prefs.sourceLanguage, targetLanguage: prefs.videoLanguage })
    await promise
  }
  return {
    async request(request, signal) {
      const external = request.type === 'start' || !sessionId ? usesSpeechRuntime(preferences()) : activeExternal
      if (!external) {
        const value = await native.request(request, signal)
        if (request.type === 'start' && value && 'sessionId' in value) { sessionId = value.sessionId; activeExternal = false }
        if (request.type === 'stop') { sessionId = ''; activeExternal = undefined; sessionPreferences = undefined }
        return value
      }
      signal?.throwIfAborted()
      if (request.type === 'hello') return { protocolVersion: BROWSER_PROTOCOL_VERSION, realtimeTranslation: true, extensionCompatible: true, uiLanguage: preferences()!.uiLanguage,
        sourceLanguage: preferences()!.sourceLanguage, targetLanguage: preferences()!.videoLanguage, devices: [], browserAudio: true, captionServiceActive: true,
        config: { appearance: { showSource: true, showTranslation: true, colorScheme: 'dark', fontFamily: 'Segoe UI Variable', sourceFontSize: 16, translationFontSize: 16, lineHeight: 1.3, sourceColor: '#F7F7F7', translationColor: '#D7DEE8', backgroundColor: '#0D0E10', backgroundOpacity: 0.85, bottomOffset: 5 }, audioSource: 'tab', sourceLanguage: preferences()!.sourceLanguage, targetLanguage: preferences()!.videoLanguage } } as BrowserSummary
      if (request.type === 'debug') return undefined
      if (request.type === 'start') { sessionPreferences = structuredClone(preferences()!); activeExternal = true; sessionId = crypto.randomUUID(); epoch = request.epoch; videoTime = request.videoTimeMs; playbackRate = request.playbackRate; sentMs = 0; const abort = () => close(); signal?.addEventListener('abort', abort, { once: true });
        try { await open(); return { sessionId } } catch (error) { close(); sessionId = ''; activeExternal = undefined; sessionPreferences = undefined; throw error } finally { signal?.removeEventListener('abort', abort) } }
      if (request.type === 'stop') { close(); sessionId = ''; activeExternal = undefined; sessionPreferences = undefined; return undefined }
      if (request.type === 'pause') return undefined
      if (request.type === 'reset') { const changed = epoch !== request.epoch; epoch = request.epoch; videoTime = request.videoTimeMs; playbackRate = request.playbackRate; if (changed) { sentMs = 0; await open() } return undefined }
      if (request.type === 'audio') {
        if (request.epoch !== epoch) return undefined
        const bytes = Uint8Array.from(atob(request.pcmBase64), character => character.charCodeAt(0))
        sentMs += bytes.length / 2 / request.sampleRate * 1000
        port?.postMessage({ type: 'audio', audio: pcmBase64(resamplePcm(bytes.buffer, request.sampleRate)) })
        return undefined
      }
      if (request.type === 'finish') {
        if (port) await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { finished = undefined; reject(new BrowserFailure('translationTimeout')); close() }, 30000)
          finished = () => { clearTimeout(timer); resolve() }; port!.postMessage({ type: 'finish' })
        })
        return undefined
      }
      throw new BrowserFailure('invalidMessage')
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    close() { close(); unsubscribe(); native.close(); listeners.clear() },
  }
}
