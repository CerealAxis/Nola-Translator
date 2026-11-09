import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installSiteTracks } from './site-tracks-main'
import { TRACK_REQUEST, TRACK_RESPONSE } from './site-tracks'

const payload = { events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Native subtitle' }] }] }
const request = (trackId?: string) => new Promise<unknown>(resolve => {
  const nonce = crypto.randomUUID()
  const listener = (event: Event) => {
    const value = JSON.parse((event as CustomEvent<string>).detail)
    if (value.nonce === nonce) { document.removeEventListener(TRACK_RESPONSE, listener); resolve(value.value) }
  }
  document.addEventListener(TRACK_RESPONSE, listener)
  document.dispatchEvent(new CustomEvent(TRACK_REQUEST, { detail: JSON.stringify({ nonce, trackId }) }))
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=current'))
  document.body.innerHTML = '<div id="movie_player"></div>'
  delete (window as Window & { nolaSiteTracksInstalled?: boolean }).nolaSiteTracksInstalled
})
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.useRealTimers(); vi.unstubAllGlobals() })

it('recovers an empty timedtext response by activating native captions and reusing their authenticated response', async () => {
  const url = 'https://www.youtube.com/api/timedtext?v=current&lang=en'
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input)
    return { ok: true, url: href, headers: new Headers({ 'content-type': 'application/json' }), clone() { return this }, text: async () => href.includes('fmt=srv3') ? '<timedtext><body><p t="1000" d="2000"><s>Native subtitle</s></p></body></timedtext>' : href.includes('pot=fresh') ? JSON.stringify(payload) : '', json: async () => { if (href.includes('pot=fresh')) return payload; throw new SyntaxError('Empty') } } as Response
  })
  vi.stubGlobal('fetch', fetcher)
  const player = document.querySelector('#movie_player')!
  const toggle = vi.fn(() => { void window.fetch(url + '&pot=fresh&fmt=srv3') })
  Object.assign(player, { getPlayerResponse: () => ({ videoDetails: { videoId: 'current' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: url, vssId: '.en', languageCode: 'en' }] } } }), getOption: () => undefined, toggleSubtitles: toggle })
  installSiteTracks()
  expect(await request()).toMatchObject([{ id: '.en' }])
  const result = request('.en')
  await vi.advanceTimersByTimeAsync(500)
  expect(await result).toEqual([{ start: 1, end: 3, text: 'Native subtitle' }])
  expect(toggle).toHaveBeenCalledOnce()
  const built = new URL(String(fetcher.mock.calls[0][0]))
  expect(built.searchParams.get('c')).toBe('WEB')
  expect(built.searchParams.get('fmt')).toBe('json3')
  vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=next'))
  setTimeout(() => Object.assign(player, { getPlayerResponse: () => ({ videoDetails: { videoId: 'next' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: url.replace('current', 'next'), vssId: '.en', languageCode: 'en' }] } } }) }), 500)
  const nextTracks = request()
  await vi.advanceTimersByTimeAsync(750)
  expect(await nextTracks).toMatchObject([{ id: '.en' }])
  toggle.mockImplementation(() => { void window.fetch(url.replace('current', 'next') + '&pot=fresh') })
  const nextCues = request('.en')
  await vi.advanceTimersByTimeAsync(500)
  expect(await nextCues).toEqual([{ start: 1, end: 3, text: 'Native subtitle' }])
  const nextUrl = new URL(String(fetcher.mock.calls.find(([input]) => String(input).includes('v=next'))![0]))
  expect(nextUrl.searchParams.has('pot')).toBe(false)
})
