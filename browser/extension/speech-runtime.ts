import { z } from 'zod'
import { getProvider, type ProviderConnection } from './providers'
import { loadPreferences, type Preferences } from './preferences'
import { buildTranslationPrompt, scheduleProviderTranslation } from './provider-runtime'
import { ProviderError, safeProviderError, translateWith } from './provider-execution'
import { encodeBase64 } from './native-provider'
import { pcmWav, transcribeWith } from './provider-speech'
import { openAliyunSpeech, type SpeechSocket } from './speech-socket'
import { BROWSER_HOST_NAME, BROWSER_PROTOCOL_VERSION, type BrowserResponse } from '../../src/shared/browser'
import { extensionGlossary, hasApplicableGlossary, recoverExtensionConfiguration } from './glossary-store'
import { resolveGlossaryTerms } from '../../src/shared/glossary-match'

const message = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), sourceLanguage: z.string().max(32), targetLanguage: z.string().max(32), capability: z.enum(['asr', 's2s']) }).strict(),
  z.object({ type: z.literal('audio'), audio: z.string().max(128000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  z.object({ type: z.literal('finish') }).strict(),
  z.object({ type: z.literal('stop') }).strict(),
])

async function nativeStream(provider: ProviderConnection, source: string, signal: AbortSignal, emit: (event: Record<string, unknown>) => void): Promise<SpeechSocket> {
  signal.throwIfAborted()
  const port = chrome.runtime.connectNative(BROWSER_HOST_NAME)
  const streamId = crypto.randomUUID()
  let readyResolve: () => void, readyReject: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  let closed = false
  const close = () => { if (closed) return; closed = true; readyReject(new ProviderError('providerDisconnected')); clearTimeout(timeout); port.disconnect(); signal.removeEventListener('abort', close); for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new ProviderError('providerDisconnected')) }; pending.clear() }
  const request = (payload: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new ProviderError('providerTimeout')); close() }, 12000)
    pending.set(id, { resolve, reject, timer }); port.postMessage({ ...payload, id })
  })
  const timeout = setTimeout(() => { readyReject(new ProviderError('providerTimeout')); close() }, 30000)
  port.onMessage.addListener(raw => {
    const value = raw as BrowserResponse
    if (value.type === 'capabilityEvent' && value.id === streamId && value.event.type === 'asr') emit(value.event.data)
    else if (value.type === 'result' && value.id === 'hello') port.postMessage({ type: 'streamStart', id: streamId, sourceLanguage: source, ...(provider.model ? { model: provider.model } : {}) })
    else if (value.type === 'result' && value.id === streamId) { clearTimeout(timeout); readyResolve() }
    else if (value.type === 'result' || value.type === 'error') {
      const job = pending.get(value.id)
      if (job) { clearTimeout(job.timer); pending.delete(value.id); if (value.type === 'error') job.reject(new ProviderError(value.code)); else job.resolve() }
      else if (value.type === 'error') { readyReject(new ProviderError(value.code)); emit({ type: 'error', code: value.code }); close() }
    }
  })
  port.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (!closed) { readyReject(new ProviderError('providerDisconnected')); emit({ type: 'error', code: 'providerDisconnected' }); close() } })
  signal.addEventListener('abort', close, { once: true })
  port.postMessage({ type: 'hello', id: 'hello', protocolVersion: BROWSER_PROTOCOL_VERSION })
  await ready
  return { append: audio => request({ type: 'streamAudio', streamId, pcmBase64: audio, sampleRate: 16000 }),
    async finish() { try { await request({ type: 'streamFinish', streamId }) } finally { close() } }, close }
}

