import { beforeEach, expect, it, vi } from 'vitest'
import { createTextTranslation } from './text-translation'
import { translate } from './provider-client'

vi.mock('./provider-client', () => ({ translate: vi.fn() }))
beforeEach(() => { vi.mocked(translate).mockClear() })

it('cancels in-flight and queued translations when the page closes', async () => {
  vi.mocked(translate).mockImplementation((_text, _source, _target, _purpose, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
  }))
  const client = createTextTranslation({ request: vi.fn(), subscribe: () => () => {}, close: vi.fn() })
  const jobs = Array.from({ length: 5 }, () => client.translate('Text', 'en', 'zh', 'web', new AbortController().signal))
  expect(translate).toHaveBeenCalledTimes(3)
  client.close()
  expect((await Promise.allSettled(jobs)).every(job => job.status === 'rejected')).toBe(true)
  expect(translate).toHaveBeenCalledTimes(3)
})

it('allows eight web requests for a separate provider and keeps subtitles within a shared provider limit', async () => {
  vi.mocked(translate).mockImplementation((_text, _source, _target, _purpose, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
  }))
  const client = createTextTranslation({ request: vi.fn(), subscribe: () => () => {}, close: vi.fn() })
  const send = (lane: 'web' | 'video') => client.translate(lane, 'en', 'zh', lane, new AbortController().signal)
  client.configure(8, 3, true)
  const jobs = Array.from({ length: 9 }, () => send('web'))
  jobs.push(send('video'))
  expect(translate).toHaveBeenCalledTimes(8)
  client.configure(8, 3, false)
  expect(translate).toHaveBeenCalledTimes(9)
  expect(translate).toHaveBeenLastCalledWith('video', 'en', 'zh', 'subtitle', expect.any(AbortSignal))
  client.close()
  await Promise.allSettled(jobs)
})
