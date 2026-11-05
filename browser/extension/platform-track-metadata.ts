import { observedSubtitleUrl, type SiteTrack } from './site-tracks'

export function metadataTracks(payload: unknown, kind: 'netflix' | 'x'): SiteTrack[] {
  const result = new Map<string, SiteTrack>()
  let visited = 0
  const visit = (value: unknown, language = 'auto', label = kind as string, depth = 0, subtitle = false): void => {
    if (++visited > 20000 || depth > 20 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(item => visit(item, language, label, depth + 1, subtitle)); return }
    const row = value as Record<string, unknown>
    const isSubtitle = subtitle || /(?:text\/vtt|ttml|subtitle|caption)/i.test(String(row.content_type ?? row.mimeType ?? row.type ?? ''))
    const code = [row.bcp47, row.language, row.lang, row.languageCode].find(item => typeof item === 'string') as string | undefined
    const name = [row.languageDescription, row.displayName, row.name, row.label].find(item => typeof item === 'string') as string | undefined
    const currentLanguage = code?.slice(0, 32) ?? language
    const currentLabel = name?.slice(0, 200) ?? label
    for (const [key, child] of Object.entries(row)) {
      if (typeof child === 'string' && /^https:\/\//.test(child) && (isSubtitle && /url|src/i.test(key) || /ttDownloadables|subtitle|caption/i.test(key) || /\.(vtt|ttml|dfxp)(?:[?]|$)/i.test(child))) {
        try { const url = observedSubtitleUrl(child, kind); result.set(url.href, { id: `metadata-${result.size}`, language: currentLanguage, label: currentLabel, url: url.href }) } catch { /* Ignore unrelated media resources. */ }
      }
      if (isSubtitle && key === 'downloadUrls' && child && typeof child === 'object') {
        for (const url of Object.values(child)) if (typeof url === 'string') {
          try { const valid = observedSubtitleUrl(url, kind); result.set(valid.href, { id: `metadata-${result.size}`, language: currentLanguage, label: currentLabel, url: valid.href }) } catch { /* A download entry can be non-subtitle metadata. */ }
        }
      }
      visit(child, currentLanguage, currentLabel, depth + 1, isSubtitle || /timedtext|ttDownloadables|subtitle|caption/i.test(key))
    }
  }
  visit(payload)
  return [...result.values()].slice(0, 100)
}

export function hlsSubtitleTracks(text: string, base: string, kind: 'netflix' | 'x'): SiteTrack[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.startsWith('#EXT-X-MEDIA:') || !/TYPE=SUBTITLES(?:,|$)/.test(line)) return []
    const attribute = (key: string) => new RegExp(`(?:^|,)${key}="([^"]*)"`).exec(line.slice(13))?.[1]
    const raw = attribute('URI'); if (!raw) return []
    try { const url = observedSubtitleUrl(new URL(raw, base).href, kind); return [{ id: `hls-${index}`, language: attribute('LANGUAGE') ?? 'auto', label: attribute('NAME') ?? 'subtitles', url: url.href }] } catch { return [] }
  })
}
