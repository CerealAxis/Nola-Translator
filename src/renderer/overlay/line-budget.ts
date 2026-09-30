export type CaptionLineRequest = {
  /** Whether the track currently has text; hidden tracks get no height at all. */
  visible: boolean
  fontSize: number
  lineHeight: number
}

/**
 * Split the height the stage can spare between the tracks.
 *
 * With both tracks visible the stage is split in half, one half per track.
 * With only one track visible that track claims the whole stage. Each visible
 * track fills its own slice. A track whose first line does not fit its slice
 * gets nothing rather than overflowing, because the stage clips its overflow
 * and the tracks refuse to shrink — an over-allocated track would push the next
 * one out of sight entirely.
 */
export function allocateCaptionLines(contentHeight: number, requests: CaptionLineRequest[], gap = 0): number[] {
  const visibleCount = requests.filter((request) => request.visible).length
  if (visibleCount === 0) return requests.map(() => 0)
  const lineHeights = requests.map((request) => request.fontSize * request.lineHeight)
  const share = (visibleCount === 1)
    ? contentHeight
    : (contentHeight - gap * (visibleCount - 1)) / 2
  // A zero or negative line height is reachable from a hand-edited settings file, which is loaded as
  // a raw spread with no numeric validation. It would make the fill loop below never terminate.
  const result = requests.map((request, index) =>
    request.visible && lineHeights[index] > 0 && lineHeights[index] <= share ? 1 : 0)

  // Each visible track lives in its own slice of the stage; once a track fills its slice we move on.
  for (let index = 0; index < requests.length; index += 1) {
    if (result[index] === 0) continue
    let used = lineHeights[index]
    while (used + lineHeights[index] <= share) {
      result[index] += 1
      used += lineHeights[index]
    }
  }

  // A track can still miss its own slice while the stage as a whole has room to spare, and halving
  // punishes the taller line first — which would drop the source and keep only the translation, or
  // blank the overlay outright. Hand the leftover height to those tracks in order, so the source wins
  // every such spill and something stays on screen.
  const visible = requests.map((request, index) => (request.visible ? index : -1)).filter((index) => index >= 0)
  const occupied = (): number => {
    const filled = visible.filter((index) => result[index] > 0)
    const lines = filled.reduce((total, index) => total + result[index] * lineHeights[index], 0)
    return filled.length > 1 ? lines + gap * (filled.length - 1) : lines
  }
  for (const index of visible) {
    if (result[index] !== 0 || lineHeights[index] <= 0) continue
    result[index] = 1
    if (occupied() > contentHeight) result[index] = 0
  }
  return result
}
