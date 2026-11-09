import { metadataTracks, hlsSubtitleTracks, xPlaylistOwners } from './platform-track-metadata'
import { detectVideos, xVideoIdentity } from './adapters'
import { parseTimedText, parseYouTubeTimedText, observedSubtitleUrl } from './site-tracks'
import { bilibiliTracks, parseSiteCues, subtitleUrl, TRACK_CANCEL, TRACK_REQUEST, TRACK_RESPONSE, TRACK_RESTORE, TRACK_CHANGED, type SiteTrack } from './site-tracks'

interface NetflixTrack { trackId: string; bcp47?: string; displayName?: string; isNoneTrack?: boolean; isForcedNarrative?: boolean; isImageBased?: boolean }
interface NetflixPlayer {
  getMovieId(): number
  getAudioTrack(): { bcp47?: string } | null
  getTimedTextTrack(): NetflixTrack | null
  getTimedTextTrackList(): NetflixTrack[]
  setTimedTextTrack(track: NetflixTrack): void
}
function netflixPlayer(): NetflixPlayer | undefined {
  try {
    const runtime = (window as Window & { netflix?: { appContext: { state: { playerApp: { getAPI(): { videoPlayer: { getAllPlayerSessionIds(): string[]; getVideoPlayerBySessionId(id: string): NetflixPlayer } } } } } } }).netflix?.appContext.state.playerApp.getAPI().videoPlayer
    const ids = runtime?.getAllPlayerSessionIds() ?? []
    const id = ids.find(value => value.startsWith('watch')) ?? ids[0]
    return id ? runtime?.getVideoPlayerBySessionId(id) : undefined
  } catch { return undefined }
}
const usableNetflixTrack = (track: NetflixTrack) => !track.isNoneTrack && !track.isForcedNarrative && !track.isImageBased

interface YouTubeTrack { baseUrl?: string; vssId?: string; kind?: string; languageCode?: string; name?: { simpleText?: string; runs?: { text?: string }[] } }
interface PlayerData {
  videoDetails?: { videoId?: string }
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: YouTubeTrack[] } }
}
interface YouTubePlayer extends HTMLElement {
  getPlayerResponse?(): PlayerData
  getAudioTrack?(): { captionTracks?: { url?: string; vssId?: string }[] }
  getOption?(module: string, option: string): { vss_id?: string; vssId?: string; languageCode?: string } | undefined
  getWebPlayerContextConfig?(): { innertubeContextClientVersion?: string }
  toggleSubtitles?(): void
  getPlayerState?(): number
}
const youtubePlayer = () => document.querySelector<YouTubePlayer>('#movie_player')
const youtubeVideoId = () => new URLSearchParams(location.search).get('v') ?? /^\/(?:shorts|live|embed)\/([^/]+)/.exec(location.pathname)?.[1]

