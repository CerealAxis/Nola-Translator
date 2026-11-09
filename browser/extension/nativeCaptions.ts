export function suppressPlayerCaptions(video: HTMLVideoElement): () => void {
  const container = video.closest<HTMLElement>('#movie_player,.bpx-player-container,.bilibili-player,.watch-video,.nf-player-container') ?? video.parentElement
  const style = document.createElement('style')
  style.dataset.nolaExtension = 'live-caption-suppression'
  style.textContent = '[data-nola-live-captions] :is(.ytp-caption-window-container,.bpx-player-subtitle-panel,.bilibili-player-video-subtitle,.player-timedtext){visibility:hidden!important}'
  container?.setAttribute('data-nola-live-captions', '')
  document.documentElement.append(style)
  const hidden = new Set<TextTrack>()
  const tracks = video.textTracks
  const hide = () => {
    for (const track of tracks) {
      if (!['subtitles', 'captions'].includes(track.kind) || track.label.startsWith('Nola')) continue
      if (track.mode === 'showing') { hidden.add(track); track.mode = 'hidden' }
      else if (track.mode === 'disabled') hidden.delete(track)
    }
  }
  tracks.addEventListener('addtrack', hide)
  tracks.addEventListener('change', hide)
  hide()
  return () => {
    tracks.removeEventListener('addtrack', hide)
    tracks.removeEventListener('change', hide)
    for (const track of hidden) if (track.mode === 'hidden') track.mode = 'showing'
    container?.removeAttribute('data-nola-live-captions')
    style.remove()
  }
}

/** Temporary native-video fullscreen captions must preserve the site's existing track modes. */
export class NativeCaptionTrack {
  private track: TextTrack | null = null
  private video: HTMLVideoElement | null = null
  private previousModes: [TextTrack, TextTrackMode][] | null = null
  private clearCues(): void {
    if (this.track?.cues) for (const cue of [...this.track.cues]) this.track.removeCue(cue)
  }
  restore(): void {
    this.clearCues()
    if (this.track) this.track.mode = 'disabled'
    for (const [track, mode] of this.previousModes ?? []) track.mode = mode
    this.previousModes = null
  }
  update(video: HTMLVideoElement | null, active: boolean, cue: VTTCue | null, label: string, language: string): void {
    if (!active || !video) { this.restore(); return }
    if (this.video !== video) {
      this.restore()
      this.track = video.addTextTrack('captions', label, language)
      this.video = video
    }
    if (!this.previousModes) this.previousModes = [...video.textTracks].filter(track => track !== this.track).map(track => [track, track.mode])
    for (const [track] of this.previousModes) track.mode = 'disabled'
    if (this.track) {
      this.track.mode = 'showing'
      this.clearCues()
      if (cue) this.track.addCue(cue)
    }
  }
}
