import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { emptyGlossary, glossaryEntrySchema, type GlossaryDocument, type GlossaryEntry } from '../../../src/shared/glossary'
import { resolveGlossaryTerms, glossaryPrompt, glossaryScopeMatches } from '../../../src/shared/glossary-match'
import { parseGlossaryCsv, exportGlossaryCsv, planGlossaryImport } from '../../../src/shared/glossary-csv'
import { GlossaryStore, realtimeGlossarySnapshot, assertLegacyRealtimeGlossary } from '../../../src/main/glossary-store'
import fixtures from '../../fixtures/glossary-matching.json'

const entry = (source: string, target = '译', caseSensitive = false, targetLanguage = '*'): GlossaryEntry => ({ id: randomUUID(), source, target, caseSensitive, targetLanguage, enabled: true })
const document = (entries: GlossaryEntry[]): GlossaryDocument => ({ ...emptyGlossary(), libraries: [{ id: randomUUID(), name: 'Terms', description: '', enabled: true, scope: { mode: 'global' }, entries }] })
const match = (doc: GlossaryDocument, text: string) => resolveGlossaryTerms(doc, { text, targetLanguage: 'zh', context: { scenario: 'comic' }, selection: { mode: 'auto' } })
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

it('plans CSV conflicts without dropping untouched entries or replacing existing IDs', () => {
  const original = entry('Café', '旧'), untouched = entry('Other', '其他')
  const replacement = entry('CAFE\u0301', ''), added = entry('New', '新增')
  const existing = [original, untouched], incoming = [replacement, added]
  expect(planGlossaryImport(existing, incoming, 'skip')).toEqual({ entries: [...existing, added], conflicts: 1 })
  expect(planGlossaryImport(existing, incoming, 'replace')).toEqual({ entries: [{ ...replacement, id: original.id }, untouched, added], conflicts: 1 })
  expect(original.target).toBe('旧')
  expect(planGlossaryImport(existing, [entry('Café', '特定', false, 'zh')], 'replace').conflicts).toBe(0)
})

describe('glossary matching', () => {
  it('only sends enabled desktop speech rules and excludes private project and browser entries', () => {
    const doc = document([entry('A小', 'A Short', true, 'en'), { ...entry('hidden'), enabled: false }])
    const template = doc.libraries[0]
    doc.libraries.push({ ...template, scope: { mode: 'selected', targets: [{ kind: 'website', patterns: [] }] } },
      { ...template, scope: { mode: 'selected', targets: [{ kind: 'realtime' }] }, entries: [entry('Nola', '')] })
    expect(realtimeGlossarySnapshot(doc).libraries).toEqual([
      [{ source: 'A小', target: 'A Short', caseSensitive: true, targetLanguage: 'en', mode: 'fixed' }],
      [{ source: 'Nola', target: '', caseSensitive: false, targetLanguage: '*', mode: 'keep' }],
    ])
    expect(realtimeGlossarySnapshot({ ...doc, enabled: false }).libraries).toEqual([])
  })
  it('matches terminal website path wildcards without leaking to sibling paths or hosts', () => {
    for (const pattern of ['example.com/docs/*', '*.example.com/docs/*']) {
      const scope = { mode: 'selected' as const, targets: [{ kind: 'website' as const, patterns: [pattern] }] }
      const matches = (pageUrl: string) => glossaryScopeMatches(scope, { scenario: 'tool', pageUrl })
      expect(matches('https://example.com/docs')).toBe(true)
      expect(matches('https://example.com/docs/chapter/a')).toBe(true)
      expect(matches('https://example.com/docs2/chapter')).toBe(false)
      expect(matches('https://notexample.com/docs/a')).toBe(false)
      expect(matches('https://sub.example.com/docs/a')).toBe(pattern.startsWith('*.'))
    }
  })
  it('matches the same multilingual fixtures as the Python backend', () => {
    for (const fixture of fixtures) {
      const doc = document(fixture.entries.map(([source, target, sensitive]) => entry(String(source), String(target), Boolean(sensitive))))
      expect(match(doc, fixture.text).terms.map(term => [term.source, term.target]).sort()).toEqual(fixture.expected.sort())
    }
  })
  it('handles mixed CJK, words, punctuation, NFC, case folds and actual keep text', () => {
    const doc = document([entry('A小'), entry('cat'), entry('caf'), entry('café'), entry('C++'), entry('Nola', ''), entry('STRASSE'), entry('σ')])
    const result = match(doc, 'XA小 A小到了 category cat café cafe\u0301 C++ nOLA Straße ς')
    expect(result.hits.map(hit => hit.actual)).toEqual(['A小', 'cat', 'café', 'cafe\u0301', 'C++', 'nOLA', 'Straße', 'ς'])
    expect(result.terms.find(term => term.mode === 'keep')?.source).toBe('nOLA')
    expect(result.hits.every(hit => result.hits.filter(other => hit !== other).every(other => hit.end <= other.start || other.end <= hit.start))).toBe(true)
  })
  it('tries shorter valid matches and chooses language before case specificity', () => {
    const doc = document([entry('Chort Bay'), entry('Chort'), entry('A小', '通用', true), entry('A小', '指定', false, 'zh')])
    expect(match(doc, 'Chort bayonet A小').terms.map(term => term.target)).toContain('指定')
    expect(match(doc, 'Chort bayonet').hits.map(hit => hit.actual)).toEqual(['Chort'])
  })
  it('keeps signatures unchanged by names and unrelated edits and respects empty selection', () => {
    const doc = document([entry('A小')])
    const first = match(doc, 'A小').signature
    doc.libraries[0].name = 'Rename'; doc.libraries[0].entries.push(entry('unrelated'))
    expect(match(doc, 'A小').signature).toBe(first)
    expect(resolveGlossaryTerms(doc, { text: 'A小', targetLanguage: 'zh', context: { scenario: 'comic' }, selection: { mode: 'selected', libraryIds: [] } }).terms).toEqual([])
    expect(glossaryPrompt([])).toBe('')
  })
  it('validates astral characters by code point and rejects isolated surrogates', () => {
    expect(glossaryEntrySchema.safeParse(entry('𠮷'.repeat(200))).success).toBe(true)
    expect(glossaryEntrySchema.safeParse(entry('\ud800')).success).toBe(false)
  })
})

