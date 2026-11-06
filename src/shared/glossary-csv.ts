import { glossaryEntrySchema, type GlossaryEntry } from './glossary'
import { glossaryEntryKey } from './glossary-match'
import { normalizeLanguage } from './languages'

export interface GlossaryCsvResult { entries: GlossaryEntry[]; errors: Array<{ line: number; reason: string }> }
const languageAliases: Record<string, string> = { all: '*', cmn: 'zh', zho: 'zh', eng: 'en', jpn: 'ja', kor: 'ko', fra: 'fr', deu: 'de', spa: 'es', por: 'pt', rus: 'ru', ita: 'it', ara: 'ar', hin: 'hi', tha: 'th', vie: 'vi', ind: 'id' }
const header = ['source', 'target', 'targetLanguage', 'caseSensitive', 'enabled']

export function planGlossaryImport(existing: readonly GlossaryEntry[], incoming: readonly GlossaryEntry[], policy: 'skip' | 'replace'): { entries: GlossaryEntry[]; conflicts: number } {
  const entries = existing.map(entry => ({ ...entry }))
  const indices = new Map(entries.map((entry, index) => [glossaryEntryKey(entry), index]))
  let conflicts = 0
  for (const entry of incoming) {
    const key = glossaryEntryKey(entry)
    const index = indices.get(key)
    if (index === undefined) {
      indices.set(key, entries.length)
      entries.push({ ...entry })
    } else {
      conflicts++
      if (policy === 'replace') entries[index] = { ...entry, id: entries[index].id }
    }
  }
  return { entries, conflicts }
}

export function parseGlossaryCsv(content: string, makeId: () => string = () => crypto.randomUUID()): GlossaryCsvResult {
  if (new TextEncoder().encode(content).length > 40 * 1024 * 1024) throw new Error('capReached')
  const rows: Array<{ line: number; fields: string[] }> = []
  let fields: string[] = [], value = '', quoted = false, closed = false, line = 1, rowLine = 1
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (i === 0 && char === '\ufeff') continue
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') { value += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else { value += char; if (char === '\n') line++ }
    } else if (char === '"') {
      if (value || closed) throw new Error(`invalidCsv:${line}`)
      quoted = true
    } else if (char === ',' || char === '\n' || char === '\r') {
      fields.push(value); value = ''; closed = false
      if (char !== ',') {
        rows.push({ line: rowLine, fields }); fields = []
        if (char === '\r' && content[i + 1] === '\n') i++
        rowLine = ++line
      }
    } else {
      if (closed) throw new Error(`invalidCsv:${line}`)
      value += char
    }
  }
  if (quoted) throw new Error(`unclosedQuote:${rowLine}`)
  if (value || fields.length || closed) rows.push({ line: rowLine, fields: [...fields, value] })
  const names = rows.shift()?.fields.map(field => field.trim().toLowerCase())
  if (!names || ![4, 5].includes(names.length) || names.some((name, index) => name !== header[index].toLowerCase())) throw new Error('invalidHeader')
  if (rows.length > 20000) throw new Error('capReached')
  const entries: GlossaryEntry[] = [], errors: GlossaryCsvResult['errors'] = [], identities = new Set<string>()
  const boolean = (raw: string) => /^(true|1|yes)$/i.test(raw) ? true : /^(false|0|no)$/i.test(raw) ? false : undefined
  for (const row of rows) {
    if (row.fields.length === 1 && !row.fields[0].trim()) continue
    if (row.fields.length !== names.length) { errors.push({ line: row.line, reason: 'missingField' }); continue }
    const [source, target, language, sensitive, enabled = 'true'] = row.fields
    const parsed = glossaryEntrySchema.safeParse({ id: makeId(), source, target, targetLanguage: languageAliases[language.trim().toLowerCase()] ?? normalizeLanguage(language),
      caseSensitive: boolean(sensitive.trim()), enabled: boolean(enabled.trim()) })
    if (!parsed.success) { errors.push({ line: row.line, reason: 'invalidEntry' }); continue }
    const key = glossaryEntryKey(parsed.data)
    if (identities.has(key)) { errors.push({ line: row.line, reason: 'duplicate' }); continue }
    identities.add(key); entries.push(parsed.data)
  }
  return { entries, errors }
}

export function exportGlossaryCsv(entries: readonly GlossaryEntry[]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  return '\ufeff' + [header.join(','), ...entries.map(entry => [entry.source, entry.target, entry.targetLanguage, String(entry.caseSensitive), String(entry.enabled)].map(escape).join(','))].join('\r\n')
}
