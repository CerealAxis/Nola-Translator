import { observedSubtitleUrl, type SiteTrack } from './site-tracks'

export type OwnedSiteTrack = SiteTrack & { videoId?: string; mediaId?: string }

export function metadataTracks(payload: unknown, kind: 'netflix' | 'x'): OwnedSiteTrack[] {
  return collectMetadata(payload, kind, false)
}

/** Video masters are ownership references, never selectable subtitle tracks. */
export function xPlaylistOwners(payload: unknown): OwnedSiteTrack[] {
  return collectMetadata(payload, 'x', true)
}

function collectMetadata(payload: unknown, kind: 'netflix' | 'x', playlists: boolean): OwnedSiteTrack[] {
  const result = new Map<string, OwnedSiteTrack>()
  let visited = 0
  const visit = (value: unknown, language = 'auto', label = kind as string, depth = 0, subtitle = false, videoId?: string, mediaId?: string): void => {
    if (++visited > 20000 || depth > 20 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(item => visit(item, language, label, depth + 1, subtitle, videoId, mediaId)); return }
    const row = value as Record<string, unknown>
    const legacy = row.legacy && typeof row.legacy === 'object' ? row.legacy as Record<string, unknown> : undefined
    const tweet = row.__typename === 'Tweet' || typeof row.full_text === 'string' || typeof legacy?.full_text === 'string'
    const ownId = tweet ? row.rest_id ?? row.id_str ?? legacy?.id_str : undefined
    const owner = kind === 'x' && typeof ownId === 'string' && /^\d+$/.test(ownId) ? ownId : videoId
    const media = kind === 'x' && typeof row.media_key === 'string' ? row.media_key : mediaId
    const ownership = { ...(owner ? { videoId: owner } : {}), ...(media ? { mediaId: media } : {}) }
    const isSubtitle = subtitle || /(?:text\/vtt|ttml|subtitle|caption)/i.test(String(row.content_type ?? row.mimeType ?? row.type ?? ''))
    const code = [row.bcp47, row.language, row.lang, row.languageCode, row.language_code].find(item => typeof item === 'string') as string | undefined
    const name = [row.languageDescription, row.displayName, row.name, row.label].find(item => typeof item === 'string') as string | undefined
    const currentLanguage = code?.slice(0, 32) ?? language
    const currentLabel = name?.slice(0, 200) ?? label
    for (const [key, child] of Object.entries(row)) {
      const playlistUrl = playlists && Boolean(owner) && key === 'url' && /mpegurl/i.test(String(row.content_type ?? row.mimeType ?? '')) && typeof child === 'string' && /\.m3u8(?:[?]|$)/i.test(child)
      const captionUrl = !playlists && (isSubtitle && /url|src|download/i.test(key) || /ttDownloadables|subtitle|caption/i.test(key) || typeof child === 'string' && /\.(vtt|ttml|dfxp)(?:[?]|$)/i.test(child))
      if (typeof child === 'string' && /^https:\/\//.test(child) && (playlistUrl || captionUrl)) {
        try { const url = observedSubtitleUrl(child, kind); result.set(`${owner ?? ''}|${media ?? ''}|${url.href}`,  { id: `metadata-${result.size}`, language: currentLanguage, label: currentLabel, url: url.href, ...ownership }) } catch { /* Ignore unrelated media resources. */ }
      }
      if (!playlists && isSubtitle && /^(?:downloadUrls|urls)$/i.test(key) && child && typeof child === 'object') {
        for (const url of Object.values(child)) if (typeof url === 'string') {
          try { const valid = observedSubtitleUrl(url, kind); result.set(`${owner ?? ''}|${media ?? ''}|${valid.href}`,  { id: `metadata-${result.size}`, language: currentLanguage, label: currentLabel, url: valid.href, ...ownership }) } catch { /* A download entry can be non-subtitle metadata. */ }
        }
      }
      visit(child, currentLanguage, currentLabel, depth + 1, isSubtitle || /timedtext|textTracks|ttDownloadables|subtitle|caption/i.test(key), owner, media)
    }
  }
  visit(payload)
  return [...result.values()].slice(0, 100)
}

export function hlsSubtitleTracks(text: string, base: string, kind: 'netflix' | 'x'): SiteTrack[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.startsWith('#EXT-X-MEDIA:') || !/TYPE="?SUBTITLES"?(?:,|$)/.test(line)) return []
    const attribute = (key: string) => new RegExp(`(?:^|,)${key}="([^"]*)"`).exec(line.slice(13))?.[1]
    const raw = attribute('URI'); if (!raw) return []
    try { const url = observedSubtitleUrl(new URL(raw, base).href, kind); return [{ id: `hls-${index}`, language: attribute('LANGUAGE') ?? 'auto', label: attribute('NAME') ?? 'subtitles', url: url.href }] } catch { return [] }
  })
}
