import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { protocol } from 'electron'

import type { MeetingStore } from './meeting-store'

export const MEETING_AUDIO_SCHEME = 'nola-audio'
/**
 * 地址形状是 `nola-audio://local/<meetingId>/audio.wav`：**`local` 是 host，不在 pathname 里。**
 *
 * 这个 scheme 注册成了 `standard: true`，所以 Chromium / WHATWG 解析器会照 http 那套拆
 * authority：`new URL('nola-audio://local/abc/audio.wav').host === 'local'`、
 * `.pathname === '/abc/audio.wav'`。原来那条正则去 pathname 里找 `/local/`，**永远匹配不上**，
 * 于是每个请求都落到 404 分支。host 必须单独比。
 *
 * **这条正则不是路径穿越的防线，防线在 `MeetingStore.audioPathFor`。** WHATWG 解析器会先
 * 归一化 `..`：`nola-audio://local/../../secrets/audio.wav` 到这里已经变成
 * `/secrets/audio.wav`，正则是能匹配的。真正拦住它的是 `audioPathFor` 只认 `cache` 里
 * 真实存在的会议 id（不是拿不可信输入去 join 路径）。这两处是纵深，不是二选一。
 */
const MEETING_AUDIO_HOST = 'local'
const MEETING_AUDIO_PATH = /^\/([0-9A-Za-z-]{1,64})\/audio\.wav$/

/** 从请求 URL 里取出会议 id。任何形状不对都返回 null。 */
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
    const meetingId = meetingIdOf(request.url)
    const path = meetingId ? meetings.audioPathFor(meetingId) : null
    if (!path) return new Response('not found', { status: 404 })
    return audioResponse(path, request.headers.get('range')).catch(() =>
      new Response('not readable', { status: 500 }),
    )
  })
}
