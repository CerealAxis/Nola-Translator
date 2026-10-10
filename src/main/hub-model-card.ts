import type { NetworkSettings } from '../shared/settings'

/** Model card excerpts are fetched independently of search and never interpreted as HTML. */
const MAX_CARD_BYTES = 256 * 1024
const MAX_CACHE_ENTRIES = 128
const CACHE_TTL_MS = 10 * 60 * 1000
const CARD_HOST = 'huggingface.co'
const CARD_MIRROR_HOST = 'hf-mirror.com'
const cache = new Map<string, { expires: number; request: Promise<string> }>()
let activeRequests = 0
const waiting: (() => void)[] = []

export function modelCardExcerpt(markdown: string): string {
  const content = markdown
    .replace(/^\uFEFF/, '')
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
  const paragraphs = content.split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.split(/\r?\n/)
      .filter((line) => !/^\s*(?:#{1,6}\s|\||https?:\/\/|\[.*\]:|[-=]{3,}\s*$)/.test(line))
      .join(' ').replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 30 && !/^(?:Model card for|Table of contents|License:)/i.test(paragraph))
  return paragraphs.join(' ').slice(0, 600).trim()
}

export async function readHubModelCard(
  repo: unknown,
  revision: unknown,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  network?: () => NetworkSettings,
): Promise<string> {
  if (typeof repo !== 'string' || repo.length > 256
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)) {
    throw new Error('模型仓库名无效')
  }
  if (revision !== undefined && (typeof revision !== 'string' || !/^[a-f0-9]{40}$/i.test(revision))) {
    throw new Error('模型版本无效')
  }
  const ref = typeof revision === 'string' ? revision : 'main'
  const key = `${repo}@${ref}`
  const saved = cache.get(key)
  if (saved && saved.expires > Date.now()) return saved.request
  const request = (async () => {
    if (activeRequests >= 4) await new Promise<void>((resolve) => waiting.push(resolve))
    else activeRequests += 1
    const settings = network?.()
    const host = settings?.useHuggingFaceMirror ? CARD_MIRROR_HOST : CARD_HOST
    const proxy = settings?.proxyForModelDownload ? settings.proxyUrl.trim() : ''
    try {
      const read = async (): Promise<string> => {
        const response = await fetcher(`https://${host}/${repo}/raw/${ref}/README.md`, {
          signal: AbortSignal.timeout(8000),
        })
        if (response.status === 404) return ''
        if (!response.ok) throw new Error(`模型介绍获取失败 (${response.status})`)
        const reader = response.body?.getReader()
        if (!reader) return ''
        const decoder = new TextDecoder()
        let bytes = 0
        let markdown = ''
        try {
          while (bytes < MAX_CARD_BYTES) {
            const next = await reader.read()
            if (next.done) break
            const chunk = next.value.subarray(0, MAX_CARD_BYTES - bytes)
            bytes += chunk.byteLength
            markdown += decoder.decode(chunk, { stream: true })
          }
          markdown += decoder.decode()
        } finally {
          await reader.cancel()
        }
        return modelCardExcerpt(markdown)
      }
      // The card arrives over Chromium's stack, so its proxy is a session-wide setting taken for
      // the whole read — releasing it early would strand the rest of the body. Loaded on demand so
      // a caller that configures no network never pulls Electron into this module's graph.
      if (settings) {
        const { withSessionProxy } = await import('./runtime-manager')
        return await withSessionProxy(proxy, read)
      }
      return await read()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else activeRequests -= 1
    }
  })()
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, request })
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
  request.catch(() => { if (cache.get(key)?.request === request) cache.delete(key) })
  return request
}
