export interface SiteTrack { id: string; label: string; language: string; url: string }
export interface SubtitleCue { start: number; end: number; text: string }
export const TRACK_REQUEST = 'nola-subtitles-request'
export const TRACK_CANCEL = 'nola-subtitles-cancel'
export const TRACK_RESPONSE = 'nola-subtitles-response'

export function subtitleUrl(raw: string, kind: 'youtube' | 'bilibili', origin: string): URL {
  const url = new URL(raw, origin)
  const allowed = kind === 'youtube'
    ? url.origin === origin && url.pathname === '/api/timedtext'
    : /^(?:[\w-]+\.)*(?:hdslb\.com|bilibili\.com|bilivideo\.com)$/.test(url.hostname) && /subtitle/i.test(url.pathname)
  if (!allowed || url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid subtitle URL')
  return url
}

function messageFields(bytes: Uint8Array, wanted: number): Uint8Array[] {
  let position = 0
  const varint = () => {
    let value = 0
    for (let shift = 0; shift < 70 && position < bytes.length; shift += 7) {
      const byte = bytes[position++]
      value += (byte & 127) * 2 ** shift
      if (!(byte & 128)) return value
    }
    throw new Error('Invalid subtitle metadata')
  }
  const matches: Uint8Array[] = []
  while (position < bytes.length) {
    const tag = varint(), wire = tag % 8
    if (wire === 0) { varint(); continue }
    if (wire === 1 || wire === 5) { position += wire === 1 ? 8 : 4; continue }
    if (wire !== 2) throw new Error('Unknown subtitle field')
    const length = varint()
    if (!Number.isSafeInteger(length) || position + length > bytes.length) throw new Error('Invalid subtitle length')
    if (Math.floor(tag / 8) === wanted) matches.push(bytes.subarray(position, position + length))
    position += length
  }
  return matches
}

export function bilibiliTracks(bytes: Uint8Array): SiteTrack[] {
  const decoder = new TextDecoder()
  return messageFields(bytes, 1).flatMap(data => messageFields(data, 3)).flatMap((track, index) => {
    const language = decoder.decode(messageFields(track, 3)[0])
    const label = decoder.decode(messageFields(track, 4)[0]) || language
    const url = decoder.decode(messageFields(track, 5)[0])
    return language && url ? [{ id: String(index), language: language.replace(/^ai-/, ''), label, url }] : []
  })
}

type TimedText = { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] }
type BilibiliSubtitle = { body?: { from?: number; to?: number; content?: string }[] }
export function parseSiteCues(payload: unknown, kind: 'youtube' | 'bilibili'): SubtitleCue[] {
  const list = kind === 'youtube'
    ? (payload as TimedText | null)?.events?.map(event => ({
      start: Number(event.tStartMs) / 1000, end: (Number(event.tStartMs) + Number(event.dDurationMs)) / 1000,
      text: event.segs?.map(segment => segment.utf8 ?? '').join('').trim() ?? '',
    }))
    : (payload as BilibiliSubtitle | null)?.body?.map(row => ({ start: Number(row.from), end: Number(row.to), text: typeof row.content === 'string' ? row.content.trim() : '' }))
  if (!list) throw new Error('Invalid subtitle format')
  return list.filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.text.length > 0 && cue.text.length <= 4000).sort((a, b) => a.start - b.start)
}

export function parseTimedText(text: string): SubtitleCue[] {
  const timestamp = (value: string) => value.split(':').reduce((total, part) => total * 60 + Number(part.replace(',', '.')), 0)
  if (text.trimStart().startsWith('<')) {
    const xml = new DOMParser().parseFromString(text, 'application/xml')
    if (xml.querySelector('parsererror')) throw new Error('Invalid timed text')
    const rate = Number(xml.documentElement.getAttribute('ttp:frameRate') ?? 30)
    const ticks = Number(xml.documentElement.getAttribute('ttp:tickRate') ?? 10000000)
    const time = (value: string) => value.endsWith('ms') ? Number(value.slice(0, -2)) / 1000 : value.endsWith('s') ? Number(value.slice(0, -1)) : value.endsWith('t') ? Number(value.slice(0, -1)) / ticks : value.split(':').length === 4 ? timestamp(value.split(':').slice(0, 3).join(':')) + Number(value.split(':')[3]) / rate : timestamp(value)
    return Array.from(xml.getElementsByTagNameNS('*', 'p')).map(row => {
      const start = time(row.getAttribute('begin') ?? '')
      const end = row.hasAttribute('end') ? time(row.getAttribute('end')!) : start + time(row.getAttribute('dur') ?? '')
      for (const line of row.getElementsByTagNameNS('*', 'br')) line.replaceWith(xml.createTextNode('\n'))
      return { start, end, text: row.textContent?.trim() ?? '' }
    }).filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && Boolean(cue.text))
  }
  const mapping = /X-TIMESTAMP-MAP=LOCAL:([^,\r\n]+),MPEGTS:(\d+)/.exec(text)
  const offset = mapping ? Number(mapping[2]) / 90000 - timestamp(mapping[1]) : 0
  return text.replace(/\r/g, '').split(/\n\s*\n/).flatMap(block => {
    const lines = block.split('\n')
    const index = lines.findIndex(line => line.includes('-->'))
    if (index < 0) return []
    const [start, end] = lines[index].split('-->').map(value => timestamp(value.trim().split(/\s/)[0]))
    const html = new DOMParser().parseFromString(lines.slice(index + 1).join('\n'), 'text/html')
    for (const line of html.querySelectorAll('br')) line.replaceWith(html.createTextNode('\n'))
    const content = html.body.textContent?.trim() ?? ''
    return Number.isFinite(start) && Number.isFinite(end) && end > start && content ? [{ start: start + offset, end: end + offset, text: content }] : []
  })
}
export function observedSubtitleUrl(raw: string, kind: 'netflix' | 'x'): URL {
  const url = new URL(raw)
  const host = kind === 'netflix' ? /(?:^|\.)nflxvideo\.net$/ : /(?:^|\.)twimg\.com$/
  if (url.protocol !== 'https:' || !host.test(url.hostname) || url.username || url.password) throw new Error('Invalid subtitle resource')
  return url
}
