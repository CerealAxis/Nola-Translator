import { afterEach, expect, it, vi } from 'vitest'
import { glossaryChunkMatch, glossaryChunks, protectGlossary } from './glossary-translation'
import { translateWith } from './provider-execution'
import { createProvider } from './providers'
import type { GlossaryMatch } from '../../src/shared/glossary'
import { resolveGlossaryTerms } from '../../src/shared/glossary-match'
import { migrateLegacyGlossary } from './glossary-store'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const match: GlossaryMatch = { signature: 'terms', terms: [{ source: 'Nola', target: '', caseSensitive: false, mode: 'keep' }], hits: [{ entryId: 'e', libraryId: 'l', start: 6, end: 10, actual: 'NoLa', term: { source: 'NoLa', target: '', caseSensitive: false, mode: 'keep' } }] }
it('preserves the exact source casing of keep terms and rejects missing or duplicated markers', () => {
  const protectedText = protectGlossary('Hello NoLa!', match)
  expect(protectedText.text).not.toContain('NoLa')
  expect(protectedText.restore(protectedText.text)).toBe('Hello NoLa!')
  expect(() => protectedText.restore('Hello translated name!')).toThrow('glossaryPlaceholderFailed')
  expect(() => protectedText.restore(protectedText.text + protectedText.text)).toThrow('glossaryPlaceholderFailed')
})
it('keeps a matched term together when a translation chunk boundary crosses it', () => {
  const chunks = glossaryChunks('Hello NoLa!', match.hits, 8)
  expect(chunks).toEqual(['Hello ', 'NoLa!'])
  expect(chunks.join('')).toBe('Hello NoLa!')
})
it('keeps the original match decision across chunk boundaries and adjusts existing hit offsets', () => {
  const document = migrateLegacyGlossary([{ source: 'cat', target: '猫', sites: '' }], 'Terms')
  const text = 'x'.repeat(3500) + 'cat'
  const request = { text, targetLanguage: 'zh', context: { scenario: 'tool' as const }, selection: { mode: 'auto' as const } }
  const matched = resolveGlossaryTerms(document, request)
  expect(matched.terms).toEqual([])
  expect(resolveGlossaryTerms(document, { ...request, text: text.slice(3500) }).terms).toHaveLength(1)
  expect(glossaryChunkMatch(matched, 3500, 3503).terms).toEqual([])
  const chunk = glossaryChunkMatch(match, 6, 11)
  expect(chunk.hits[0]).toMatchObject({ start: 0, end: 4, actual: 'NoLa' })
  const protectedText = protectGlossary('NoLa!', chunk)
  expect(protectedText.restore(protectedText.text)).toBe('NoLa!')
})
it('runs the free MT adapter on protected text and restores only verified placeholders', async () => {
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true) } })
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify([[[new URL(url).searchParams.get('q')]]])))
  vi.stubGlobal('fetch', fetcher)
  expect(await translateWith(createProvider('google-translate'), 'Hello NoLa!', 'en', 'zh', '', new AbortController().signal, match)).toBe('Hello NoLa!')
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('q')).not.toContain('NoLa')
})
