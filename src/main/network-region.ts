import { net } from 'electron'

const REGION_URL = 'https://www.cloudflare.com/cdn-cgi/trace'
const REGION_TTL_MS = 10 * 60_000
const REGION_FAILURE_TTL_MS = 30_000
let regionCache: { isMainlandChina: boolean; expiresAt: number } | null = null
let regionRequest: Promise<boolean> | null = null

/** Uses the network's public egress region to decide whether China-only download routes apply. */
export async function isMainlandChina(): Promise<boolean> {
  if (regionCache && regionCache.expiresAt > Date.now()) return regionCache.isMainlandChina
  if (regionRequest) return regionRequest

  regionRequest = (async () => {
    try {
      const response = await net.fetch(REGION_URL, { signal: AbortSignal.timeout(2500) })
      if (!response.ok) {
        regionCache = { isMainlandChina: false, expiresAt: Date.now() + REGION_FAILURE_TTL_MS }
        return false
      }
      const trace = await response.text()
      const isChina = /^loc=CN$/m.test(trace)
      regionCache = { isMainlandChina: isChina, expiresAt: Date.now() + REGION_TTL_MS }
      return isChina
    } catch {
      regionCache = { isMainlandChina: false, expiresAt: Date.now() + REGION_FAILURE_TTL_MS }
      return false
    } finally {
      regionRequest = null
    }
  })()
  return regionRequest
}

/** The Hugging Face setting has one automatic route: mirror in mainland China, official elsewhere. */
export async function resolveModelNetwork<T extends { useHuggingFaceMirror?: boolean }>(network: T): Promise<T> {
  if (!network.useHuggingFaceMirror || await isMainlandChina()) return network
  return { ...network, useHuggingFaceMirror: false }
}
