export class SubtitleHoverPause {
  private hovered: HTMLVideoElement | null = null
  private video: HTMLVideoElement | null = null
  private expectedPause = false
  private played = () => this.clear()
  private paused = () => { if (this.expectedPause) this.expectedPause = false; else this.clear() }
  private userIntent = (event: KeyboardEvent) => { if ([' ', 'k', 'K', 'MediaPlayPause', 'MediaStop'].includes(event.key)) this.clear() }
  private clear(): void {
    this.video?.removeEventListener('play', this.played)
    this.video?.removeEventListener('pause', this.paused)
    window.removeEventListener('keydown', this.userIntent, true)
    this.video = null; this.expectedPause = false
  }
  enter(video: HTMLVideoElement | null, enabled: boolean): void {
    if (!enabled) { this.leave(); return }
    if (!video || this.hovered === video) return
    this.leave(); this.hovered = video
    if (video.paused || video.ended) return
    this.video = video; this.expectedPause = true
    video.addEventListener('play', this.played); video.addEventListener('pause', this.paused)
    window.addEventListener('keydown', this.userIntent, true)
    video.pause()
  }
  leave(): void {
    const video = this.video
    this.clear(); this.hovered = null
    if (video?.isConnected && video.paused && !video.ended) void video.play().catch(() => undefined)
  }
}
