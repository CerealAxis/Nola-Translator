/** Split a growing transcript into stable, single-line chunks for the overlay. */
export function rollingCaptionPages(value: string, widthPx: number, fontSizePx: number): string[] {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return []
  const capacity = Math.max(12, Math.floor(widthPx / (Math.max(10, fontSizePx) * 0.56)))
  const pages: string[] = []
  let remaining = normalized
  while (remaining) {
    let units = 0
    let end = 0
    let lastBreak = 0
    for (const character of remaining) {
      const width = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 2 : character === ' ' ? 0.5 : 1
      if (units + width > capacity && end > 0) break
      units += width
      end += character.length
      if (character === ' ' || /[，,。.!?！？；;]/u.test(character)) lastBreak = end
    }
    if (end >= remaining.length) {
      pages.push(remaining)
      break
    }
    const cut = lastBreak >= end * 0.55 ? lastBreak : end
    pages.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trimStart()
  }
  return pages
}
