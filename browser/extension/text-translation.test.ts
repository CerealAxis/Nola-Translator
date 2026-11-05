import { expect, it, vi } from 'vitest'
import { createTextTranslation } from './text-translation'
import { translate } from './provider-client'

vi.mock('./provider-client', () => ({ translate: vi.fn() }))

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
