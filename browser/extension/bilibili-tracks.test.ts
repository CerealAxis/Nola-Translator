import { expect, it, vi } from 'vitest'
import { installSiteTracks } from './site-tracks-main'
import { TRACK_REQUEST, TRACK_RESPONSE } from './site-tracks'

it('resolves an episode without hydrated state and treats an empty successful subtitle list as no tracks', async () => {
  vi.stubGlobal('location', new URL('https://www.bilibili.com/bangumi/play/ep123'))
  const fetcher = vi.fn(async (input: URL | string) => {
    const url = String(input)
    return { ok: true, json: async () => url.includes('/season?') ? { code: 0, result: { episodes: [{ id: 123, aid: 55, cid: 99 }] } } : { code: 0, data: { subtitle: { subtitles: [] } } }, arrayBuffer: async () => new Uint8Array([10, 0]).buffer } as Response
  })
  vi.stubGlobal('fetch', fetcher)
  try {
    installSiteTracks()
    const result = new Promise(resolve => {
      const nonce = crypto.randomUUID()
      const listener = (event: Event) => { const message = JSON.parse((event as CustomEvent<string>).detail); if (message.nonce === nonce) { document.removeEventListener(TRACK_RESPONSE, listener); resolve(message.value) } }
      document.addEventListener(TRACK_RESPONSE, listener)
      document.dispatchEvent(new CustomEvent(TRACK_REQUEST, { detail: JSON.stringify({ nonce }) }))
    })
    expect(await result).toEqual([])
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('oid=99&pid=55&type=1'))).toBe(true)
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/nav'))).toBe(false)
  } finally { vi.unstubAllGlobals() }
})
