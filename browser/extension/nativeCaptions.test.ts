import { describe, expect, it, vi } from 'vitest'
import { NativeCaptionTrack } from './nativeCaptions'

describe('native fullscreen captions', () => {
  it('does not create or disable text tracks while Nola is idle, then restores them on stop', () => {
    const existing = [{ mode: 'showing' }, { mode: 'hidden' }] as TextTrack[]
    const cues: TextTrackCue[] = []
    const nola = { mode: 'disabled', cues, addCue(cue: TextTrackCue) { cues.push(cue) }, removeCue(cue: TextTrackCue) { cues.splice(cues.indexOf(cue), 1) } } as unknown as TextTrack
    const video = { textTracks: existing, addTextTrack: vi.fn(() => { existing.push(nola); return nola }) } as unknown as HTMLVideoElement
    const presenter = new NativeCaptionTrack()
    presenter.update(video, false, null, 'Nola', 'en')
    expect(video.addTextTrack).not.toHaveBeenCalled()
    expect(existing.map(track => track.mode)).toEqual(['showing', 'hidden'])
    const cue = { text: 'Hello' } as VTTCue
    presenter.update(video, true, cue, 'Nola', 'en')
    expect(existing.map(track => track.mode)).toEqual(['disabled', 'disabled', 'showing'])
    expect(cues).toEqual([cue])
    presenter.update(video, false, null, 'Nola', 'en')
    expect(existing.map(track => track.mode)).toEqual(['showing', 'hidden', 'disabled'])
    expect(cues).toEqual([])
    presenter.update(video, true, cue, 'Nola', 'en')
    presenter.restore()
    expect(video.addTextTrack).toHaveBeenCalledOnce()
    expect(existing.map(track => track.mode)).toEqual(['showing', 'hidden', 'disabled'])
  })
})
