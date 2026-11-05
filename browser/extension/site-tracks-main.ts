import { metadataTracks, hlsSubtitleTracks } from './platform-track-metadata'
import { parseTimedText, observedSubtitleUrl } from './site-tracks'
import { bilibiliTracks, parseSiteCues, subtitleUrl, TRACK_CANCEL, TRACK_REQUEST, TRACK_RESPONSE, type SiteTrack } from './site-tracks'

interface YouTubeTrack { baseUrl?: string; vssId?: string; languageCode?: string; name?: { simpleText?: string; runs?: { text?: string }[] } }
interface PlayerData {
  videoDetails?: { videoId?: string }
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: YouTubeTrack[] } }
}
interface YouTubePlayer extends HTMLElement {
  getPlayerResponse?(): PlayerData
  getAudioTrack?(): { captionTracks?: { url?: string; vssId?: string }[] }
  getOption?(module: string, option: string): { vss_id?: string } | undefined
  getWebPlayerContextConfig?(): { innertubeContextClientVersion?: string }
}
const youtubePlayer = () => document.querySelector<YouTubePlayer>('#movie_player')

async function get(url: URL | string, credentials: RequestCredentials = 'include', signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { credentials, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Subtitle request failed')
  return response
}

function youtubeTracks(): SiteTrack[] {
  const player = youtubePlayer()
  const initial = (window as Window & { ytInitialPlayerResponse?: PlayerData }).ytInitialPlayerResponse
  const expected = new URLSearchParams(location.search).get('v') ?? /^\/(?:shorts|live|embed)\/([^/]+)/.exec(location.pathname)?.[1]
  const response = [player?.getPlayerResponse?.(), initial].find(data => data?.videoDetails?.videoId && (!expected || expected === data.videoDetails.videoId))
  if (!response) throw new Error('Player metadata unavailable')
  const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  const selected = player?.getOption?.('captions', 'track')?.vss_id
  return tracks.flatMap((track, index) => {
    if (!track.baseUrl || !track.languageCode) return []
    const url = subtitleUrl(track.baseUrl, 'youtube', location.origin)
    url.searchParams.set('fmt', 'json3')
    return [{ id: track.vssId ?? String(index), label: track.name?.simpleText ?? track.name?.runs?.map(run => run.text).join('') ?? track.languageCode, language: track.languageCode, url: url.href }]
  }).sort((a, b) => Number(b.id === selected) - Number(a.id === selected))
}

function completeYouTubeRequest(url: URL, track: SiteTrack): void {
  const player = youtubePlayer()
  const expectedVideo = url.searchParams.get('v')
  const activeAudio = player?.getAudioTrack?.()?.captionTracks ?? []
  const available = [...activeAudio.flatMap(audio => audio.url ? [audio.url] : []), ...performance.getEntriesByType('resource').map(entry => entry.name)]
  const tokenUrl = available.map(candidate => new URL(candidate, location.origin)).find(candidate =>
    candidate.origin === url.origin && candidate.pathname === url.pathname && candidate.searchParams.get('v') === expectedVideo && candidate.searchParams.has('pot'))
  if (!url.searchParams.has('pot') && tokenUrl) {
    for (const key of ['pot', 'potc']) if (tokenUrl.searchParams.has(key)) url.searchParams.set(key, tokenUrl.searchParams.get(key)!)
  }
  const version = player?.getWebPlayerContextConfig?.()?.innertubeContextClientVersion
  if (version) url.searchParams.set('cver', version)
  const device = (window as Window & { ytcfg?: { get?(key: string): string | undefined } }).ytcfg?.get?.('DEVICE')
  const params = new URLSearchParams(device)
  for (const key of ['cbrand', 'cbr', 'cbrver', 'cos', 'cosver', 'cplatform']) if (params.has(key)) url.searchParams.set(key, params.get(key)!)
  if (!url.searchParams.has('lang')) url.searchParams.set('lang', track.language)
}

async function biliTracks(): Promise<SiteTrack[]> {
  const bvid = /^\/video\/(BV[\da-z]+)\b/i.exec(location.pathname)?.[1]
  if (!bvid) return []
  const metadata = await (await get(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`)).json()
  const page = Math.max(1, Number(new URLSearchParams(location.search).get('p')) || 1)
  const aid = Number(metadata.data?.aid), cid = Number(metadata.data?.pages?.[page - 1]?.cid)
  if (!Number.isSafeInteger(aid) || !Number.isSafeInteger(cid) || aid < 1 || cid < 1) throw new Error('Video metadata unavailable')
  let tracks: SiteTrack[]
  try {
    const result = await get(`https://api.bilibili.com/x/v2/subtitle/web/view?oid=${cid}&pid=${aid}&preferred_language=ai-zh`)
    tracks = bilibiliTracks(new Uint8Array(await result.arrayBuffer()))
  } catch {
    const result = await (await get(`https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`)).json()
    if (result.code !== 0) throw new Error('Subtitle list unavailable')
    tracks = (result.data?.subtitle?.subtitles ?? []).map((track: { id: number; lan: string; lan_doc: string; subtitle_url: string }) => ({ id: String(track.id), language: track.lan.replace(/^ai-/, ''), label: track.lan_doc, url: track.subtitle_url }))
  }
  if (!tracks.length) {
    const user = await (await get('https://api.bilibili.com/x/web-interface/nav')).json()
    if (user.data?.isLogin === false) throw new Error('browserSubtitleLoginRequired')
  }
  return tracks
}

export function installSiteTracks(): void {
  const kind = location.hostname === 'www.youtube.com' ? 'youtube' : location.hostname === 'www.bilibili.com' ? 'bilibili' : /(^|\.)netflix\.com$/.test(location.hostname) ? 'netflix' : ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(location.hostname) ? 'x' : null
  if (!kind) return
  const scope = window as Window & { nolaSiteTracksInstalled?: boolean }
  if (scope.nolaSiteTracksInstalled) return
  scope.nolaSiteTracksInstalled = true
  let observedHref = location.href
  let observedId = 0
  const observed = new Map<string, SiteTrack>()
  const remember = (found: SiteTrack[], capturedHref: string) => {
    if (capturedHref !== location.href) return
    if (observedHref !== capturedHref) { observed.clear(); observedHref = capturedHref }
    for (const track of found) { observed.set(track.url, { ...track, id: observed.get(track.url)?.id ?? `metadata-${observedId++}` }); if (observed.size > 100) observed.delete(observed.keys().next().value!) }
  }
  if (kind === 'netflix' || kind === 'x') {
    const read = (text: string, url: string, capturedHref: string) => {
      if (text.length > 12000000) return
      try { remember(text.trimStart().startsWith('#EXTM3U') ? hlsSubtitleTracks(text, url, kind) : metadataTracks(JSON.parse(text), kind), capturedHref) } catch { /* Most player responses are not subtitle manifests. */ }
    }
    const originalFetch = window.fetch
    const wrapper: typeof fetch = async function (this: Window, ...args) {
      const capturedHref = location.href
      const response = await originalFetch.apply(this, args)
      const contentType = response.headers.get('content-type') ?? ''
      if (/json|mpegurl/i.test(contentType)) void response.clone().text().then(text => read(text, response.url, capturedHref)).catch(() => undefined)
      return response
    }
    window.fetch = wrapper
    const send = XMLHttpRequest.prototype.send
    const sendWrapper: typeof XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args) {
      const capturedHref = location.href
      this.addEventListener('load', () => { if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') { try { read(this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText, this.responseURL, capturedHref) } catch { /* The player can use a binary response. */ } } }, { once: true })
      return send.apply(this, args)
    }
    XMLHttpRequest.prototype.send = sendWrapper
    window.addEventListener('pagehide', event => { if (event.persisted) return; if (window.fetch === wrapper) window.fetch = originalFetch; if (XMLHttpRequest.prototype.send === sendWrapper) XMLHttpRequest.prototype.send = send })
  }
  let href = ''
  let tracks: SiteTrack[] = []
  const requests = new Map<string, AbortController>()
  document.addEventListener(TRACK_CANCEL, event => { const nonce = (event as CustomEvent<unknown>).detail; if (typeof nonce === 'string') requests.get(nonce)?.abort() })
  document.addEventListener(TRACK_REQUEST, event => {
    const raw = (event as CustomEvent<unknown>).detail
    if (typeof raw !== 'string' || raw.length > 512) return
    let request: { nonce: string; trackId?: string }
    try { request = JSON.parse(raw) } catch { return }
    if (requests.size >= 8 || !request || typeof request.nonce !== 'string' || request.nonce.length > 128 || request.trackId !== undefined && typeof request.trackId !== 'string') return
    const owned = new AbortController()
    requests.set(request.nonce, owned)
    const requestedUrl = location.href
    const reply = (value: unknown) => document.dispatchEvent(new CustomEvent(TRACK_RESPONSE, { detail: JSON.stringify({ nonce: request.nonce, value }) }))
    void (async () => {
      if (href !== requestedUrl || request.trackId === undefined) {
        let discovered = kind === 'youtube' ? youtubeTracks() : kind === 'bilibili' ? await biliTracks() : performance.getEntriesByType('resource').flatMap((entry, index) => {
          if (!/\.(?:vtt|ttml|dfxp)(?:[?]|$)|[?&](?:format|profile)=(?:webvtt|ttml)/i.test(entry.name)) return []
          try { const url = observedSubtitleUrl(entry.name, kind); return [{ id: `observed-${index}`, label: kind, language: 'auto', url: url.href }] } catch { return [] }
        }).slice(-30)
        if (location.href !== requestedUrl) throw new Error('Video changed')
        if (kind === 'netflix' || kind === 'x') discovered = [...(observedHref === requestedUrl ? observed.values() : []), ...discovered]
        tracks = discovered; href = requestedUrl
      }
      if (request.trackId === undefined) { reply(tracks.map(({ url: _url, ...track }) => track)); return }
      owned.signal.throwIfAborted()
      const track = tracks.find(track => track.id === request.trackId)
      if (!track) throw new Error('Subtitle track unavailable')
      if (kind === 'netflix' || kind === 'x') {
        const url = observedSubtitleUrl(track.url, kind)
        let fragmented: ReturnType<typeof parseTimedText> | undefined
        let result = await (await get(url, 'omit', owned.signal)).text()
        if (result.trimStart().startsWith('#EXTM3U')) {
          const fragments = result.split(/\r?\n/).filter(line => line && !line.startsWith('#'))
          if (fragments.length > 500) throw new Error('Subtitle playlist exceeds request limit')
          fragmented = []
          for (const fragment of fragments) fragmented.push(...parseTimedText(await (await get(observedSubtitleUrl(new URL(fragment, url).href, kind), 'omit', owned.signal)).text()))
        }
        if (location.href !== requestedUrl) throw new Error('Video changed')
        reply(fragmented ?? parseTimedText(result)); return
      }
      const url = subtitleUrl(track.url, kind, location.origin)
      if (kind === 'youtube') completeYouTubeRequest(url, track)
      const payload = await (await get(url, kind === 'bilibili' ? 'omit' : 'include', owned.signal)).json()
      const cues = parseSiteCues(payload, kind)
      if (!cues.length || location.href !== requestedUrl) throw new Error('Subtitle track unavailable')
      reply(cues)
    })().catch(error => reply(error instanceof Error && error.message === 'browserSubtitleLoginRequired' ? 'browserSubtitleLoginRequired' : null)).finally(() => { if (requests.get(request.nonce) === owned) requests.delete(request.nonce) })
  })
}