async function get(url: URL | string, credentials: RequestCredentials = 'include', signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { credentials, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Subtitle request failed')
  return response
}

function youtubeTracks(): SiteTrack[] {
  const player = youtubePlayer()
  const initial = (window as Window & { ytInitialPlayerResponse?: PlayerData }).ytInitialPlayerResponse
  const expected = youtubeVideoId()
  const response = [player?.getPlayerResponse?.(), initial].find(data => data?.videoDetails?.videoId && (!expected || expected === data.videoDetails.videoId))
  if (!response) throw new Error('Player metadata unavailable')
  const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  const selection = player?.getOption?.('captions', 'track')
  const selected = selection?.vss_id ?? selection?.vssId
  return tracks.flatMap((track, index) => {
    if (!track.baseUrl || !track.languageCode) return []
    const url = subtitleUrl(track.baseUrl, 'youtube', location.origin)
    url.searchParams.set('fmt', 'json3')
    return [{ id: track.vssId ?? String(index), label: track.name?.simpleText ?? track.name?.runs?.map(run => run.text).join('') ?? track.languageCode, language: track.languageCode, url: url.href }]
  }).sort((a, b) => Number(b.id === selected || !selected && b.language === selection?.languageCode) - Number(a.id === selected || !selected && a.language === selection?.languageCode))
}

function completeYouTubeRequest(url: URL, track: SiteTrack, observed: string[] = []): void {
  const player = youtubePlayer()
  const expectedVideo = url.searchParams.get('v')
  const activeAudio = player?.getAudioTrack?.()?.captionTracks ?? []
  const available = [...observed, ...activeAudio.flatMap(audio => {
    if (!audio.url) return []
    const candidate = new URL(audio.url, location.origin)
    if (!candidate.searchParams.has('v') && audio.vssId === track.id && expectedVideo) candidate.searchParams.set('v', expectedVideo)
    return [candidate.href]
  }), ...performance.getEntriesByType('resource').map(entry => entry.name)]
  const tokenUrl = available.map(candidate => new URL(candidate, location.origin)).find(candidate =>
    candidate.origin === url.origin && candidate.pathname === url.pathname && candidate.searchParams.get('v') === expectedVideo && candidate.searchParams.has('pot'))
  if (tokenUrl) {
    for (const key of ['pot', 'potc']) if (tokenUrl.searchParams.has(key)) url.searchParams.set(key, tokenUrl.searchParams.get(key)!)
  }
  const version = player?.getWebPlayerContextConfig?.()?.innertubeContextClientVersion
  if (version) url.searchParams.set('cver', version)
  const device = (window as Window & { ytcfg?: { get?(key: string): string | undefined } }).ytcfg?.get?.('DEVICE')
  const params = new URLSearchParams(device)
  for (const key of ['cbrand', 'cbr', 'cbrver', 'cos', 'cosver', 'cplatform']) if (params.has(key)) url.searchParams.set(key, params.get(key)!)
  if (!url.searchParams.has('lang')) url.searchParams.set('lang', track.language)
  for (const [key, value] of Object.entries({ fmt: 'json3', c: 'WEB', cplayer: 'UNIPLAYER', xorb: '2', xobt: '3', xovt: '3' })) url.searchParams.set(key, value)
}

async function biliTracks(): Promise<SiteTrack[]> {
  const bvid = /^\/video\/(BV[\da-z]+)\b/i.exec(location.pathname)?.[1]
  const episode = /^\/bangumi\/play\/ep(\d+)/.exec(location.pathname)?.[1]
  const av = /^\/video\/av(\d+)/i.exec(location.pathname)?.[1]
  const page = Math.max(1, Number(new URLSearchParams(location.search).get('p')) || 1)
  const initial = (window as Window & { __INITIAL_STATE__?: { videoData?: { bvid?: string; aid?: number; pages?: { cid?: number }[] }; epInfo?: { id?: number; aid?: number; cid?: number } } }).__INITIAL_STATE__
  let aid: number, cid: number
  if (episode && String(initial?.epInfo?.id) === episode) { aid = Number(initial?.epInfo?.aid); cid = Number(initial?.epInfo?.cid) }
  else if (bvid && initial?.videoData?.bvid === bvid) { aid = Number(initial.videoData.aid); cid = Number(initial.videoData.pages?.[page - 1]?.cid) }
  else if (bvid || av) {
    const metadata = await (await get(`https://api.bilibili.com/x/web-interface/view?${bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${av}`}`)).json()
    aid = Number(metadata.data?.aid); cid = Number(metadata.data?.pages?.[page - 1]?.cid)
  } else if (episode) {
    const metadata = await (await get(`https://api.bilibili.com/pgc/view/web/season?ep_id=${episode}`)).json()
    const current = metadata.result?.episodes?.find((row: { id?: number }) => String(row.id) === episode)
    aid = Number(current?.aid); cid = Number(current?.cid)
  } else return []
  if (!Number.isSafeInteger(aid) || !Number.isSafeInteger(cid) || aid < 1 || cid < 1) throw new Error('Video metadata unavailable')
  let tracks: SiteTrack[]
  try {
    const result = await get(`https://api.bilibili.com/x/v2/subtitle/web/view?oid=${cid}&pid=${aid}&type=1&preferred_language=ai-zh`)
    tracks = bilibiliTracks(new Uint8Array(await result.arrayBuffer()))
    if (!tracks.length) throw new Error('No subtitle metadata in protobuf response')
  } catch {
    const result = await (await get(`https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}`)).json()
    if (result.code === -101) throw new Error('browserSubtitleLoginRequired')
    if (result.code !== 0) throw new Error('Subtitle list unavailable')
    tracks = (result.data?.subtitle?.subtitles ?? []).map((track: { id: number; lan: string; lan_doc: string; subtitle_url: string }) => ({ id: String(track.id), language: track.lan.replace(/^ai-/, ''), label: track.lan_doc, url: track.subtitle_url }))
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
  const timedtext = new Map<string, ReturnType<typeof parseSiteCues>>()
  const timedtextUrls = new Set<string>()
  const observed = new Map<string, SiteTrack>()
  const xPlaylists = new Map<string, SiteTrack>()
  const netflixUrls = new Map<string, string>()
  const netflixCues = new Map<string, ReturnType<typeof parseTimedText>>()
  let netflixOwner: { movie: number; original: NetflixTrack | null; selected: string } | undefined
  const restoreNetflix = () => {
    const previous = netflixOwner; netflixOwner = undefined
    try {
      const player = netflixPlayer()
      if (previous?.original && player?.getMovieId() === previous.movie && player.getTimedTextTrack()?.trackId === previous.selected) player.setTimedTextTrack(previous.original)
    } catch { /* A closing episode may already have disposed its player API. */ }
  }
  if (kind === 'netflix') {
    const parse = JSON.parse
    const capture: typeof JSON.parse = function (this: JSON, ...args) {
      const value = parse.apply(this, args)
      try {
        const manifest = value?.result
        const movie = manifest?.movieId
        const tracks = manifest?.textTracks ?? manifest?.timedtexttracks
        if (Number.isSafeInteger(movie) && Array.isArray(tracks)) for (const track of tracks) {
          if (typeof track.id !== 'string' && typeof track.id !== 'number') continue
          const visit = (node: unknown, depth = 0): void => {
            if (depth > 8 || !node) return
            if (typeof node === 'string' && node.startsWith('https://')) {
              try { netflixUrls.set(observedSubtitleUrl(node, 'netflix').href, `${movie}:${track.id}`) } catch { /* Never record arbitrary manifest resources. */ }
            } else if (typeof node === 'object') for (const child of Object.values(node)) visit(child, depth + 1)
          }
          visit(track.downloadables ?? track.ttDownloadables)
        }
        while (netflixUrls.size > 500) netflixUrls.delete(netflixUrls.keys().next().value!)
      } catch { /* Manifest observation must preserve JSON.parse behavior for the player. */ }
      return value
    }
    JSON.parse = capture
    document.addEventListener(TRACK_RESTORE, restoreNetflix)
    const poll = setInterval(() => {
      if (!netflixOwner) return
      try {
        const player = netflixPlayer()
        if (player && (player.getMovieId() !== netflixOwner.movie || player.getTimedTextTrack()?.trackId !== netflixOwner.selected)) {
          netflixOwner = undefined
          document.dispatchEvent(new CustomEvent(TRACK_CHANGED))
        }
      } catch { /* Wait for the replacement player on the next poll. */ }
    }, 1000)
    window.addEventListener('pagehide', event => { if (event.persisted) return; clearInterval(poll); restoreNetflix(); if (JSON.parse === capture) JSON.parse = parse })
  }
  const remember = (found: SiteTrack[], capturedHref: string) => {
    if (capturedHref !== location.href) return
    if (observedHref !== capturedHref) { observed.clear(); observedHref = capturedHref }
    for (const track of found) { const key = `${track.videoId ?? ''}|${track.mediaId ?? ''}|${track.url}`; observed.set(key, { ...track, id: observed.get(key)?.id ?? `metadata-${observedId++}` }); if (observed.size > 100) observed.delete(observed.keys().next().value!) }
  }
  if (kind === 'youtube' || kind === 'netflix' || kind === 'x') {
    const read = (text: string, url: string, capturedHref: string) => {
      if (text.length > 12000000) return
      if (kind === 'netflix' && netflixUrls.has(url) && text.trimStart().startsWith('<')) {
        try {
          netflixCues.set(netflixUrls.get(url)!, parseTimedText(text, 'netflix'))
          if (netflixCues.size > 30) netflixCues.delete(netflixCues.keys().next().value!)
        } catch { /* Leave unsupported or malformed subtitle documents to the native player. */ }
        return
      }
      if (kind === 'youtube') {
        try {
          const resource = subtitleUrl(url, 'youtube', location.origin)
          if (capturedHref !== location.href || resource.searchParams.get('v') !== youtubeVideoId()) return
          timedtextUrls.add(resource.href)
          if (timedtextUrls.size > 30) timedtextUrls.delete(timedtextUrls.values().next().value!)
          const cues = parseYouTubeTimedText(text)
          if (cues.length) { timedtext.set(resource.href, cues); if (timedtext.size > 8) timedtext.delete(timedtext.keys().next().value!) }
        } catch { /* Only successful native subtitle responses are reusable. */ }
        return
      }
      try {
        if (kind === 'x' && capturedHref === location.href) {
          if (text.trimStart().startsWith('#EXTM3U')) {
            const owners = [...xPlaylists.values()].filter(track => track.url === url || track.mediaId && new URL(url).pathname.includes('/' + track.mediaId.replace(/^\d+_/, '') + '/'))
            remember(owners.flatMap(owner => hlsSubtitleTracks(text, url, 'x').map(track => ({ ...track, videoId: owner.videoId, mediaId: owner.mediaId }))), capturedHref)
          } else {
            const payload = JSON.parse(text)
            for (const playlist of xPlaylistOwners(payload)) { xPlaylists.set(`${playlist.videoId}|${playlist.mediaId}|${playlist.url}`, playlist); if (xPlaylists.size > 100) xPlaylists.delete(xPlaylists.keys().next().value!) }
            remember(metadataTracks(payload, 'x'), capturedHref)
          }
        } else remember(text.trimStart().startsWith('#EXTM3U') ? hlsSubtitleTracks(text, url, kind) : metadataTracks(JSON.parse(text), kind), capturedHref)
      } catch { /* Most player responses are not subtitle manifests. */ }
    }
    const originalFetch = window.fetch
    const wrapper: typeof fetch = async function (this: Window, ...args) {
      const capturedHref = location.href
      const response = await originalFetch.apply(this, args)
      const contentType = response.headers.get('content-type') ?? ''
      if (/json|mpegurl/i.test(contentType) || kind === 'netflix' && netflixUrls.has(response.url) || kind === 'youtube' && response.url.includes('/api/timedtext')) void response.clone().text().then(text => read(text, response.url, capturedHref)).catch(() => undefined)
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
  const pause = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 250)
    signal.addEventListener('abort', abort, { once: true })
  })
  document.addEventListener(TRACK_CANCEL, event => { const nonce = (event as CustomEvent<unknown>).detail; if (typeof nonce === 'string') requests.get(nonce)?.abort() })
  document.addEventListener(TRACK_REQUEST, event => {
    const raw = (event as CustomEvent<unknown>).detail
    if (typeof raw !== 'string' || raw.length > 512) return
    let request: { nonce: string; trackId?: string; probe?: boolean }
    try { request = JSON.parse(raw) } catch { return }
    if (requests.size >= 8 || !request || typeof request.nonce !== 'string' || request.nonce.length > 128 || request.trackId !== undefined && typeof request.trackId !== 'string') return
    const owned = new AbortController()
    requests.set(request.nonce, owned)
    const requestedUrl = location.href
    let restoreOnFailure: typeof netflixOwner
    const reply = (value: unknown) => document.dispatchEvent(new CustomEvent(TRACK_RESPONSE, { detail: JSON.stringify({ nonce: request.nonce, value }) }))
    void (async () => {
      if (kind === 'netflix') {
        let player = netflixPlayer()
        for (let attempt = 0; attempt < 40 && !player?.getTimedTextTrackList().length; attempt++) { await pause(owned.signal); player = netflixPlayer(); if (location.href !== requestedUrl) throw new Error('Video changed') }
        if (!player) throw new Error('Netflix player unavailable')
        const movie = player.getMovieId()
        const available = player.getTimedTextTrackList().filter(usableNetflixTrack)
        const current = player.getTimedTextTrack()?.trackId
        const audio = player.getAudioTrack()?.bcp47?.split('-')[0]
        available.sort((a, b) => Number(b.trackId === current) * 2 + Number(b.bcp47?.split('-')[0] === audio) - Number(a.trackId === current) * 2 - Number(a.bcp47?.split('-')[0] === audio))
        const key = (track: NetflixTrack) => `netflix:${movie}:${track.trackId}`
        if (request.trackId === undefined) { reply(available.map(track => ({ id: key(track), language: track.bcp47 ?? 'auto', label: track.displayName ?? track.bcp47 ?? track.trackId }))); return }
        const selected = available.find(track => key(track) === request.trackId)
        if (!selected) throw new Error('Netflix track changed')
        const trackKey = `${movie}:${selected.trackId}`
        if (request.probe === true) {
          const cached = netflixCues.get(trackKey)
          if (cached?.length) { reply(cached); return }
          const resource = [...netflixUrls].find(([, value]) => value === trackKey)?.[0]
          if (!resource) { reply([]); return }
          const response = await get(observedSubtitleUrl(resource, 'netflix'), 'omit', owned.signal)
          reply(parseTimedText(await response.text(), 'netflix')); return
        }
        const original = player.getTimedTextTrack()
        if (!netflixOwner || netflixOwner.movie !== movie) netflixOwner = { movie, original, selected: selected.trackId }
        else netflixOwner.selected = selected.trackId
        restoreOnFailure = netflixOwner
        if (original?.trackId !== selected.trackId) player.setTimedTextTrack(selected)
        const attempted = new Set<string>()
        for (let attempt = 0; attempt < 60; attempt++) {
          owned.signal.throwIfAborted()
          if (location.href !== requestedUrl || player.getMovieId() !== movie || player.getTimedTextTrack()?.trackId !== selected.trackId) throw new Error('Netflix track changed')
          const captured = netflixCues.get(trackKey)
          if (captured?.length) { reply(captured); return }
          const resource = [...netflixUrls].find(([, value]) => value === trackKey)?.[0]
          if (resource && !attempted.has(resource)) {
            attempted.add(resource)
            try { const cues = parseTimedText(await (await get(observedSubtitleUrl(resource, 'netflix'), 'omit', owned.signal)).text(), 'netflix'); if (cues.length) { netflixCues.set(trackKey, cues); reply(cues); return } } catch { owned.signal.throwIfAborted() }
          }
          await pause(owned.signal)
        }
        throw new Error('Netflix subtitle file unavailable')
      }
      if (href !== requestedUrl || request.trackId === undefined) {
        if (kind === 'youtube') {
          for (let attempt = 0; attempt < 16; attempt++) {
            try { if (youtubeTracks().length || attempt === 15) break } catch { if (attempt === 15) throw new Error('Player metadata unavailable') }
            await pause(owned.signal)
            if (location.href !== requestedUrl) throw new Error('Video changed')
          }
        }
        let discovered: SiteTrack[] = kind === 'youtube' ? youtubeTracks() : kind === 'bilibili' ? await biliTracks() : performance.getEntriesByType('resource').flatMap((entry, index) => {
          if (!/\.(?:vtt|ttml|dfxp)(?:[?]|$)|[?&](?:format|profile)=(?:webvtt|ttml)/i.test(entry.name)) return []
          try { const url = observedSubtitleUrl(entry.name, kind); return [{ id: `observed-${index}`, label: kind, language: 'auto', url: url.href }] } catch { return [] }
        }).slice(-30)
        if (location.href !== requestedUrl) throw new Error('Video changed')
        if (kind === 'x') {
          const video = detectVideos(document)[0]
          const owner = video ? xVideoIdentity(video) : null
          if (owner && observedHref !== requestedUrl) observed.clear()
          if (owner && ![...observed.values()].some(track => track.videoId === owner)) {
            for (const master of [...xPlaylists.values()].filter(track => track.videoId === owner).slice(0, 2)) {
              const text = await (await get(observedSubtitleUrl(master.url, 'x'), 'omit', owned.signal)).text()
              remember(hlsSubtitleTracks(text, master.url, 'x').map(track => ({ ...track, videoId: owner, mediaId: master.mediaId })), requestedUrl)
            }
          }
          discovered = owner && observedHref === requestedUrl ? [...observed.values()].filter(track => track.videoId === owner) : []
          const mediaIds = new Set(discovered.map(track => track.mediaId).filter(Boolean))
          if (mediaIds.size > 1) discovered = discovered.filter(track => track.mediaId && [video?.poster, video?.currentSrc].some(raw => raw && new URL(raw, location.href).pathname.includes('/' + track.mediaId!.replace(/^\d+_/, '') + '/')))
        }
        tracks = discovered; href = requestedUrl
      }
      if (request.trackId === undefined) { reply(tracks.map(({ url: _url, ...track }) => track)); return }
      owned.signal.throwIfAborted()
      const track = tracks.find(track => track.id === request.trackId)
      if (!track) throw new Error('Subtitle track unavailable')
      if (kind === 'x') {
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
      if (kind === 'youtube') {
        const cached = () => [...timedtext].reverse().find(([raw]) => {
          const candidate = new URL(raw)
          return ['v', 'lang', 'kind', 'name', 'tlang'].every(key => candidate.searchParams.get(key) === url.searchParams.get(key))
        })?.[1]
        if (cached()) { reply(cached()); return }
        try {
          completeYouTubeRequest(url, track, [...timedtextUrls].reverse())
          const cues = parseSiteCues(await (await get(url, 'include', owned.signal)).json(), 'youtube')
          if (!cues.length) throw new Error('Empty subtitles')
          if (location.href !== requestedUrl) throw new Error('Video changed')
          reply(cues); return
        } catch { owned.signal.throwIfAborted() }
        if (request.probe === true) { reply([]); return }
        // Ask the actual player to mint subtitle credentials instead of retrying a stale URL.
        const player = youtubePlayer()
        for (let attempt = 0; attempt < 12 && player?.getPlayerState && player.getPlayerState() < 1; attempt++) {
          await pause(owned.signal)
          if (location.href !== requestedUrl) throw new Error('Video changed')
        }
        const captionsButton = player?.querySelector<HTMLElement>('.ytp-subtitles-button')
        if (captionsButton?.getAttribute('aria-pressed') !== 'true') {
          if (player?.toggleSubtitles) player.toggleSubtitles()
          else captionsButton?.click()
        }
        for (let attempt = 0; attempt < 20; attempt++) {
          await pause(owned.signal)
          if (location.href !== requestedUrl) throw new Error('Video changed')
          if (cached()) { reply(cached()); return }
          completeYouTubeRequest(url, track, [...timedtextUrls].reverse())
          if (url.searchParams.has('pot')) break
        }
      }
      for (let attempt = 0; attempt < (kind === 'youtube' ? 3 : 1); attempt++) {
        try {
          const payload = await (await get(url, kind === 'bilibili' ? 'omit' : 'include', owned.signal)).json()
          const cues = parseSiteCues(payload, kind)
          if (!cues.length || location.href !== requestedUrl) throw new Error('Subtitle track unavailable')
          reply(cues); return
        } catch (error) {
          owned.signal.throwIfAborted()
          if (kind !== 'youtube' || attempt === 2 || location.href !== requestedUrl) throw error
          completeYouTubeRequest(url, track, [...timedtextUrls].reverse())
          for (let tick = 0; tick < 4; tick++) await pause(owned.signal)
        }
      }
    })().catch(error => {
      if (restoreOnFailure && netflixOwner === restoreOnFailure) restoreNetflix()
      reply(error instanceof Error && error.message === 'browserSubtitleLoginRequired' ? 'browserSubtitleLoginRequired' : null)
    }).finally(() => { if (requests.get(request.nonce) === owned) requests.delete(request.nonce) })
  })
}
