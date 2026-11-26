import { z } from 'zod'
import { parseProviders, providerDatabase } from './providers'
import type { Preferences } from './preferences'
import { emptyGlossary, glossaryDocumentSchema, glossaryMutationSchema, glossaryTestSchema, type GlossaryBridge, type GlossaryDocument, type GlossaryMutation } from '../../src/shared/glossary'
import { applyGlossaryMutation, validateGlossaryIdentities } from '../../src/shared/glossary-mutation'
import { glossaryScopeMatches, resolveGlossaryTerms } from '../../src/shared/glossary-match'
import { normalizeLanguage } from '../../src/shared/languages'

const savedSchema = z.object({ document: glossaryDocumentSchema, operations: z.array(z.object({ id: z.string().uuid(), request: z.string() })).max(100) }).strict()
type Saved = z.infer<typeof savedSchema>
const stateKey = 'document-v1'
const revisionKey = 'glossaryRevision'
const restoreKey = 'configuration-restore-v2'
const journalSchema = z.object({ id: z.string().uuid(), preferences: z.record(z.string(), z.unknown()), revision: z.number().int().nonnegative(), matchingRevision: z.number().int().nonnegative() }).strict()

export function hasApplicableGlossary(document: GlossaryDocument, targetLanguage: string, pageUrl: string): boolean {
  return document.enabled && document.libraries.some(library => library.enabled && glossaryScopeMatches(library.scope, { scenario: 'tool', pageUrl })
    && library.entries.some(entry => entry.enabled && (entry.targetLanguage === '*' || entry.targetLanguage === normalizeLanguage(targetLanguage))))
}

async function recoverConfiguration(): Promise<void> {
  const db = await providerDatabase()
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get(restoreKey)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (raw === undefined) return
    const journal = journalSchema.parse(raw)
    await chrome.storage.local.set({ ...journal.preferences, providerRevision: journal.id, [revisionKey]: { revision: journal.revision, matchingRevision: journal.matchingRevision } })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite')
      const store = transaction.objectStore('settings')
      const request = store.get(restoreKey)
      request.onsuccess = () => { if (request.result?.id === journal.id) store.delete(restoreKey) }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}

export async function recoverExtensionConfiguration(): Promise<void> {
  await navigator.locks.request('nola-extension-configuration', recoverConfiguration)
}

export async function restoreExtensionConfiguration(input: { glossary: GlossaryDocument; preferences: Preferences; providers?: unknown }, expectedRevision: number): Promise<void> {
  const document = glossaryDocumentSchema.parse(input.glossary)
  validateGlossaryIdentities(document)
  const connections = input.providers === undefined ? undefined : parseProviders(input.providers)
  await navigator.locks.request('nola-extension-configuration', async () => {
    await recoverConfiguration()
    const db = await providerDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['settings', 'glossary'], 'readwrite')
        const settings = transaction.objectStore('settings'), glossary = transaction.objectStore('glossary')
        let cause: unknown
        const request = glossary.get(stateKey)
        request.onsuccess = () => {
          try {
            const current = savedSchema.parse(request.result)
            if (current.document.revision !== expectedRevision) throw new Error('conflict')
            const next = { ...document, revision: current.document.revision + 1, matchingRevision: current.document.matchingRevision + 1 }
            glossary.put({ document: next, operations: [] }, stateKey)
            if (connections) settings.put(connections, 'connections')
            settings.put({ id: crypto.randomUUID(), preferences: input.preferences, revision: next.revision, matchingRevision: next.matchingRevision }, restoreKey)
          } catch (error) { cause = error; transaction.abort() }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(cause ?? transaction.error)
        transaction.onabort = () => reject(cause ?? transaction.error)
      })
    } finally { db.close() }
    await recoverConfiguration()
  })
}

async function transact(mutation?: GlossaryMutation): Promise<GlossaryDocument> {
  await recoverExtensionConfiguration()
  const db = await providerDatabase()
  try {
    return await new Promise<GlossaryDocument>((resolve, reject) => {
      const transaction = db.transaction('glossary', 'readwrite')
      const store = transaction.objectStore('glossary')
      let result: GlossaryDocument
      let cause: unknown
      const request = store.get(stateKey)
      request.onsuccess = () => {
        try {
          const saved: Saved = request.result === undefined ? { document: emptyGlossary(), operations: [] } : savedSchema.parse(request.result)
          validateGlossaryIdentities(saved.document)
          if (mutation) {
            const serialized = JSON.stringify(mutation)
            const replay = saved.operations.find(operation => operation.id === mutation.operationId)
            if (replay && replay.request !== serialized) throw new Error('conflict')
            if (!replay) {
              saved.document = applyGlossaryMutation(saved.document, mutation)
              saved.operations = [...saved.operations.slice(-99), { id: mutation.operationId, request: serialized }]
            }
          }
          result = saved.document
          if (request.result === undefined || mutation) store.put(saved, stateKey)
        } catch (error) { cause = error; transaction.abort() }
      }
      transaction.oncomplete = () => resolve(result!)
      transaction.onerror = () => reject(cause ?? transaction.error)
      transaction.onabort = () => reject(cause ?? transaction.error ?? new Error('glossaryStorageFailed'))
    })
  } finally { db.close() }
}

export const extensionGlossary: GlossaryBridge = {
  snapshot: () => transact(),
  async command(input) {
    const result = await transact(glossaryMutationSchema.parse(input))
    // IndexedDB is authoritative; an interrupted notification cannot roll back a committed edit.
    await chrome.storage.local.set({ [revisionKey]: { revision: result.revision, matchingRevision: result.matchingRevision } }).catch(() => {})
    return result
  },
  async testMatch(input) { return resolveGlossaryTerms(await transact(), glossaryTestSchema.parse(input)) },
  onChanged(listener) {
    const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const value = z.object({ revision: z.number().int().nonnegative(), matchingRevision: z.number().int().nonnegative() }).safeParse(changes[revisionKey]?.newValue)
      if (area === 'local' && value.success) listener(value.data)
    }
    chrome.storage.onChanged.addListener(changed)
    return () => chrome.storage.onChanged.removeListener(changed)
  },
}
