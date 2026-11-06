import { afterEach, expect, it, vi } from 'vitest'
import type { LatencySnapshot } from '../../shared/latency'
import { subscribeLatency } from './latency'

afterEach(() => vi.unstubAllGlobals())

it('does not replace live latency data with a late initial failure', async () => {
  let publish!: (snapshot: LatencySnapshot) => void
  let reject!: (error: Error) => void
  vi.stubGlobal('nolaTranslator', {
    getLatencySnapshot: () => new Promise((_, fail) => { reject = fail }),
    onLatencySnapshot: (listener: typeof publish) => { publish = listener; return () => {} },
  })
  const listener = vi.fn(), onFailure = vi.fn()
  const stop = subscribeLatency(listener, onFailure)
  publish({ active: true } as LatencySnapshot)
  reject(new Error('unavailable'))
  await Promise.resolve(); await Promise.resolve()
  expect(listener).toHaveBeenCalledOnce()
  expect(onFailure).not.toHaveBeenCalled()
  stop()
})

it('reports a missing latency API instead of remaining in a loading state', () => {
  vi.stubGlobal('nolaTranslator', undefined)
  const onFailure = vi.fn()
  subscribeLatency(vi.fn(), onFailure)()
  expect(onFailure).toHaveBeenCalledOnce()
})
