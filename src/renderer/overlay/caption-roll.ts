function splitSentences(value: string): string[] {
  const sentences: string[] = []
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    // An ASCII `.!?;` only ends a sentence when whitespace follows, so a domain, version or number stays intact.
    const endsSentence = /[。！？；]/u.test(character)
      || (/[.!?;]/u.test(character) && (next === undefined || /\s/u.test(next)))
    if (!endsSentence) continue
    const sentence = value.slice(start, index + 1).trim()
    if (sentence) sentences.push(sentence)
    start = index + 1
  }
  const tail = value.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

function singleLinePages(value: string, widthPx: number, fontSizePx: number): string[] {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return []
  const physicalCapacity = Math.max(12, Math.floor(widthPx / (Math.max(10, fontSizePx) * 0.56)))
  const pages: string[] = []
  const sentences = splitSentences(normalized)
  for (const sentence of sentences) {
    const hasWideGlyphs = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(sentence)
    const capacity = Math.min(physicalCapacity, hasWideGlyphs ? 48 : 72)
    const sentenceUnits = Array.from(sentence).reduce((sum, character) =>
      sum + (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 2 : character === ' ' ? 0.5 : 1), 0)
    const clauses = hasWideGlyphs && sentenceUnits > capacity
      ? sentence.match(/[^，,、]+(?:[，,、]|$)/gu) ?? [sentence]
      : [sentence]
    for (const clause of clauses) {
      let remaining = clause.trim()
      while (remaining) {
        let units = 0
        let end = 0
        let lastBreak = 0
        let lastBreakUnits = 0
        for (const character of remaining) {
          const width = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 2 : character === ' ' ? 0.5 : 1
          if (units + width > capacity && end > 0) break
          units += width
          end += character.length
          if (character === ' ' || /[：:]/u.test(character)) {
            lastBreak = end
            lastBreakUnits = units
          }
        }
        if (end >= remaining.length) {
          pages.push(remaining)
          break
        }
        let cut = lastBreakUnits >= capacity * 0.35 ? lastBreak : end
        const minTail = 10
        if (hasWideGlyphs && cut === end && remaining.length - cut < minTail) {
          cut = Math.max(1, remaining.length - minTail)
        } else if (!hasWideGlyphs && cut === lastBreak && remaining.length - cut < 12) {
          const earlierBreak = remaining.lastIndexOf(' ', cut - 2) + 1
          if (earlierBreak > 0 && earlierBreak >= capacity * 0.35) cut = earlierBreak
        }
        pages.push(remaining.slice(0, cut).trim())
        remaining = remaining.slice(cut).trimStart()
      }
    }
  }
  return pages
}

/** Split `value` into pages of at most `maxLines` lines, measured against `widthPx` and `fontSizePx`. */
export function rollingCaptionPages(value: string, widthPx: number, fontSizePx: number, maxLines = 1): string[] {
  const lines = singleLinePages(value, widthPx, fontSizePx)
  const visibleLines = Math.max(1, Math.floor(maxLines))
  if (visibleLines === 1 || lines.length === 0) return lines
  if (lines.length <= visibleLines) return [lines.join('\n')]
  const pages: string[] = []
  for (let start = 0; start < lines.length; start += visibleLines) {
    const chunk = lines.slice(start, start + visibleLines)
    // A short final chunk repeats the last full window rather than leaving a near-empty page.
    pages.push((chunk.length < visibleLines ? lines.slice(-visibleLines) : chunk).join('\n'))
  }
  return pages
}
