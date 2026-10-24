import { beforeEach, expect, it, vi } from 'vitest'
import type { LanguageModelStreamEvent } from '../../../shared/language-model'
import { createPlaygroundFetch } from './language-model-transport'

const bridge = vi.hoisted(() => ({ app: { streamLanguageModel: vi.fn(), cancelLanguageModel: vi.fn(), onLanguageModelStream: vi.fn(), directModel: vi.fn() } }))
vi.mock('@/store', () => ({ getBridge: () => bridge }))
let listener: (event: LanguageModelStreamEvent) => void
const unsubscribe = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  bridge.app.onLanguageModelStream.mockImplementation(callback => { listener = callback; return unsubscribe })
  bridge.app.streamLanguageModel.mockResolvedValue(undefined)
  bridge.app.cancelLanguageModel.mockResolvedValue(undefined)
})
const fetchModel = createPlaygroundFetch(() => ({ model: 'custom:saved', kind: 'llm', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
const body = JSON.stringify({ messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] })

it('keeps the stream open until its ordered end event even when IPC invoke resolves first', async () => {
  const response = await fetchModel('/chat', { method: 'POST', body })
  await Promise.resolve()
  const id = bridge.app.streamLanguageModel.mock.calls[0][0].id
  listener({ id, chunk: 'first' })
  listener({ id, chunk: 'last' })
  listener({ id, chunk: '', done: true })
  expect(await response.text()).toBe('firstlast')
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('cancels the provider request and detaches its subscription when stopped', async () => {
  const abort = new AbortController()
  const response = await fetchModel('/chat', { method: 'POST', body, signal: abort.signal })
  abort.abort()
  await expect(response.text()).rejects.toThrow('Aborted')
  expect(bridge.app.cancelLanguageModel).toHaveBeenCalledOnce()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('uses the installed translation model and returns its actual result without preview text', async () => {
  bridge.app.directModel.mockResolvedValue({ text: 'Actual engine result 42' })
  const direct = createPlaygroundFetch(() => ({ model: 'resource:installed-mt', kind: 'mt', effort: 'auto', source: 'en', target: 'zh', voice: '' }), key => key, () => [])
  const response = await direct('/chat', { method: 'POST', body })
  const stream = await response.text()
  expect(stream).toContain('Actual engine result 42')
  expect(stream).not.toContain('sampleMt')
  expect(bridge.app.directModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'resource:installed-mt', kind: 'mt', text: 'Hello', source: 'en', target: 'zh' }))
})

it('rejects image translation with a model that does not support images', async () => {
  const direct = createPlaygroundFetch(() => ({ model: 'resource:text-only', kind: 'mt', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  const response = await direct('/chat', { body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AA==' }] }] }) })
  expect(await response.text()).toContain('workbench.imageUnsupported')
  expect(bridge.app.directModel).not.toHaveBeenCalled()
})
