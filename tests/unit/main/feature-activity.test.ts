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
  expect(() => activity.acquire('model-gateway', async () => {})).toThrow('FEATURE_CONFLICT:workbench')
  lease.running()
  const stopping = activity.stop()
  expect(activity.snapshot()).toEqual({ owner: 'workbench', phase: 'stopping' })
  lease.release()
  expect(activity.snapshot().owner).toBe('workbench')
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  expect(activity.stop()).toBe(stopping)
  finish()
  await stopping
  expect(activity.snapshot()).toEqual({ owner: null, phase: 'idle' })
  const next = activity.acquire('model-gateway', async () => {})
  lease.release()
  expect(activity.snapshot().owner).toBe('model-gateway')
  next.release()
})

it('keeps a failed teardown reserved so another feature cannot overlap it', async () => {
  const activity = new FeatureActivity()
  activity.acquire('browser-captions', async () => { throw new Error('still busy') }).running()
  await expect(activity.stop()).rejects.toThrow('still busy')
  expect(activity.snapshot()).toEqual({ owner: 'browser-captions', phase: 'running' })
})

it('guards desktop starts before preparation and releases a failed startup', async () => {
  const activity = new FeatureActivity()
  const prepare = vi.fn(async () => { throw new Error('model unavailable') })
  const controller = new SessionController({ activity, engine: { currentState: 'ready' } as EngineProcess,
    meetings: null, getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', prepare,
    whenReady: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  const lease = activity.acquire('model-gateway', async () => {})
  expect(() => controller.start({}, 'desktop')).toThrow('FEATURE_CONFLICT:model-gateway')
  expect(prepare).not.toHaveBeenCalled()
  lease.release()
  await expect(controller.start({ audioSource: { kind: 'defaultOutput' }, sourceLanguage: 'auto', targetLanguages: [], recognitionMode: 'realtime' }, 'desktop')).rejects.toThrow('model unavailable')
  expect(activity.snapshot().owner).toBeNull()
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
