import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { protocol } from 'electron'

import type { MeetingStore } from './meeting-store'

export const MEETING_AUDIO_SCHEME = 'nola-audio'
/**
 * URL shape is `nola-audio://local/<meetingId>/audio.wav` — `local` is the HOST, not part of
 * the pathname. The scheme is registered `standard: true`, so the WHATWG parser splits the
 * authority by http rules and the host must be compared separately.
 *
 * This regex is not the path-traversal defence; `MeetingStore.audioPathFor` is. The parser
 * normalises `..` away before the regex ever sees the path, so the defence is that only a
 * meeting id actually present in the cache resolves to a file.
 */
const MEETING_AUDIO_HOST = 'local'
const MEETING_AUDIO_PATH = /^\/([0-9A-Za-z-]{1,64})\/audio\.wav$/

/** Extracts the meeting id from a request URL. Any unexpected shape yields null. */
function meetingIdOf(requestUrl: string): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.host !== MEETING_AUDIO_HOST) return null
  const match = MEETING_AUDIO_PATH.exec(url.pathname)
  return match ? match[1] : null
}

// The detail page needs an <audio src>. The scheme must be declared before the app is
// ready to become standard, otherwise Chromium treats it as an opaque origin and
// refuses to seek.
export function registerMeetingAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEETING_AUDIO_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ])
}

function audioResponse(path: string, range: string | null): Promise<Response> {
  return stat(path).then((info) => {
    const total = info.size
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const requested = match[2] ? Number(match[2]) : total - 1
      const end = Math.min(requested, total - 1)
      if (Number.isFinite(start) && start >= 0 && start <= end && start < total) {
        return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
          status: 206,
          headers: {
            'content-type': 'audio/wav',
            'accept-ranges': 'bytes',
            'content-range': 'bytes ' + start + '-' + end + '/' + total,
            'content-length': String(end - start + 1),
          },
        })
      }
    }
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      status: 200,
      headers: {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'content-length': String(total),
      },
    })
  })
}

export function handleMeetingAudio(meetings: MeetingStore): void {
  protocol.handle(MEETING_AUDIO_SCHEME, (request) => {
    const meetingId = meetingIdOf(request.url)
    const path = meetingId ? meetings.audioPathFor(meetingId) : null
    if (!path) return new Response('not found', { status: 404 })
    return audioResponse(path, request.headers.get('range')).catch(() =>
      new Response('not readable', { status: 500 }),
    )
  })
}
