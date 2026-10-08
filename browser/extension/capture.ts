import { BrowserFailure } from './bridge'

export const CAPTURE_OPTIONS = {
  video: true,
  audio: { suppressLocalAudioPlayback: false },
  preferCurrentTab: true,
  selfBrowserSurface: 'include',
  systemAudio: 'exclude',
  surfaceSwitching: 'exclude',
  monitorTypeSurfaces: 'exclude',
} as DisplayMediaStreamOptions

export function releaseTracks(stream: MediaStream): void { for (const track of stream.getTracks()) track.stop() }
export function validateCapture(stream: MediaStream, expectedHandle: string | undefined, origin: string): void {
  const video = stream.getVideoTracks()[0]
  if (!video?.getCaptureHandle || !expectedHandle) throw new BrowserFailure('captureUnsupported')
  const handle = video.getCaptureHandle()
  if (video.getSettings().displaySurface !== 'browser' || handle?.handle !== expectedHandle || handle.origin !== origin || !stream.getAudioTracks().length) throw new BrowserFailure('wrongCapture')
}
export interface AudioChunk { buffer: ArrayBuffer; sampleRate: number; epoch: number; sourcePeak?: number; workletPeak?: number }
export interface AudioCapture { enable(enabled: boolean, epoch: number): void; close(): Promise<void> }
export async function createAudioCapture(stream: MediaStream, onChunk: (chunk: AudioChunk) => void, onDebug?: (event: string, data: Record<string, unknown>) => void): Promise<AudioCapture> {
  const report = (event: string, data: Record<string, unknown>): void => { try { onDebug?.(event, data) } catch { /* a diagnostic never fails capture */ } }
  const track = stream.getAudioTracks()[0]
  const trackRate = track.getSettings().sampleRate ?? 0
  // The context is created at the track's own rate. Left to itself Chrome picks the output device
  // rate instead, which put a resampler between the tab capture and the worklet; that path yielded
  // an exact digital zero while the element played normally.
  let context: AudioContext
  try { context = trackRate >= 8000 ? new AudioContext({ sampleRate: trackRate }) : new AudioContext() } catch { context = new AudioContext() }
  try {
    const extensionUrl = chrome.runtime.getURL('worklet.js')
    let modulePath: 'direct' | 'blob' = 'direct'
    try { await context.audioWorklet.addModule(extensionUrl) } catch {
      // Browser worklet origin policies vary; either supported module path must still pass CSP.
      const response = await fetch(extensionUrl)
      if (!response.ok) throw new BrowserFailure('captureUnsupported')
      const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }))
      modulePath = 'blob'
      try { await context.audioWorklet.addModule(url) } catch { throw new BrowserFailure('captureUnsupported') } finally { URL.revokeObjectURL(url) }
    }
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    // Tapping the source ahead of the worklet separates a dead capture track from a broken worklet
    // graph: both look identical from the chunks alone.
    const probe = context.createAnalyser()
    probe.fftSize = 2048
    const probeBuffer = new Float32Array(probe.fftSize)
    const processor = new AudioWorkletNode(context, 'nola-pcm')
    const silent = context.createGain()
    silent.gain.value = 0
    source.connect(probe); source.connect(processor); processor.connect(silent); silent.connect(context.destination)
    processor.port.onmessage = (event: MessageEvent<AudioChunk>) => {
      probe.getFloatTimeDomainData(probeBuffer)
      let peak = 0
      for (let index = 0; index < probeBuffer.length; index++) { const value = Math.abs(probeBuffer[index]); if (value > peak) peak = value }
      onChunk({ ...event.data, sourcePeak: peak })
    }
    await context.resume()
    // The context state and sample rate decide what the worklet actually emits: a suspended
    // context delivers nothing, and a resampled rate changes every downstream duration.
    report('ext.worklet', { state: context.state, sampleRate: context.sampleRate, trackSampleRate: trackRate, trackRateMatched: trackRate === context.sampleRate, modulePath })
    return {
      enable(enabled, epoch) { processor.port.postMessage({ enabled, epoch }) },
      async close() { processor.port.onmessage = null; source.disconnect(); probe.disconnect(); processor.disconnect(); silent.disconnect(); await context.close() },
    }
  } catch (error) { await context.close(); throw error }
}
export function pcmBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}
