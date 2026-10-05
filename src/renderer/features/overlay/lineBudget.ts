/**
 * Divides the caption stage height between tracks.
 *
 * Getting this wrong is invisible until runtime: captions either overflow and
 * get clipped, or one track renders while the other sits empty, and neither
 * raises an error.
 */

export type CaptionLineRequest = {
  visible: boolean
  fontSize: number
  lineHeight: number
}

/**
 * Splits the stage height the tracks can share.
 *
 * Two visible tracks split evenly; a lone visible track takes the whole stage.
 * Each fills its own share. A track that cannot fit its first line gets 0 rather
 * than overflowing: the stage clips overflow and the track refuses to shrink, so
 * over-allocating would push the next track out of the visible area entirely.
 */
export function allocateCaptionLines(contentHeight: number, requests: CaptionLineRequest[], gap = 0): number[] {
  const visibleCount = requests.filter((request) => request.visible).length
  if (visibleCount === 0) return requests.map(() => 0)
  const lineHeights = requests.map((request) => request.fontSize * request.lineHeight)
  const share = visibleCount === 1 ? contentHeight : (contentHeight - gap * (visibleCount - 1)) / 2
  // A zero or negative line height can arrive from a hand-edited settings file
  // (settings are spread as-is, with no numeric validation), so it is excluded
  // here: `allocateCaptionLines` can never hand such a track a line anyway, and
  // admitting it would make the fill loop below never advance.
  const result = requests.map((request, index) =>
    request.visible && lineHeights[index] > 0 && lineHeights[index] <= share ? 1 : 0
  )

  // Each visible track fills its own share, then the next one starts.
  for (let index = 0; index < requests.length; index += 1) {
    if (result[index] === 0) continue
    let used = lineHeights[index]
    while (used + lineHeights[index] <= share) {
      result[index] += 1
      used += lineHeights[index]
    }
  }

  // A track may end up with nothing while the stage still has room — an even
  // split charges the taller track first, which can leave the source text
  // missing entirely and show only the translation. Hand the leftover height to
  // those tracks in order so the source goes first and something is always
  // visible.
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
