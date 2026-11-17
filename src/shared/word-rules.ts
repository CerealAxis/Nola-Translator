import { z } from 'zod'
import {
  glossaryContextSchema,
  glossaryLanguageSchema,
  glossaryScopeSchema,
  glossarySelectionSchema,
  type GlossaryDocument,
  type GlossarySelection,
  type GlossaryTerm,
} from './glossary'
import { foldGlossarySource, normalizeGlossarySource, resolveGlossaryTerms } from './glossary-match'
import { exportGlossaryCsv, parseGlossaryCsv } from './glossary-csv'

export const wordRuleKindSchema = z.enum(['preserve', 'mask'])
export type WordRuleKind = z.infer<typeof wordRuleKindSchema>
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/u.test(value),
      'invalidText',
    )
export const wordRuleEntrySchema = z
  .object({
    id: z.string().uuid(),
    text: text(200).refine((value) => value.trim().length > 0, 'emptySource'),
    language: glossaryLanguageSchema,
    caseSensitive: z.boolean(),
    enabled: z.boolean(),
  })
  .strict()
export const wordRuleLibrarySchema = z
  .object({
    id: z.string().uuid(),
    kind: wordRuleKindSchema,
    name: text(100).refine((value) => value.trim().length > 0, 'emptyName'),
    enabled: z.boolean(),
    scope: glossaryScopeSchema,
    entries: z.array(wordRuleEntrySchema).max(20000),
  })
  .strict()
  .refine(
    (value) =>
      value.scope.mode === 'global' ||
      value.scope.targets.every((target) =>
        value.kind === 'mask'
          ? target.kind === 'realtime' || target.kind === 'game'
          : target.kind !== 'website',
      ),
    'invalidScope',
  )
export const wordRulesDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    matchingRevision: z.number().int().nonnegative(),
    preserveEnabled: z.boolean(),
    maskEnabled: z.boolean(),
    libraries: z.array(wordRuleLibrarySchema).max(1000),
  })
  .strict()
  .refine(
    (value) =>
      value.libraries.reduce((count, library) => count + library.entries.length, 0) <= 20000,
    'capReached',
  )
export type WordRuleEntry = z.infer<typeof wordRuleEntrySchema>
export type WordRuleLibrary = z.infer<typeof wordRuleLibrarySchema>
export type WordRulesDocument = z.infer<typeof wordRulesDocumentSchema>
export const wordRuleCommandSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('setEnabled'), kind: wordRuleKindSchema, enabled: z.boolean() })
    .strict(),
  z.object({ action: z.literal('saveLibrary'), library: wordRuleLibrarySchema }).strict(),
  z.object({ action: z.literal('deleteLibrary'), libraryId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('saveTerm'),
      libraryId: z.string().uuid(),
      entry: wordRuleEntrySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('deleteTerms'),
      libraryId: z.string().uuid(),
      entryIds: z.array(z.string().uuid()).max(20000),
    })
    .strict(),
  z
    .object({
      action: z.literal('setTermsEnabled'),
      libraryId: z.string().uuid(),
      entryIds: z.array(z.string().uuid()).max(20000),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('importTerms'),
      libraryId: z.string().uuid(),
      entries: z.array(wordRuleEntrySchema).max(20000),
      policy: z.enum(['skip', 'replace']),
    })
    .strict(),
])
export const wordRuleMutationSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    command: wordRuleCommandSchema,
  })
  .strict()
export type WordRuleCommand = z.infer<typeof wordRuleCommandSchema>
export type WordRuleMutation = z.infer<typeof wordRuleMutationSchema>
export const wordRuleTestSchema = z
  .object({
    kind: wordRuleKindSchema,
    text: z.string().max(64000),
    language: z.string().min(1).max(32),
    context: glossaryContextSchema,
    selection: glossarySelectionSchema.default({ mode: 'auto' }),
  })
  .strict()
