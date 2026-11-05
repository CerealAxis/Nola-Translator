import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as providers from './providers'
import { createTranslationCache, translationCacheKey, TRANSLATION_CACHE_TTL } from './translation-cache'

const rows = new Map<string, unknown>()
const key = (value: number) => value.toString(16).padStart(64, '0')
beforeEach(() => {
  rows.clear()
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) })
  const inRange = (key: string, range: { lower: string; upper: string }) => key >= range.lower && key <= range.upper
  vi.spyOn(providers, 'providerDatabase').mockImplementation(async () => ({
    close() {}, transaction() {
      const transaction: any = { objectStore: () => ({
        getAll(range: { lower: string; upper: string }) {
          const request: any = {}
          queueMicrotask(() => { request.result = [...rows].filter(([key]) => inRange(key, range)).map(([, value]) => structuredClone(value)); request.onsuccess() })
          return request
        },
        put(value: unknown, key: string) { rows.set(key, structuredClone(value)) },
        delete(value: string | { lower: string; upper: string }) { for (const key of rows.keys()) if (typeof value === 'string' ? key === value : inRange(key, value)) rows.delete(key) },
      }) }
      queueMicrotask(() => transaction.oncomplete?.())
      return transaction
    },
  }) as unknown as IDBDatabase)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('persists across background cache instances and clears only translation rows', async () => {
  rows.set('connections', [{ apiKey: 'private-provider-key' }])
  const first = createTranslationCache()
  await first.set(key(1), 'Translated text')
  const restarted = createTranslationCache()
  expect(await restarted.get(key(1))).toBe('Translated text')
  await restarted.clear()
  expect(await createTranslationCache().get(key(1))).toBeUndefined()
  expect(rows.get('connections')).toEqual([{ apiKey: 'private-provider-key' }])
})
it('expires entries after seven days', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  const cache = createTranslationCache()
  await cache.set(key(1), 'Old translation')
  clock.mockReturnValue(1_000_000 + TRANSLATION_CACHE_TTL)
  expect(await cache.get(key(1))).toBeUndefined()
  expect(await createTranslationCache().get(key(1))).toBeUndefined()
})
it('bounds entries and total stored text', async () => {
  const cache = createTranslationCache()
  for (let index = 0; index <= 1000; index++) await cache.set(key(index), 'text')
  expect(rows.size).toBe(1000)
  expect(await cache.get(key(0))).toBeUndefined()
  await cache.set(key(1002), 'x'.repeat(2_000_000))
  expect(rows.size).toBe(1)
})
it('keeps translation usable in memory when IndexedDB is unavailable but reports a failed explicit clear', async () => {
  vi.mocked(providers.providerDatabase).mockRejectedValue(new Error('Database unavailable'))
  const cache = createTranslationCache()
  await expect(cache.set(key(1), 'Still works')).resolves.toBeUndefined()
  expect(await cache.get(key(1))).toBe('Still works')
  await expect(cache.clear()).rejects.toThrow('Database unavailable')
})
it('hashes provider credentials and prompts instead of persisting them in a cache key', async () => {
  const provider = { ...providers.createProvider('openai'), apiKey: 'private-key', model: 'model' }
  const digest = await translationCacheKey(provider, 'en', 'zh', 'Private original text')
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  expect(digest).not.toContain('private-key')
  expect(digest).not.toContain('Private original')
  expect(await translationCacheKey({ ...provider, apiKey: 'another-key' }, 'en', 'zh', 'Private original text')).not.toBe(digest)
})
