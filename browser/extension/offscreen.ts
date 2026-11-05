import './csp'
import { createAudioCapture, pcmBase64, releaseTracks, type AudioCapture } from './capture'

const port = chrome.runtime.connect({ name: 'nola-offscreen-audio' })
const captures = new Map<string, { closed: boolean; stream?: MediaStream; audio?: AudioCapture }>()
function close(id: string): void {
  const capture = captures.get(id)
  if (!capture) return
  captures.delete(id); capture.closed = true
  if (capture.stream) releaseTracks(capture.stream)
  void capture.audio?.close().catch(() => {})
}
const reply = (message: unknown) => { try { port.postMessage(message) } catch { for (const id of captures.keys()) close(id) } }
port.onMessage.addListener(raw => {
  if (!raw || typeof raw !== 'object') return
  const message = raw as Record<string, unknown>, id = message.id
  if (typeof id !== 'string' || id.length > 128) return
  if (message.type === 'close') { close(id); return }
  if (message.type === 'gate') {
    if (typeof message.enabled === 'boolean' && Number.isSafeInteger(message.epoch) && Number(message.epoch) >= 0) captures.get(id)?.audio?.enable(message.enabled, Number(message.epoch))
    return
  }
  if (message.type !== 'start' || typeof message.streamId !== 'string' || message.streamId.length > 4096 || captures.has(id)) return
  const capture: { closed: boolean; stream?: MediaStream; audio?: AudioCapture } = { closed: false }
  captures.set(id, capture)
  void (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const pending = navigator.mediaDevices.getUserMedia({ audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId },
      } as MediaTrackConstraints })
      void pending.then(stream => { if (capture.closed) releaseTracks(stream) }, () => {})
      const stream = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000) })])
      clearTimeout(timer)
      if (capture.closed) { releaseTracks(stream); return }
      capture.stream = stream
      if (!stream.getAudioTracks().length) throw new Error('No audio track')
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (!capture.closed) { reply({ type: 'error', id, code: 'browserCaptureCancelled' }); close(id) } }, { once: true })
      reply({ type: 'debug', id, event: 'ext.capture', data: { audioTracks: stream.getAudioTracks().length, videoTracks: 0, settings: stream.getAudioTracks()[0].getSettings(), offscreen: true } })
      // Playback belongs to the extension document so it can never re-enter the captured tab.
      const audio = await createAudioCapture(stream, chunk => reply({ type: 'chunk', id, audio: pcmBase64(chunk.buffer), sampleRate: chunk.sampleRate, epoch: chunk.epoch, sourcePeak: chunk.sourcePeak, workletPeak: chunk.workletPeak }),
        (event, data) => reply({ type: 'debug', id, event, data }), true)
      if (capture.closed) { await audio.close(); releaseTracks(stream); return }
      capture.audio = audio
      reply({ type: 'ready', id })
    } catch { reply({ type: 'error', id, code: 'browserCaptureUnsupported' }); close(id) }
    finally { clearTimeout(timer) }
  })()
})
port.onDisconnect.addListener(() => { void chrome.runtime.lastError; for (const id of captures.keys()) close(id) })
