import { buffer } from 'node:stream/consumers'
import { audio, xml } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, voice, text, option, signal } = context
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  signal.throwIfAborted()
  const edge = new MsEdgeTTS({ connectionTimeoutMs: 10_000, synthesisTimeoutMs: 20_000 })
  const close = () => edge.close()
  signal.addEventListener('abort', close, { once: true })
  try {
    await edge.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    signal.throwIfAborted()
    const controls = request.controls
    const { audioStream } = edge.toStream(xml(text), {
      rate: controls?.speed === undefined ? option('rate') : controls.speed,
      volume: controls?.volume === undefined ? option('volume') : controls.volume,
      pitch: controls?.pitch === undefined ? option('pitch') : `${(2 ** (controls.pitch / 12) - 1) * 100}%`,
    })
    return audio(await buffer(audioStream), 'audio/mpeg')
  } finally { signal.removeEventListener('abort', close); close() }
}