describe('CSV and persistence', () => {
  it('never caches or overwrites a saved document that fails identity validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-glossary-')); temporary.push(directory)
    const path = join(directory, 'glossary.json')
    const duplicate = entry('Name')
    const damaged = JSON.stringify({ document: document([duplicate, { ...duplicate, source: 'Other' }]), operations: [] })
    await writeFile(path, damaged)
    const store = new GlossaryStore(path)
    await expect(store.snapshot()).rejects.toThrow('duplicate')
    await expect(store.snapshot()).rejects.toThrow('duplicate')
    await expect(store.command({ operationId: randomUUID(), expectedRevision: 0, command: { action: 'setEnabled', enabled: false } })).rejects.toThrow('duplicate')
    expect(await readFile(path, 'utf8')).toBe(damaged)
  })
  it('roundtrips multiline quoted fields, empty targets and false flags', () => {
    const entries = [entry('A,"B\nC', '', false, 'zh'), { ...entry('disabled'), enabled: false }]
    expect(parseGlossaryCsv(exportGlossaryCsv(entries)).entries.map(({ id: _id, ...value }) => value)).toEqual(entries.map(({ id: _id, ...value }) => value))
    expect(() => parseGlossaryCsv('source,target,targetLanguage,caseSensitive\n"open,,,')).toThrow('unclosedQuote')
    expect(parseGlossaryCsv('source,target,targetLanguage,caseSensitive\nNola,,cmn,false').entries[0]).toMatchObject({ targetLanguage: 'zh', target: '', caseSensitive: false, enabled: true })
  })
  it('serializes competing mutations, persists idempotency and never overwrites damaged data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-glossary-')); temporary.push(directory)
    const path = join(directory, 'glossary.json')
    const store = new GlossaryStore(path)
    const create = { operationId: randomUUID(), expectedRevision: 0, command: { action: 'saveLibrary' as const, library: { id: randomUUID(), name: 'Names', description: '', enabled: true, scope: { mode: 'global' as const } } } }
    const results = await Promise.allSettled([store.command(create), store.command({ ...create, operationId: randomUUID() })])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await new GlossaryStore(path).command(create)).revision).toBe(1)
    const saved = await store.snapshot()
    const renamed = await store.command({ operationId: randomUUID(), expectedRevision: 1, command: { action: 'saveLibrary', library: { ...create.command.library, name: 'Renamed' } } })
    expect(renamed.matchingRevision).toBe(saved.matchingRevision)
    await writeFile(path, '{broken')
    await expect(new GlossaryStore(path).snapshot()).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('{broken')
  })
})


it('gates only effective legacy speech-rule changes and preserves rejected edits on disk', async () => {
  const doc = document([entry('A小', 'A Short', true, 'en')])
  expect(() => assertLegacyRealtimeGlossary(doc, ['en'])).toThrow('realtimeGlossaryLegacyUnsupported')
  expect(() => assertLegacyRealtimeGlossary(doc, ['zh'])).not.toThrow()
  expect(() => assertLegacyRealtimeGlossary(doc, [])).not.toThrow()
  const metadata = structuredClone(doc); metadata.libraries[0].name = 'Renamed'
  expect(() => assertLegacyRealtimeGlossary(metadata, ['en'], doc)).not.toThrow()
  expect(() => assertLegacyRealtimeGlossary({ ...doc, enabled: false }, ['en'], doc)).not.toThrow()
  const changed = structuredClone(doc); changed.libraries[0].entries[0].target = 'A Tiny'
  expect(() => assertLegacyRealtimeGlossary(changed, ['en'], doc)).toThrow('realtimeGlossaryLegacyUnsupported')
  const root = await mkdtemp(join(tmpdir(), 'nola-legacy-glossary-')); temporary.push(root)
  const path = join(root, 'glossary.json')
  await writeFile(path, JSON.stringify({ document: doc, operations: [] }))
  const before = await readFile(path, 'utf8')
  const store = new GlossaryStore(path)
  const request = { operationId: randomUUID(), expectedRevision: 0, command: { action: 'saveTerm' as const,
    libraryId: doc.libraries[0].id, entry: changed.libraries[0].entries[0] } }
  await expect(store.command(request, (next, current) => assertLegacyRealtimeGlossary(next, ['en'], current))).rejects.toThrow('realtimeGlossaryLegacyUnsupported')
  expect(await readFile(path, 'utf8')).toBe(before)
  expect((await store.snapshot()).revision).toBe(0)
  const saved = await store.command(request)
  expect(saved.libraries[0].entries[0].target).toBe('A Tiny')
  await expect(store.command(request, () => { throw new Error('must replay without revalidation') })).resolves.toEqual(saved)
})
