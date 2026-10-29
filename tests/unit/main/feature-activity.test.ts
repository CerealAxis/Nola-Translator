import { expect, it, vi } from 'vitest'
import { FeatureActivity } from '../../../src/main/feature-activity'
import { SessionController } from '../../../src/main/session-controller'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineProcess } from '../../../src/main/engine-process'

it('reserves synchronously and keeps ownership until asynchronous teardown settles', async () => {
  let finish!: () => void
  const stop = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const activity = new FeatureActivity()
  const lease = activity.acquire('workbench', stop)
  expect(() => activity.acquire('workbench', async () => {})).toThrow('FEATURE_CONFLICT:workbench')
  lease.running()
  const stopping = activity.stop()
  expect(activity.snapshot()).toMatchObject({ owner: 'workbench', phase: 'stopping' })
  lease.release()
  expect(activity.snapshot().owner).toBe('workbench')
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  expect(activity.stop()).toBe(stopping)
  finish()
  await stopping
  expect(activity.snapshot()).toEqual({ owner: null, phase: 'idle', activities: [] })
  const next = activity.acquire('model-gateway', async () => {})
  lease.release()
  expect(activity.snapshot().owner).toBe('model-gateway')
  next.release()
})

it('keeps a failed teardown reserved so another feature cannot overlap it', async () => {
  const activity = new FeatureActivity()
  activity.acquire('browser-captions', async () => { throw new Error('still busy') }).running()
  await expect(activity.stop()).rejects.toThrow('still busy')
  expect(activity.snapshot()).toMatchObject({ owner: 'browser-captions', phase: 'running' })
})

it('allows desktop preparation alongside the gateway and releases only the failed feature', async () => {
  const activity = new FeatureActivity()
  const prepare = vi.fn(async () => { throw new Error('model unavailable') })
  const controller = new SessionController({ activity, engine: { currentState: 'ready' } as EngineProcess,
    meetings: null, getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', prepare,
    whenReady: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  const lease = activity.acquire('model-gateway', async () => {})
  await expect(controller.start({ audioSource: { kind: 'defaultOutput' }, sourceLanguage: 'auto', targetLanguages: [], recognitionMode: 'realtime' }, 'desktop')).rejects.toThrow('model unavailable')
  expect(prepare).toHaveBeenCalledOnce()
  expect(activity.has('model-gateway')).toBe(true)
  expect(activity.has('interpretation')).toBe(false)
  lease.release()
  expect(activity.snapshot().owner).toBeNull()
})

it('tracks all features and stops consumers before the shared gateway', async () => {
  const activity = new FeatureActivity()
  const order: string[] = []
  activity.acquire('model-gateway', async () => { order.push('gateway') }).running()
  activity.acquire('workbench', async () => { order.push('workbench') }).running()
  activity.acquire('interpretation', async () => { order.push('interpretation') }).running()
  activity.acquire('browser-captions', async () => { order.push('browser') }).running()
  expect(activity.snapshot().activities).toHaveLength(4)
  await activity.stop()
  expect(order.at(-1)).toBe('gateway')
  expect(activity.snapshot().activities).toEqual([])
})

it('waits for preparation cancellation before releasing a starting interpretation', async () => {
  const activity = new FeatureActivity()
  let resume!: () => void
  const gate = new Promise<void>(resolve => { resume = resolve })
  const engine = { currentState: 'ready', stop: vi.fn(async () => {}) }
  const controller = new SessionController({ activity, engine: engine as unknown as EngineProcess,
    meetings: null, getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '',
    prepare: async () => gate, whenReady: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  const started = controller.start({ audioSource: { kind: 'defaultOutput' }, sourceLanguage: 'auto', targetLanguages: [], recognitionMode: 'realtime' }, 'desktop')
  const rejected = expect(started).rejects.toThrow('sessionStartCancelled')
  const stopped = activity.stop()
  await vi.waitFor(() => expect(engine.stop).toHaveBeenCalledOnce())
  expect(activity.snapshot().phase).toBe('stopping')
  resume()
  await Promise.all([rejected, stopped])
  expect(activity.snapshot().owner).toBeNull()
})
