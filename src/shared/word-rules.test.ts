import { describe, expect, it } from 'vitest'
import {
  applyWordRuleMutation,
  emptyWordRules,
  exportWordRulesCsv,
  maskSubtitle,
  parseWordRulesCsv,
  protectTranslation,
  resolveWordRules,
  wordRulesDocumentSchema,
  type WordRuleKind,
} from './word-rules'
import { maskSubtitleTracks, projectSubtitleSegments } from './subtitle-word-rules'

function rules(kind: WordRuleKind, terms: string[]) {
  const document = emptyWordRules()
  document.libraries = [
    {
      id: crypto.randomUUID(),
      kind,
      name: 'Library',
      enabled: true,
      scope: { mode: 'global' },
      entries: terms.map((text) => ({
        id: crypto.randomUUID(),
        text,
        language: '*',
        caseSensitive: false,
        enabled: true,
      })),
    },
  ]
  return document
}
describe('word rules', () => {
  it('protects matching spans, preserves original spelling and refuses missing or repeated markers', () => {
    const document = rules('preserve', ['Nola', 'cat', 'café'])
    const protectedText = protectTranslation(
      document,
      'NOLA and Nola cat concatenate cafe\u0301',
      'en',
      { scenario: 'tool' },
    )
    expect(protectedText.hits.map((hit) => hit.actual)).toEqual([
      'NOLA',
      'Nola',
      'cat',
      'cafe\u0301',
    ])
    expect(protectedText.restore(protectedText.text.replace(' and ', ' 和 '))).toBe(
      'NOLA 和 Nola cat concatenate cafe\u0301',
    )
    expect(() => protectedText.restore('Nola')).toThrow('preserveTermsChanged')
    expect(() => protectedText.restore(protectedText.text + protectedText.text)).toThrow(
      'preserveTermsChanged',
    )
  })
  it('honors source language, project scope and independent selection', () => {
    const document = rules('preserve', ['Nola']),
      projectId = crypto.randomUUID()
    document.libraries[0].scope = {
      mode: 'selected',
      targets: [{ kind: 'comic', ids: [projectId] }],
    }
    document.libraries[0].entries[0].language = 'ja'
    expect(
      resolveWordRules(document, {
        kind: 'preserve',
        text: 'Nola',
        language: 'ja',
        context: { scenario: 'comic', projectId },
      }).hits,
    ).toHaveLength(1)
    expect(
      resolveWordRules(document, {
        kind: 'preserve',
        text: 'Nola',
        language: 'en',
        context: { scenario: 'comic', projectId },
      }).hits,
    ).toHaveLength(0)
    expect(
      resolveWordRules(document, {
        kind: 'preserve',
        text: 'Nola',
        language: 'ja',
        context: { scenario: 'tool' },
      }).hits,
    ).toHaveLength(0)
    expect(
      resolveWordRules(document, {
        kind: 'preserve',
        text: 'Nola',
        language: 'ja',
        context: { scenario: 'comic', projectId },
        selection: { mode: 'off' },
      }).hits,
    ).toHaveLength(0)
  })
  it('masks complete words only on subtitle surfaces, using two literal stars', () => {
    const document = rules('mask', ['傻逼', '混蛋东西', 'bad'])
    expect(maskSubtitle(document, '你是傻逼，混蛋东西 bad badly')).toBe('你是**，** ** badly')
    expect(
      resolveWordRules(document, {
        kind: 'mask',
        text: '傻逼',
        language: 'zh',
        context: { scenario: 'comic' },
      }).hits,
    ).toEqual([])
    document.libraries[0].scope = { mode: 'selected', targets: [{ kind: 'comic', ids: '*' }] }
    expect(wordRulesDocumentSchema.safeParse(document).success).toBe(false)
  })
  it('allows a displayed subtitle to match more than the model-request glossary budget', () => {
    const terms = Array.from({ length: 300 }, (_, index) => `词语${index}项`)
    expect(maskSubtitle(rules('mask', terms), terms.join('，'))).toBe(
      terms.map(() => '**').join('，'),
    )
  })
  it('masks across stable/tail and line seams without changing original segments', () => {
    const document = rules('mask', ['傻逼'])
    const lines = [{ key: 'a', text: '傻逼来了', stableText: '傻' }]
    expect(maskSubtitleTracks(document, lines)).toMatchObject([
      { key: 'a', text: '**来了', stableText: '' },
    ])
    expect(
      maskSubtitleTracks(document, [
        { key: 'a', text: '傻' },
        { key: 'b', text: '逼来了' },
      ]).map((line) => line.text),
    ).toEqual(['**', '来了'])
    const raw = [
      {
        segmentId: '1',
        revision: 1,
        startedAtMs: 0,
        sourceText: '傻逼',
        isFinal: true,
        translations: [
          { targetLanguage: 'zh', text: '傻逼', provider: 'test', state: 'complete' as const },
        ],
      },
    ]
    const before = JSON.stringify(raw),
      projected = projectSubtitleSegments(document, raw)
    expect(projected[0].translations[0].text).toBe('**')
    expect(JSON.stringify(raw)).toBe(before)
  })
  it('keeps metadata changes out of matching revision and rejects stale or duplicate writes', () => {
    const document = rules('preserve', ['Nola']),
      library = document.libraries[0]
    const renamed = applyWordRuleMutation(document, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      command: { action: 'saveLibrary', library: { ...library, name: 'Renamed' } },
    })
    expect(renamed).toMatchObject({ revision: 1, matchingRevision: 0 })
    expect(() =>
      applyWordRuleMutation(renamed, {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { action: 'setEnabled', kind: 'preserve', enabled: false },
      }),
    ).toThrow('conflict')
    expect(() =>
      applyWordRuleMutation(document, {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        command: {
          action: 'saveTerm',
          libraryId: library.id,
          entry: { ...library.entries[0], id: crypto.randomUUID() },
        },
      }),
    ).toThrow('duplicate')
  })
  it('round trips escaped CSV and preserves entry IDs during replacement', () => {
    const document = rules('preserve', ['a,"b\nc'])
    const parsed = parseWordRulesCsv(exportWordRulesCsv(document.libraries[0].entries))
    expect(parsed.errors).toEqual([])
    expect(parsed.entries[0].text).toBe('a,"b\nc')
    const imported = applyWordRuleMutation(document, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      command: {
        action: 'importTerms',
        libraryId: document.libraries[0].id,
        entries: parsed.entries,
        policy: 'replace',
      },
    })
    expect(imported.libraries[0].entries[0].id).toBe(document.libraries[0].entries[0].id)
  })
})
