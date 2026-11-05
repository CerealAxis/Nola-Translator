import { expect, it, vi } from 'vitest'
import { installSiteTracks } from './site-tracks-main'
import { TRACK_REQUEST, TRACK_RESPONSE, TRACK_RESTORE, TRACK_CHANGED } from './site-tracks'

it('loads the audio-language Netflix track, isolates prefetched episodes and restores only its own selection', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('location', new URL('https://www.netflix.com/watch/100'))
  const none = { trackId: 'off', isNoneTrack: true }
  const english = { trackId: 'en', bcp47: 'en' }
  const japanese = { trackId: 'ja', bcp47: 'ja' }
  let selected = none as { trackId: string; isNoneTrack?: boolean; bcp47?: string }
  const player = { getMovieId: () => 100, getAudioTrack: () => ({ bcp47: 'ja-JP' }), getTimedTextTrack: () => selected, getTimedTextTrackList: () => [none, { trackId: 'forced', isForcedNarrative: true }, { trackId: 'image', isImageBased: true }, english, japanese], setTimedTextTrack: (value: typeof selected) => { selected = value } }
  Object.assign(window, { netflix: { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: { getAllPlayerSessionIds: () => ['preview', 'watch-100'], getVideoPlayerBySessionId: () => player } }) } } } } })
  const fetcher = vi.fn(async (raw: string | URL) => ({ ok: true, url: String(raw), headers: new Headers({ 'content-type': 'application/ttml+xml' }), clone() { return this }, text: async () => '<tt><body><p begin="10000000" end="30000000">Current episode</p></body></tt>' }))
  vi.stubGlobal('fetch', fetcher)
  delete (window as Window & { nolaSiteTracksInstalled?: boolean }).nolaSiteTracksInstalled
  const request = (trackId?: string) => new Promise<unknown>(resolve => {
    const nonce = crypto.randomUUID()
    const listener = (event: Event) => { const result = JSON.parse((event as CustomEvent<string>).detail); if (result.nonce === nonce) { document.removeEventListener(TRACK_RESPONSE, listener); resolve(result.value) } }
    document.addEventListener(TRACK_RESPONSE, listener)
    document.dispatchEvent(new CustomEvent(TRACK_REQUEST, { detail: JSON.stringify({ nonce, trackId }) }))
  })
  try {
    installSiteTracks()
    for (const movieId of [100, 101]) JSON.parse(JSON.stringify({ result: { movieId, textTracks: [{ id: 'ja', downloadables: { ttml: { urls: [{ url: `https://cdn.nflxvideo.net/episode-${movieId}/ja` }] } } }] } }))
    expect(await request()).toEqual([{ id: 'netflix:100:ja', language: 'ja', label: 'ja' }, { id: 'netflix:100:en', language: 'en', label: 'en' }])
    expect(await request('netflix:100:ja')).toEqual([{ start: 1, end: 3, text: 'Current episode' }])
    expect(String(fetcher.mock.calls[0][0])).toContain('episode-100')
    document.dispatchEvent(new CustomEvent(TRACK_RESTORE))
    expect(selected).toBe(none)
    await request('netflix:100:ja')
    selected = english
    const changed = vi.fn(); document.addEventListener(TRACK_CHANGED, changed)
    await vi.advanceTimersByTimeAsync(1000)
    expect(changed).toHaveBeenCalledOnce()
    document.dispatchEvent(new CustomEvent(TRACK_RESTORE))
    expect(selected).toBe(english)
    expect(await request('netflix:101:ja')).toBeNull()
  } finally {
    window.dispatchEvent(new Event('pagehide'))
    delete (window as Window & { netflix?: unknown }).netflix
    vi.useRealTimers(); vi.unstubAllGlobals()
  }
})
