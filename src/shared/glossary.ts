import { z } from 'zod'
import { LANGUAGE_CODES } from './languages'

const id = z.string().uuid()
const boundedText = (max: number) => z.string().refine(value => Array.from(value).length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/u.test(value), 'invalidText')
export const glossaryLanguageSchema = z.string().refine(value => value === '*' || (LANGUAGE_CODES as readonly string[]).includes(value), 'invalidLanguage')
export const glossaryScopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('global') }).strict(),
  z.object({ mode: z.literal('selected'), targets: z.array(z.union([
    z.object({ kind: z.enum(['screen', 'game', 'comic']), ids: z.union([z.literal('*'), z.array(id).min(1).max(1000)]) }).strict(),
    z.object({ kind: z.enum(['realtime', 'tool']) }).strict(),
    z.object({ kind: z.literal('website'), patterns: z.array(z.string().max(2048).refine(value => /^(\*\.)?[a-z0-9.-]+(?::\d+)?(?:\/[^?#]*)?$/i.test(value), 'invalidScope')).max(100) }).strict(),
  ])).min(1).max(100) }).strict(),
])
export const glossarySelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }).strict(), z.object({ mode: z.literal('off') }).strict(),
  z.object({ mode: z.literal('selected'), libraryIds: z.array(id).max(1000) }).strict(),
])
export const glossaryEntrySchema = z.object({
  id, source: boundedText(200).refine(value => value.trim().length > 0, 'emptySource'), target: boundedText(200),
  targetLanguage: glossaryLanguageSchema, caseSensitive: z.boolean(), enabled: z.boolean(),
}).strict()
export const glossaryLibrarySchema = z.object({
  id, name: boundedText(100).refine(value => value.trim().length > 0, 'emptyName'), description: boundedText(500),
  enabled: z.boolean(), scope: glossaryScopeSchema, entries: z.array(glossaryEntrySchema).max(20000),
}).strict()
export const glossaryDocumentSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), matchingRevision: z.number().int().nonnegative(),
  enabled: z.boolean(), libraries: z.array(glossaryLibrarySchema).max(1000),
}).strict().refine(value => value.libraries.reduce((total, library) => total + library.entries.length, 0) <= 20000, 'capReached')
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>
export type GlossaryLibrary = z.infer<typeof glossaryLibrarySchema>
export type GlossaryDocument = z.infer<typeof glossaryDocumentSchema>
export type GlossaryScope = z.infer<typeof glossaryScopeSchema>
export type GlossarySelection = z.infer<typeof glossarySelectionSchema>
export const glossaryContextSchema = z.object({
  scenario: z.enum(['screen', 'game', 'comic', 'realtime', 'tool']), projectId: id.optional(), pageUrl: z.string().url().max(4096).optional(),
}).strict()
export type GlossaryContext = z.infer<typeof glossaryContextSchema>
export const glossaryCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setEnabled'), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('saveLibrary'), library: glossaryLibrarySchema.omit({ entries: true }) }).strict(),
  z.object({ action: z.literal('deleteLibrary'), libraryId: id }).strict(),
  z.object({ action: z.literal('saveTerm'), libraryId: id, entry: glossaryEntrySchema }).strict(),
  z.object({ action: z.literal('deleteTerms'), libraryId: id, entryIds: z.array(id).max(20000) }).strict(),
  z.object({ action: z.literal('setTermsEnabled'), libraryId: id, entryIds: z.array(id).max(20000), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('importTerms'), libraryId: id, entries: z.array(glossaryEntrySchema).max(20000), mode: z.enum(['merge', 'replace']) }).strict(),
  z.object({ action: z.literal('reorderLibraries'), libraryIds: z.array(id).max(1000) }).strict(),
])
export const glossaryMutationSchema = z.object({ operationId: id, expectedRevision: z.number().int().nonnegative(), command: glossaryCommandSchema }).strict()
export type GlossaryCommand = z.infer<typeof glossaryCommandSchema>
export type GlossaryMutation = z.infer<typeof glossaryMutationSchema>
export interface GlossaryTerm { source: string; target: string; caseSensitive: boolean; mode: 'fixed' | 'keep' }
export const glossaryTermsSchema = z.array(z.object({ source: boundedText(200).refine(value => value.trim().length > 0),
  target: boundedText(200), caseSensitive: z.boolean(), mode: z.enum(['fixed', 'keep']),
}).strict().refine(value => (value.mode === 'keep') === (value.target === ''), 'invalidGlossaryTerm')).max(256)
  .refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 32768, 'glossaryBudgetExceeded')
export interface GlossaryHit { entryId: string; libraryId: string; start: number; end: number; actual: string; term: GlossaryTerm }
export interface GlossaryMatch { terms: GlossaryTerm[]; hits: GlossaryHit[]; signature: string }
export const glossaryTestSchema = z.object({ text: z.string().max(64000), targetLanguage: glossaryLanguageSchema,
  context: glossaryContextSchema, selection: glossarySelectionSchema }).strict()
export type GlossaryTestRequest = z.infer<typeof glossaryTestSchema>
export interface GlossaryBridge {
  snapshot(): Promise<GlossaryDocument>
  command(request: GlossaryMutation): Promise<GlossaryDocument>
  testMatch(request: GlossaryTestRequest): Promise<GlossaryMatch>
  onChanged(listener: (event: { revision: number; matchingRevision: number }) => void): () => void
}
export function emptyGlossary(): GlossaryDocument {
  return { schemaVersion: 1, revision: 0, matchingRevision: 0, enabled: true, libraries: [] }
}
