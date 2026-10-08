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
