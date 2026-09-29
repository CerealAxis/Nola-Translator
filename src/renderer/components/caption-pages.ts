/** Split a transcript into short pages, breaking at sentence boundaries and at readable line lengths. */
export function captionPages(text: string): string[] {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized) return []
  const sentences = normalized.match(/[^.!?。！？；;]+(?:[.!?。！？；;]+|$)/g) ?? [normalized]
  const pages: string[] = []
  for (const sentence of sentences) {
    let remaining = sentence.trim()
    // Chinese glyphs are about twice as wide as Latin letters, so the budget is halved.
    const limit = /[\u3400-\u9fff]/.test(remaining) ? 54 : 110
    while (remaining.length > limit) {
      const before = remaining.slice(0, limit + 1)
      const breakAt = Math.max(before.lastIndexOf(' '), before.lastIndexOf(','), before.lastIndexOf('，'))
      const cut = breakAt > limit * 0.55 ? breakAt + 1 : limit
      pages.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }
    if (remaining) pages.push(remaining)
  }
  return pages
}
