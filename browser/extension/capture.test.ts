import { describe, expect, it, vi } from 'vitest'
import { CAPTURE_OPTIONS, pcmBase64, releaseTracks, validateCapture } from './capture'

function stream(surface = 'browser', handle = 'current', origin = 'https://example.com', audio = true): MediaStream {
  const track = { getSettings: () => ({ displaySurface: surface }), getCaptureHandle: () => ({ handle, origin }), stop: vi.fn() }
  const sound = { stop: vi.fn() }
  return { getVideoTracks: () => [track], getAudioTracks: () => audio ? [sound] : [], getTracks: () => audio ? [track, sound] : [track] } as unknown as MediaStream
}
describe('tab capture validation', () => {
  it('accepts only the current tab handle, origin, browser surface and audio', () => {
    expect(() => validateCapture(stream(), 'current', 'https://example.com')).not.toThrow()
    for (const wrong of [stream('monitor'), stream('window'), stream('browser', 'other'), stream('browser', 'current', 'https://other.com'), stream('browser', 'current', 'https://example.com', false)]) expect(() => validateCapture(wrong, 'current', 'https://example.com')).toThrow('wrongCapture')
  })
  it('fails closed when capture verification is unavailable and releases every track', () => {
    const capture = stream()
    expect(() => validateCapture(capture, undefined, 'https://example.com')).toThrow('captureUnsupported')
    releaseTracks(capture)
    for (const track of capture.getTracks()) expect(track.stop).toHaveBeenCalledOnce()
  })
  it('keeps local playback and excludes screen, monitor and system audio', () => {
    expect(CAPTURE_OPTIONS).toMatchObject({ audio: { suppressLocalAudioPlayback: false }, video: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude', monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude' })
    expect(pcmBase64(new Uint8Array([0, 255, 12, 34]).buffer)).toBe('AP8MIg==')
  })
})
