import { providerDatabase, type ProviderConnection } from './providers'

const PREFIX = 'translation-cache-v1:'
export const TRANSLATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 1000
const MAX_CHARACTERS = 2_000_000
interface Entry { key: string; text: string; createdAt: number }
const range = () => IDBKeyRange.bound(PREFIX, PREFIX + '\uffff')

export async function translationCacheKey(provider: ProviderConnection, source: string, target: string, prompt: string): Promise<string> {
  const input = JSON.stringify([provider.id, provider.preset, provider.baseUrl, provider.model, provider.apiKey, provider.headers, provider.options, source, target, prompt])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
async function readEntries(): Promise<unknown> {
  const db = await providerDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').getAll(range())
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
async function writeEntries(write: (store: IDBObjectStore) => void): Promise<void> {
  const db = await providerDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite')
      write(transaction.objectStore('settings'))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}

export function createTranslationCache() {
  const entries = new Map<string, Entry>()
  let loaded: Promise<void> | undefined
  let pending = Promise.resolve()
  const persist = (write: (store: IDBObjectStore) => void) => {
    pending = pending.catch(() => undefined).then(() => writeEntries(write))
    return pending
  }
  const prune = () => {
    const removed: string[] = [], now = Date.now()
    for (const [key, entry] of entries) if (entry.createdAt <= now - TRANSLATION_CACHE_TTL || entry.createdAt > now) { entries.delete(key); removed.push(key) }
    let characters = Array.from(entries.values()).reduce((total, entry) => total + entry.text.length, 0)
    while (entries.size > MAX_ENTRIES || characters > MAX_CHARACTERS) {
      const first = entries.entries().next().value!
      characters -= first[1].text.length; entries.delete(first[0]); removed.push(first[0])
    }
    return removed
  }
  const remove = (keys: string[]) => { if (keys.length) void persist(store => keys.forEach(key => store.delete(PREFIX + key))).catch(() => undefined) }
  const load = () => loaded ??= readEntries().then(value => {
    if (!Array.isArray(value)) return
    const valid = value.filter((row): row is Entry => row && typeof row.key === 'string' && /^[a-f0-9]{64}$/.test(row.key) && typeof row.text === 'string' && row.text.length <= MAX_CHARACTERS && typeof row.createdAt === 'number' && Number.isFinite(row.createdAt))
    valid.sort((a, b) => a.createdAt - b.createdAt).forEach(row => entries.set(row.key, row))
    remove(prune())
  }).catch(() => undefined)
  return {
    async get(key: string): Promise<string | undefined> { await load(); remove(prune()); return entries.get(key)?.text },
    async set(key: string, text: string): Promise<void> {
      await load()
      const entry = { key, text, createdAt: Date.now() }
      entries.delete(key); entries.set(key, entry)
      const removed = prune()
      await persist(store => { if (entries.has(key)) store.put(entry, PREFIX + key); removed.forEach(key => store.delete(PREFIX + key)) }).catch(() => undefined)
    },
    async clear(): Promise<void> { await load(); entries.clear(); await persist(store => store.delete(range())) },
  }
}
