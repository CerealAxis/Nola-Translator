import { expect, it, vi } from 'vitest'
import { runDirectModel } from '../../../src/main/direct-model'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

it('requires the shared inference service instead of spawning an independent local worker', async () => {
  const directLaunch = vi.fn()
  await expect(runDirectModel({ getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', directLaunch },
    { id: crypto.randomUUID(), kind: 'tts', model: 'resource:installed', text: 'Hello', voice: '' }, new AbortController().signal))
    .rejects.toThrow('Model inference service unavailable')
  expect(directLaunch).not.toHaveBeenCalled()
})

it('passes explicit model bindings and cancellation to the shared inference service', async () => {
  const inferModel = vi.fn().mockResolvedValue({ text: 'Translated' })
  const signal = new AbortController().signal
  const request = { id: crypto.randomUUID(), kind: 'mt' as const, model: 'cloud:mymemory', text: 'Hello', source: 'en', target: 'zh' }
  await expect(runDirectModel({ getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', inferModel }, request, signal))
    .resolves.toEqual({ text: 'Translated' })
  expect(inferModel).toHaveBeenCalledWith(expect.objectContaining(request), signal, false)
})