export type WordRuleTestRequest = z.input<typeof wordRuleTestSchema>
export interface WordRuleMatch {
  hits: Array<{ entryId: string; libraryId: string; start: number; end: number; actual: string }>
  signature: string
}
export interface WordRulesBridge {
  snapshot(): Promise<WordRulesDocument>
  command(request: WordRuleMutation): Promise<WordRulesDocument>
  testMatch(request: WordRuleTestRequest): Promise<WordRuleMatch>
  onChanged(listener: (event: { revision: number; matchingRevision: number }) => void): () => void
}
export function emptyWordRules(): WordRulesDocument {
  return {
    schemaVersion: 1,
    revision: 0,
    matchingRevision: 0,
    preserveEnabled: true,
    maskEnabled: true,
    libraries: [],
  }
}
export function wordRuleEntryKey(entry: WordRuleEntry) {
  const normalized = normalizeGlossarySource(entry.text)
  return JSON.stringify([
    entry.language,
    entry.caseSensitive,
    entry.caseSensitive ? normalized : foldGlossarySource(normalized),
  ])
}
export function validateWordRuleIdentities(document: WordRulesDocument) {
  const ids = new Set<string>()
  for (const library of document.libraries) {
    if (ids.has(library.id)) throw new Error('duplicate')
    ids.add(library.id)
    const terms = new Set<string>()
    for (const entry of library.entries) {
      const key = wordRuleEntryKey(entry)
      if (ids.has(entry.id) || terms.has(key)) throw new Error('duplicate')
      ids.add(entry.id)
      terms.add(key)
    }
  }
}
export function applyWordRuleMutation(
  current: WordRulesDocument,
  raw: WordRuleMutation,
): WordRulesDocument {
  const request = wordRuleMutationSchema.parse(raw)
  if (current.revision !== request.expectedRevision) throw new Error('conflict')
  const next = structuredClone(current),
    command = request.command
  if (command.action === 'setEnabled')
    next[command.kind === 'mask' ? 'maskEnabled' : 'preserveEnabled'] = command.enabled
  else if (command.action === 'saveLibrary') {
    const index = next.libraries.findIndex((library) => library.id === command.library.id)
    if (index < 0) next.libraries.push(command.library)
    else next.libraries[index] = command.library
  } else {
    const library = next.libraries.find((library) => library.id === command.libraryId)
    if (!library) throw new Error('notFound')
    if (command.action === 'deleteLibrary')
      next.libraries = next.libraries.filter((item) => item.id !== library.id)
    else if (command.action === 'saveTerm') {
      const index = library.entries.findIndex((entry) => entry.id === command.entry.id)
      if (index < 0) library.entries.push(command.entry)
      else library.entries[index] = command.entry
    } else if (command.action === 'deleteTerms')
      library.entries = library.entries.filter((entry) => !command.entryIds.includes(entry.id))
    else if (command.action === 'setTermsEnabled')
      library.entries.forEach((entry) => {
        if (command.entryIds.includes(entry.id)) entry.enabled = command.enabled
      })
    else if (command.action === 'importTerms') {
      for (const incoming of command.entries) {
        const index = library.entries.findIndex(
          (entry) => wordRuleEntryKey(entry) === wordRuleEntryKey(incoming),
        )
        if (index < 0) library.entries.push(incoming)
        else if (command.policy === 'replace')
          library.entries[index] = { ...incoming, id: library.entries[index].id }
      }
    }
  }
  const matching = (value: WordRulesDocument) =>
    JSON.stringify({
      preserveEnabled: value.preserveEnabled,
      maskEnabled: value.maskEnabled,
      libraries: value.libraries.map(({ name: _name, ...library }) => library),
    })
  next.revision++
  if (matching(current) !== matching(next)) next.matchingRevision++
  wordRulesDocumentSchema.parse(next)
  validateWordRuleIdentities(next)
  return next
}
export function resolveWordRules(
  document: WordRulesDocument,
  raw: WordRuleTestRequest,
): WordRuleMatch {
  const request = wordRuleTestSchema.parse(raw)
  if (request.kind === 'mask' && !['realtime', 'game'].includes(request.context.scenario))
    return { hits: [], signature: '' }
  const glossary: GlossaryDocument = {
    schemaVersion: 1,
    revision: document.revision,
    matchingRevision: document.matchingRevision,
    enabled: request.kind === 'mask' ? document.maskEnabled : document.preserveEnabled,
    libraries: document.libraries
      .filter((library) => library.kind === request.kind)
      .map((library) => ({
        ...library,
        description: '',
        entries: library.entries.map((entry) => ({
          ...entry,
          source: entry.text,
          target: '',
          targetLanguage:
            request.kind === 'mask' && request.language === '*' ? '*' : entry.language,
        })),
      })),
  }
  const result = resolveGlossaryTerms(
    glossary,
    {
      text: request.text,
      targetLanguage: request.language,
      context: request.context,
      selection: request.selection,
    },
    request.kind !== 'mask',
  )
  return {
    hits: result.hits.map(({ entryId, libraryId, start, end, actual }) => ({
      entryId,
      libraryId,
      start,
      end,
      actual,
    })),
    signature: result.signature,
  }
}
export function protectTranslation(
  document: WordRulesDocument,
  value: string,
  language: string,
  context: z.infer<typeof glossaryContextSchema>,
  selection: GlossarySelection = { mode: 'auto' },
) {
  const match = resolveWordRules(document, {
    kind: 'preserve',
    text: value,
    language,
    context,
    selection,
  })
  const nonce = crypto.randomUUID().replaceAll('-', ''),
    prefix = `⟪NOLA_${nonce}_`
  const protectedTerms = match.hits.map((hit, index) => ({ ...hit, marker: `${prefix}${index}⟫` }))
  let masked = '',
    offset = 0
  for (const hit of protectedTerms) {
    masked += value.slice(offset, hit.start) + hit.marker
    offset = hit.end
  }
  masked += value.slice(offset)
  return {
    text: masked,
    signature: match.signature,
    hits: match.hits,
    restore(output: string) {
      let result = output
      for (const hit of protectedTerms) {
        if (result.split(hit.marker).length !== 2) throw new Error('preserveTermsChanged')
        result = result.replace(hit.marker, hit.actual)
      }
      if (result.includes(prefix)) throw new Error('preserveTermsChanged')
      return result
    },
  }
}
export function maskSubtitle(
  document: WordRulesDocument,
  value: string,
  language = '*',
  scenario: 'realtime' | 'game' = 'realtime',
  projectId?: string,
) {
  if (
    !document.maskEnabled ||
    !document.libraries.some(
      (library) =>
        library.kind === 'mask' &&
        library.enabled &&
        library.entries.some((entry) => entry.enabled),
    )
  )
    return value
  const { hits } = resolveWordRules(document, {
    kind: 'mask',
    text: value,
    language,
    context: { scenario, ...(projectId && { projectId }) },
  })
  let result = '',
    offset = 0
  for (const hit of hits) {
    result += value.slice(offset, hit.start) + '**'
    offset = hit.end
  }
  return result + value.slice(offset)
}
export function preservedGlossaryTerms(
  document: WordRulesDocument,
  value: string,
  source: string,
  context: z.infer<typeof glossaryContextSchema>,
): GlossaryTerm[] {
  return [
    ...new Set(
      resolveWordRules(document, {
        kind: 'preserve',
        text: value,
        language: source,
        context,
      }).hits.map((hit) => hit.actual),
    ),
  ].map((actual) => ({ source: actual, target: '', caseSensitive: true, mode: 'keep' }))
}
export function realtimeWordRulesSnapshot(document: WordRulesDocument) {
  return document.preserveEnabled
    ? document.libraries
        .filter(
          (library) =>
            library.kind === 'preserve' &&
            library.enabled &&
            (library.scope.mode === 'global' ||
              library.scope.targets.some((target) => target.kind === 'realtime')),
        )
        .map((library) =>
          library.entries
            .filter((entry) => entry.enabled)
            .map((entry) => ({
              source: entry.text,
              target: '',
              caseSensitive: entry.caseSensitive,
              mode: 'keep' as const,
              targetLanguage: '*',
              sourceLanguage: entry.language,
              preserve: true,
            })),
        )
    : []
}
export function parseWordRulesCsv(content: string) {
  const parsed = parseGlossaryCsv(content)
  return {
    entries: parsed.entries.map((entry) => ({
      id: entry.id,
      text: entry.source,
      language: entry.targetLanguage,
      caseSensitive: entry.caseSensitive,
      enabled: entry.enabled,
    })),
    errors: parsed.errors,
  }
}
export function exportWordRulesCsv(entries: readonly WordRuleEntry[]) {
  return exportGlossaryCsv(
    entries.map((entry) => ({
      ...entry,
      source: entry.text,
      target: '',
      targetLanguage: entry.language,
    })),
  )
}
