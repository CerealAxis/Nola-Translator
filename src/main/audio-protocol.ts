import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { protocol } from 'electron'

import type { MeetingStore } from './meeting-store'

export const MEETING_AUDIO_SCHEME = 'nola-audio'
const MEETING_AUDIO_PATH = /^\/local\/([0-9A-Za-z-]{1,64})\/audio\.wav$/

// The detail page needs an <audio src>, and a file:// URL would be blocked by the renderer's
// context isolation. The scheme has to be declared before the app is ready to become standard,
// otherwise Chromium treats it as an opaque origin and refuses to seek.
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
    const match = MEETING_AUDIO_PATH.exec(new URL(request.url).pathname)
    const path = match ? meetings.audioPathFor(match[1]) : null
    if (!path) return new Response('not found', { status: 404 })
    return audioResponse(path, request.headers.get('range')).catch(() =>
      new Response('not readable', { status: 500 }),
    )
  })
}
