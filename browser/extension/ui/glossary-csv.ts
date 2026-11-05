import type { Preferences } from '../preferences'
type Term = Preferences['glossary'][number]
export function glossaryCsv(terms: Term[]): string {
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"'
  return '\uFEFF' + [['source', 'target', 'sites'], ...terms.map(term => [term.source, term.target, term.sites])].map(row => row.map(quote).join(',')).join('\r\n')
}
export function parseGlossaryCsv(text: string): Term[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else if (quoted || !field) quoted = !quoted
      else throw new Error('invalidConfig')
    } else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''
      if (char === '\r' && text[i + 1] === '\n') i++
    } else field += char
  }
  if (quoted) throw new Error('invalidConfig')
  row.push(field); if (row.some(Boolean)) rows.push(row)
  const header = rows.shift()?.map(cell => cell.trim().toLowerCase())
  const source = header?.indexOf('source') ?? -1; const target = header?.indexOf('target') ?? -1; const sites = header?.indexOf('sites') ?? -1
  if (source < 0 || target < 0 || rows.length > 20000) throw new Error('invalidConfig')
  return rows.map(row => ({ source: row[source]?.trim() ?? '', target: row[target]?.trim() ?? '', sites: sites < 0 ? '' : row[sites]?.trim() ?? '' })).filter(term => term.source && term.target)
}
