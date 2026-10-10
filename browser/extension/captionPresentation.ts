import type { Caption, CaptionConfig } from './store'

/** Effective opacity at or above which a player's control bar is treated as on screen. */
const CONTROL_OPACITY_FLOOR = 0.5

export function deepFullscreenElement(document: Document): Element | null {
  let element = document.fullscreenElement
  while (element?.shadowRoot?.fullscreenElement) element = element.shadowRoot.fullscreenElement
  return element
}
export function captionLines(caption: Caption | undefined, config: CaptionConfig): string[] {
  if (!caption) return []
  const source = config.showSource && caption.sourceText ? [caption.sourceText] : []
  if (config.targetLanguage === 'none' || !config.showTranslation) return source
  const translation = caption.translations.find(item => item.targetLanguage === config.targetLanguage && item.state !== 'failed' && item.text)?.text
  // Translation latency or failure must not hide speech that recognition already produced.
  return translation ? [...source, translation] : source
}
/** A phrase expires once, even when layout or fullscreen causes another render of the same revision. */
export class CaptionClock {
  private key = ''
  private remaining = 0
  private previousTime = 0
  private previousPaused = true
  private previousRate = 1
  update(key: string, now: number, paused: boolean, playbackRate: number): number {
    // Three seconds is how long a finished phrase stays readable after the audio stops; past that the
    // block fades away instead of sitting over a video that has gone quiet.
    if (key !== this.key) { this.key = key; this.remaining = key ? 3 : 0 }
    else if (!this.previousPaused) this.remaining = Math.max(0, this.remaining - Math.max(0, now - this.previousTime) / 1000 * this.previousRate)
    this.previousTime = now; this.previousPaused = paused; this.previousRate = playbackRate
    return this.remaining
  }
}
export function fullscreenCueBounds(caption: Caption, currentTime: number, remaining: number): [number, number] {
  // Recognition arrives behind playback; extend this live phrase to the current frame without accumulating old cues.
  return [Math.min(caption.videoStartedAtMs / 1000, currentTime), Math.max(currentTime + remaining, (caption.videoEndedAtMs ?? 0) / 1000)]
}
/**
 * Where a player keeps its own chrome, as a height measured up from the bottom edge of the frame, or
 * zero while that chrome is hidden. Players fade their control bar out instead of removing it, so a
 * bar that has faded away still reports its full height; visibility is therefore read from the
 * computed opacity and visibility of the bar and of every wrapper between it and the player, because
 * an ancestor at zero takes its whole subtree with it. Half strength is the line between the two:
 * below it the bar is a ghost the captions may sit over, above it the captions have to clear it.
 */
export function visibleControlReserve(controls: HTMLElement | null, container: HTMLElement, frame: Pick<DOMRect, 'top' | 'bottom' | 'height'>): number {
  if (!controls || frame.height <= 0) return 0
  const bar = controls.getBoundingClientRect()
  if (bar.height <= 0) return 0
  let opacity = 1
  for (let node: HTMLElement | null = controls; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return 0
    const value = Number.parseFloat(style.opacity)
    if (Number.isFinite(value)) opacity *= value
    if (node === container) break
  }
  if (opacity < CONTROL_OPACITY_FLOOR) return 0
  return Math.max(0, frame.bottom - bar.top)
}
/**
 * Bottom anchor measured down from the video top. Text grows upward within the available band,
 * while the gap above visible controls remains a fraction of the full video height.
 */
export function subtitleGeometry(videoHeight: number, preferredPosition: number, _captionHeight: number, controlReserve: number): { top: number; maxHeight: number } {
  const frame = Math.max(0, videoHeight)
  const reserve = Math.min(frame, Math.max(0, controlReserve))
  const anchor = Math.max(0, frame - reserve - Math.max(0, frame * preferredPosition))
  return { top: anchor, maxHeight: anchor }
}
