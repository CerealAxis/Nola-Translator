import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { handleMeetingAudio } from '../../../src/main/audio-protocol'

const state = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ protocol: { handle: state.handle } }))

it.each([
  ['bytes=-4', 206, '6789', 'bytes 6-9/10'],
  ['bytes=-20', 206, '0123456789', 'bytes 0-9/10'],
  ['bytes=2-4', 206, '234', 'bytes 2-4/10'],
  ['bytes=-0', 416, '', 'bytes */10'],
  ['bytes=10-', 416, '', 'bytes */10'],
] as const)('serves the requested recording range %s', async (range, status, text, contentRange) => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-audio-range-'))
  try {
    const path = join(directory, 'audio.mp3')
    await writeFile(path, '0123456789')
    handleMeetingAudio({ audioPathFor: () => path } as never)
    const response = await state.handle.mock.calls.at(-1)![1](new Request('nola-audio://local/test/audio.mp3', { headers: { range } })) as Response
    expect(response.status).toBe(status)
    expect(response.headers.get('content-range')).toBe(contentRange)
    expect(await response.text()).toBe(text)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
