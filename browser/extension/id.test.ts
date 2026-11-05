import { expect, it, vi } from 'vitest'
import { requestId } from './id'

it('generates independent request IDs on HTTP where randomUUID is unavailable', () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  try {
    const ids = Array.from({ length: 100 }, requestId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  } finally { vi.unstubAllGlobals() }
})