export function setupSpeechRuntime(): void {
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'nola-speech') return
    const url = port.sender?.url
    if (port.sender?.tab?.id === undefined || port.sender.frameId !== 0 || !url || !/^https?:\/\//.test(url)) { port.disconnect(); return }
    const controller = new AbortController()
    let stream: SpeechSocket | undefined, started = false, ended = false
    let disposeGlossary = () => {}
    let queue = Promise.resolve(), queued = 0, revision = 0, samples: number[] = [], silent = 0
    let recognition = Promise.resolve(), pendingRecognition = 0
    const reply = (value: unknown) => { if (!ended) { try { port.postMessage(value) } catch { /* A closed page owns no output. */ } } }
    const close = () => { ended = true; controller.abort(); stream?.close(); samples = []; disposeGlossary() }
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; close() })
    let source = 'auto', target = 'en', capability: 'asr' | 's2s' = 'asr', provider: ProviderConnection, mtProvider: ProviderConnection
    let sentMs = 0, segmentStartMs = 0, finalMs = 0
    let preferences: Preferences
    disposeGlossary = extensionGlossary.onChanged(() => {
      if (!started || ended || capability !== 's2s') return
      void extensionGlossary.snapshot().then(document => {
        if (!ended && hasApplicableGlossary(document, target, url)) { reply({ type: 'error', code: 'browserGlossaryModeUnsupported' }); close() }
      }).catch(() => { if (!ended) { reply({ type: 'error', code: 'providerRequestFailed' }); close() } })
    })
    const itemTimes = new Map<string, { start: number; end?: number }>()
    const sourceLinks = new Map<string, string>()
    const items = new Map<string, string>()
    let translations = Promise.resolve()
    const throttled = new Set(['providerRateLimit', 'browserTranslationRateLimited', 'resourceBusy'])
    const publish = (id: string, text: string, final: boolean, translated = '') => {
      const time = itemTimes.get(id) ?? { start: finalMs }
      if (!itemTimes.has(id)) itemTimes.set(id, time)
      if (final && time.end === undefined) time.end = sentMs
      reply({ type: 'caption', itemId: id, text, translation: translated, final, startedAtMs: time.start, endedAtMs: time.end, revision: ++revision })
      if (final) finalMs = Math.max(finalMs, time.end ?? time.start)
    }
    const translateFinal = (id: string, text: string) => {
      if (!text.trim()) return
      translations = translations.then(async () => {
        if (mtProvider.preset === 'nola' && preferences.subtitlePrompt.trim()) throw new ProviderError('nativePromptUnsupported')
        const request = { text, targetLanguage: target, context: { scenario: 'tool' as const, pageUrl: url }, selection: { mode: 'auto' as const } }
        const matched = resolveGlossaryTerms(await extensionGlossary.snapshot(), request)
        const terms = matched.terms
        const prompt = buildTranslationPrompt(text, source, target, preferences.subtitlePrompt, terms)
        const run = () => scheduleProviderTranslation(mtProvider, preferences, controller.signal, () => translateWith(mtProvider, text, source, target, prompt, controller.signal, matched))
        const translated = await run().catch(async error => {
          if (!throttled.has(safeProviderError(error))) throw error
          await new Promise(resolve => setTimeout(resolve, 500))
          controller.signal.throwIfAborted()
          return run()
        })
        if (resolveGlossaryTerms(await extensionGlossary.snapshot(), request).signature !== matched.signature) throw new ProviderError('glossaryChanged')
        publish(id, text, true, translated)
      }).catch(error => {
        if (ended) return
        const code = safeProviderError(error)
        reply({ type: throttled.has(code) ? 'warning' : 'error', code })
      })
    }
    const onEvent = (event: Record<string, unknown>) => {
      const type = String(event.type ?? '')
      const originalId = String(event.item_id ?? event.itemId ?? 'current')
      const id = sourceLinks.get(originalId) ?? originalId
      if (type === 'conversation.item.created' && event.item && typeof event.item === 'object') {
        const item = event.item as Record<string, unknown>
        if (item.role === 'assistant' && typeof item.id === 'string' && typeof event.previous_item_id === 'string') sourceLinks.set(item.id, event.previous_item_id)
      }
      if (typeof event.audio_start_ms === 'number') itemTimes.set(id, { start: Math.max(0, event.audio_start_ms) })
      if (typeof event.audio_end_ms === 'number') { const time = itemTimes.get(id) ?? { start: finalMs }; time.end = Math.max(time.start, event.audio_end_ms); itemTimes.set(id, time) }
      if (itemTimes.size > 128) itemTimes.delete(itemTimes.keys().next().value!)
      if (sourceLinks.size > 128) sourceLinks.delete(sourceLinks.keys().next().value!)
      if (type === 'error') { reply({ type: 'error', code: safeProviderError(new ProviderError(typeof event.code === 'string' ? event.code : 'providerRequestFailed')) }); close(); return }
      if (type.includes('input_audio_transcription') || type === 'transcript') {
        const previous = items.get(id) ?? ''
        const text = String(event.transcript ?? event.text ?? (previous + String(event.delta ?? '')))
        if (text.length > 16000) { reply({ type: 'error', code: 'providerResponseSize' }); close(); return }
        items.set(id, text)
        if (items.size > 128) items.delete(items.keys().next().value!)
        const final = type.endsWith('completed') || event.final === true || event.is_final === true
        publish(id, text, final)
        if (final && capability === 'asr') translateFinal(id, text)
      } else if (type.startsWith('response.text.') || type.startsWith('response.audio_transcript.')) {
        const key = `translation:${id}`, previous = items.get(key) ?? ''
        const text = String(event.text ?? event.transcript ?? (previous + String(event.delta ?? '')))
        items.set(key, text)
        publish(id, items.get(id) ?? '', type.endsWith('done'), text)
      } else if (type === 'response.audio.delta' && typeof event.delta === 'string') reply({ type: 'audio', audioBase64: event.delta, contentType: 'audio/pcm', sampleRate: 24000 })
    }
    const flush = () => {
      if (!samples.length) return
      if (pendingRecognition >= 3) throw new ProviderError('browserAudioBacklog')
      const pcm = new Int16Array(samples); samples = []; silent = 0
      const time = { start: segmentStartMs, end: sentMs }; segmentStartMs = sentMs
      pendingRecognition++
      recognition = recognition.then(async () => {
        controller.signal.throwIfAborted()
        const text = await transcribeWith(provider, encodeBase64(pcmWav(new Uint8Array(pcm.buffer))), source, controller.signal)
        if (ended || !text.trim()) return
        const id = crypto.randomUUID(); itemTimes.set(id, time); publish(id, text, true); translateFinal(id, text)
      }).catch(error => {
        if (!ended) { reply({ type: 'error', code: safeProviderError(error) }); close() }
      }).finally(() => { pendingRecognition-- })
    }
    port.onMessage.addListener(raw => {
      const parsed = message.safeParse(raw)
      if (!parsed.success || ended) { reply({ type: 'error', code: 'providerInvalid' }); return }
      const request = parsed.data
      if (request.type === 'stop') { close(); return }
      if (queued > 100) { reply({ type: 'error', code: 'browserAudioBacklog' }); close(); return }
      queued++
      queue = queue.then(async () => {
        if (controller.signal.aborted) return
        if (request.type === 'start') {
          if (started) throw new ProviderError('providerInvalid')
          if (!await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] })) throw new ProviderError('providerPermission')
          started = true; source = request.sourceLanguage; target = request.targetLanguage; capability = request.capability
          await recoverExtensionConfiguration()
          preferences = await loadPreferences()
          if (capability === 's2s' && hasApplicableGlossary(await extensionGlossary.snapshot(), target, url)) throw new ProviderError('browserGlossaryModeUnsupported')
          if (capability === 'asr') mtProvider = await getProvider(preferences.subtitleProvider, 'mt')
          provider = await getProvider(capability === 's2s' ? preferences.s2sProvider : preferences.asrProvider, capability)
          if (provider.preset === 'nola') stream = await nativeStream(provider, source, controller.signal, onEvent)
          else if (provider.preset === 'alibaba') stream = await openAliyunSpeech(provider, capability, source, target, onEvent, controller.signal)
          else if (capability !== 'asr') throw new ProviderError('providerCapability')
          reply({ type: 'ready' })
        } else {
          if (!started) throw new ProviderError('providerInvalid')
          if (request.type === 'audio') {
            const bytes = Uint8Array.from(atob(request.audio), c => c.charCodeAt(0))
            if (bytes.length % 2 || bytes.length > 64000) throw new ProviderError('providerInvalid')
            sentMs += bytes.length / 32
            if (stream) await stream.append(request.audio)
            else {
              const pcm = new Int16Array(bytes.buffer)
              let peak = 0
              for (const sample of pcm) peak = Math.max(peak, Math.abs(sample))
              if (!samples.length && peak < 300) { segmentStartMs = sentMs; return }
              for (const sample of pcm) samples.push(sample)
              silent = peak < 300 ? silent + pcm.length : 0
              if (samples.length >= 160000 || (samples.length >= 16000 && silent >= 9600)) flush()
            }
          } else if (request.type === 'finish') { if (stream) await stream.finish(); else { flush(); await recognition }; await translations; reply({ type: 'finished' }); close() }
        }
      }).catch(error => {
        if (!ended) reply({ type: 'error', code: safeProviderError(error) })
        close()
      }).finally(() => { queued-- })
    })
  })
}
