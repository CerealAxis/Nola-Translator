import { beforeEach, expect, it, vi } from 'vitest'
import type { LanguageModelStreamEvent } from '../../../shared/language-model'
import { createPlaygroundFetch } from './language-model-transport'
import { extractVideoAudio, pcmWavData } from './audio-attachment'

const bridge = vi.hoisted(() => ({ app: { streamLanguageModel: vi.fn(), cancelLanguageModel: vi.fn(), onLanguageModelStream: vi.fn(), directModel: vi.fn(), resolveLanguageModelAudio: vi.fn() } }))
vi.mock('@/store', () => ({ getBridge: () => bridge }))
vi.mock('./audio-attachment', () => ({ extractVideoAudio: vi.fn(), pcmWavData: vi.fn() }))
let listener: (event: LanguageModelStreamEvent) => void
const unsubscribe = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pcmWavData).mockImplementation(async input => typeof input === 'string' ? input : 'data:audio/wav;base64,AA==')
  vi.mocked(extractVideoAudio).mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }))
  bridge.app.onLanguageModelStream.mockImplementation(callback => { listener = callback; return unsubscribe })
  bridge.app.streamLanguageModel.mockResolvedValue(undefined)
  bridge.app.cancelLanguageModel.mockResolvedValue(undefined)
  bridge.app.resolveLanguageModelAudio.mockResolvedValue(undefined)
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

it('returns explicit feedback instead of an empty assistant response when ASR detects no speech', async () => {
  bridge.app.directModel.mockResolvedValue({ text: '   ' })
  const direct = createPlaygroundFetch(() => ({ model: 'resource:asr', kind: 'asr', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  const response = await direct('/chat', { body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'file', mediaType: 'audio/wav', url: 'data:audio/wav;base64,AA==' }] }] }) })
  expect(await response.text()).toContain('workbench.noSpeechDetected')
  expect(bridge.app.directModel).toHaveBeenCalledWith(expect.objectContaining({ kind: 'asr', audio: 'data:audio/wav;base64,AA==' }))
})

it('explains that ASR needs a recording or media file when text alone is sent', async () => {
  const direct = createPlaygroundFetch(() => ({ model: 'resource:asr', kind: 'asr', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  const response = await direct('/chat', { body })
  expect(await response.text()).toContain('workbench.asrNeedsAudio')
  expect(bridge.app.directModel).not.toHaveBeenCalled()
})

it('streams video extraction and recognition as assistant workflow steps while preserving the original input', async () => {
  bridge.app.directModel.mockResolvedValue({ text: 'Video transcript' })
  const direct = createPlaygroundFetch(() => ({ model: 'resource:asr', kind: 'asr', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  const video = { type: 'file', mediaType: 'video/webm', filename: 'original-video.webm', url: 'data:video/webm;base64,AA==' }
  const request = { messages: [{ role: 'user', parts: [video] }] }
  const response = await direct('/chat', { body: JSON.stringify(request) })
  const stream = await response.text()
  expect(stream.indexOf('nola_extract_audio')).toBeLessThan(stream.indexOf('nola_transcribe_audio'))
  expect(stream.indexOf('nola_transcribe_audio')).toBeLessThan(stream.indexOf('Video transcript'))
  expect(extractVideoAudio).toHaveBeenCalledOnce()
  expect(bridge.app.directModel).toHaveBeenCalledWith(expect.objectContaining({ audio: 'data:audio/wav;base64,AA==' }))
  expect(video.mediaType).toBe('video/webm')
  expect(video.filename).toBe('original-video.webm')
  expect(stream).not.toContain('data:audio/wav')
})

it('shows translation and synthesis as workflow steps and never silently succeeds without synthesized audio', async () => {
  bridge.app.directModel.mockResolvedValue({ text: 'Translated text' })
  const translation = createPlaygroundFetch(() => ({ model: 'resource:mt', kind: 'mt', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  expect(await (await translation('/chat', { body })).text()).toContain('nola_translate_text')
  bridge.app.directModel.mockResolvedValue({ text: '' })
  const synthesis = createPlaygroundFetch(() => ({ model: 'resource:tts', kind: 'tts', effort: 'auto', source: 'auto', target: 'zh', voice: '' }), key => key, () => [])
  const stream = await (await synthesis('/chat', { body })).text()
  expect(stream).toContain('nola_synthesize_speech')
  expect(stream).toContain('tool-output-error')
  expect(stream).toContain('workbench.noAudioResult')
})

it('prepares the language model tool audio on demand without replacing the original attachment', async () => {
  const response = await fetchModel('/chat', { body })
  const id = bridge.app.streamLanguageModel.mock.calls[0][0].id
  listener({ id, chunk: '', audioPreparation: { id: 'preparation', mimeType: 'video/webm', url: 'data:video/webm;base64,AA==' } })
  await vi.waitFor(() => expect(bridge.app.resolveLanguageModelAudio).toHaveBeenCalledWith({ id: 'preparation', ok: true, audio: 'data:audio/wav;base64,AA==' }))
  expect(extractVideoAudio).toHaveBeenCalledOnce()
  listener({ id, chunk: '', done: true })
  expect(await response.text()).toBe('')
})


it('rejects a model removed from the live callable catalog before starting the request', async () => {
  const fetch = createPlaygroundFetch(() => ({ model: 'resource:removed', kind: 'mt', effort: 'auto', source: 'en', target: 'zh', voice: '' }), key => key, () => [], () => [])
  await expect(fetch('/chat', { body })).rejects.toThrow('workbench.noModels')
  expect(bridge.app.directModel).not.toHaveBeenCalled()
  expect(bridge.app.streamLanguageModel).not.toHaveBeenCalled()
})
