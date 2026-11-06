import type { GlossaryHit, GlossaryMatch } from '../../src/shared/glossary'

export function glossaryChunks(text: string, hits: readonly GlossaryHit[], limit = 3500): string[] {
  const chunks: string[] = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + limit)
    const crossing = hits.find(hit => hit.start < end && hit.end > end)
    if (crossing) end = crossing.start
    if (end <= start) throw new Error('glossaryBudgetExceeded')
    chunks.push(text.slice(start, end)); start = end
  }
  return chunks
}

export function glossaryChunkMatch(match: GlossaryMatch, start: number, end: number): GlossaryMatch {
  // Retain full-text boundaries so cutting a longer word cannot activate a new term.
  const hits = match.hits.filter(hit => hit.start >= start && hit.end <= end).map(hit => ({ ...hit, start: hit.start - start, end: hit.end - start }))
  const terms = [...new Map(hits.map(hit => [JSON.stringify(hit.term), hit.term])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, term]) => term)
  return { hits, terms, signature: terms.length ? JSON.stringify(terms) : '' }
}

export function protectGlossary(text: string, match: GlossaryMatch): { text: string; restore: (translated: string) => string } {
  let prefix: string
  do { prefix = `NOLATERM${crypto.randomUUID().replaceAll('-', '')}X` } while (text.includes(prefix))
  const replacements: Array<{ token: string; value: string }> = []
  let protectedText = '', start = 0
  for (const hit of match.hits) {
    if (hit.start < start || hit.end > text.length || text.slice(hit.start, hit.end) !== hit.actual) throw new Error('glossaryInvalidMatch')
    const token = `${prefix}${replacements.length}X`
    protectedText += text.slice(start, hit.start) + token
    replacements.push({ token, value: hit.term.mode === 'keep' ? hit.actual : hit.term.target })
    start = hit.end
  }
  protectedText += text.slice(start)
  if (protectedText.length > 16000) throw new Error('glossaryBudgetExceeded')
  return { text: protectedText, restore(translated) {
    for (const replacement of replacements) {
      if (translated.split(replacement.token).length !== 2) throw new Error('glossaryPlaceholderFailed')
      translated = translated.replace(replacement.token, replacement.value)
    }
    if (translated.includes(prefix)) throw new Error('glossaryPlaceholderFailed')
    return translated
  } }
}
