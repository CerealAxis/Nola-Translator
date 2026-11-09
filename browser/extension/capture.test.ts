import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_OPTIONS, capturePlayerAudio, pcmBase64, releaseTracks, validateCapture } from './capture'

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
  it('prioritizes tab audio and keeps local playback without requesting system audio', () => {
    expect(CAPTURE_OPTIONS.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })
    expect(CAPTURE_OPTIONS).toMatchObject({ audio: { suppressLocalAudioPlayback: false, restrictOwnAudio: false }, audioSelection: 'preferred', video: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude', monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude' })
    expect(pcmBase64(new Uint8Array([0, 255, 12, 34]).buffer)).toBe('AP8MIg==')
  })
})

describe('live player capture', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it.each(['Chrome/156', 'Chrome/156 Edg/156'])('uses player audio directly on %s', async userAgent => {
    const captured = Object.assign(stream(), { removeTrack: vi.fn() })
    const player = Object.assign(document.createElement('video'), { captureStream: vi.fn(() => captured) })
    const getUserMedia = vi.fn()
    const sendMessage = vi.fn()
    vi.stubGlobal('navigator', { userAgent, mediaDevices: { getUserMedia } })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    await expect(capturePlayerAudio(player)).resolves.toBe(captured)
    expect(player.captureStream).toHaveBeenCalledOnce()
    expect(captured.removeTrack).toHaveBeenCalledWith(captured.getVideoTracks()[0])
    expect(sendMessage).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('on Firefox waits for the player audio and keeps only its audio track', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Firefox/157' })
    const videoTrack = { stop: vi.fn() }
    const audioTrack = { kind: 'audio', stop: vi.fn() }
    let audio: typeof audioTrack[] = []
    const captured = Object.assign(new EventTarget(), {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => audio,
      removeTrack: vi.fn(),
    })
    const player = Object.assign(document.createElement('video'), { captureStream: () => captured })
    const pending = capturePlayerAudio(player)
    audio = [audioTrack]
    captured.dispatchEvent(Object.assign(new Event('addtrack'), { track: audioTrack }))
    await expect(pending).resolves.toBe(captured)
    expect(captured.removeTrack).toHaveBeenCalledWith(videoTrack)
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(audioTrack.stop).not.toHaveBeenCalled()
  })

  it('on Firefox reports when the player exposes no audio and releases its video track', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: 'Firefox/128' })
    const captured = Object.assign(stream('browser', 'current', 'https://example.com', false), {
      removeTrack: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getTracks: () => [],
    })
    const player = Object.assign(document.createElement('video'), { mozCaptureStream: () => captured })
    const failed = expect(capturePlayerAudio(player)).rejects.toThrow('browserCaptureUnsupported')
    await vi.advanceTimersByTimeAsync(1500)
    await failed
    expect(captured.getVideoTracks()[0].stop).toHaveBeenCalledOnce()
  })
})


it('fails ordinary insecure-page capture before requesting privileged browser audio', async () => {
  const sendMessage = vi.fn()
  vi.stubGlobal('isSecureContext', false)
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  try {
    await expect(capturePlayerAudio(document.createElement('video'))).rejects.toThrow('browserCaptureUnsupported')
    expect(sendMessage).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})
