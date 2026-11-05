import { afterEach, expect, it, vi } from 'vitest'
import { createTabAudioCapture } from './tab-audio-client'
import { setupTabAudioRuntime } from './tab-audio-runtime'

afterEach(() => vi.unstubAllGlobals())
function port(name: string, sender?: ChromePort['sender']) {
  const messages: Array<(value: unknown) => void> = [], disconnects: Array<(port: ChromePort) => void> = []
  const instance = { name, sender, onMessage: { addListener: (callback: (value: unknown) => void) => messages.push(callback) }, onDisconnect: { addListener: (callback: (port: ChromePort) => void) => disconnects.push(callback) }, postMessage: vi.fn(), disconnect: vi.fn() } as unknown as ChromePort
  return { port: instance, message: (value: unknown) => messages.forEach(callback => callback(value)), disconnect: () => disconnects.forEach(callback => callback(instance)) }
}

it('delivers PCM and epoch gates through an extension port without creating audio in the captured document', async () => {
  const connection = port('nola-tab-audio'), chunk = vi.fn(), failure = vi.fn()
  vi.stubGlobal('chrome', { runtime: { connect: () => connection.port } })
  const pending = createTabAudioCapture(chunk, undefined, failure)
  expect(connection.port.postMessage).toHaveBeenCalledWith({ type: 'start' })
  connection.message({ type: 'ready' })
  const capture = await pending
  capture.enable(true, 3)
  expect(connection.port.postMessage).toHaveBeenCalledWith({ type: 'gate', enabled: true, epoch: 3 })
  connection.message({ type: 'chunk', audio: 'AAA=', sampleRate: 16000, epoch: 3 })
  expect(chunk).toHaveBeenCalledWith(expect.objectContaining({ sampleRate: 16000, epoch: 3 }))
  connection.message({ type: 'chunk', audio: '$invalid', sampleRate: 16000, epoch: 3 })
  expect(failure).toHaveBeenCalledWith('browserCaptureUnsupported')
  expect(connection.port.disconnect).toHaveBeenCalledOnce()
})

it('cancels pending capture on owner abort before an offscreen ready response', async () => {
  const connection = port('nola-tab-audio'), controller = new AbortController()
  vi.stubGlobal('chrome', { runtime: { connect: () => connection.port } })
  const pending = createTabAudioCapture(vi.fn(), undefined, undefined, controller.signal)
  controller.abort()
  await expect(pending).rejects.toThrow('browserCaptureCancelled')
  expect(connection.port.disconnect).toHaveBeenCalledOnce()
})

it('uses an extension-origin consumer and forwards only the owning capture to its tab', async () => {
  let connect!: (port: ChromePort) => void
  const document = port('nola-offscreen-audio', { url: 'chrome-extension://test/offscreen.html' })
  const captureId = vi.fn().mockResolvedValue('private-stream-id')
  const createDocument = vi.fn(async () => { connect(document.port) })
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, offscreen: { createDocument, closeDocument: vi.fn().mockResolvedValue(undefined) }, tabCapture: { getMediaStreamId: captureId }, runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`, getContexts: vi.fn().mockResolvedValue([]), onConnect: { addListener: (listener: typeof connect) => { connect = listener } },
  } })
  setupTabAudioRuntime()
  const content = port('nola-tab-audio', { frameId: 0, tab: { id: 9 }, url: 'https://video.test/watch' })
  const other = port('nola-tab-audio', { frameId: 0, tab: { id: 10 }, url: 'https://other.test/' })
  connect(content.port); connect(other.port)
  content.message({ type: 'start' })
  await expect.poll(() => vi.mocked(document.port.postMessage).mock.calls.some(([message]) => (message as { type?: string }).type === 'start')).toBe(true)
  expect(captureId).toHaveBeenCalledWith({ targetTabId: 9 })
  expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'offscreen.html', reasons: ['USER_MEDIA'] }))
  const id = vi.mocked(document.port.postMessage).mock.calls.find(([message]) => (message as { type?: string }).type === 'start')![0] as { id: string }
  document.message({ type: 'ready', id: id.id })
  expect(content.port.postMessage).toHaveBeenCalledWith({ type: 'ready', id: id.id })
  expect(other.port.postMessage).not.toHaveBeenCalled()
  content.message({ type: 'gate', enabled: true, epoch: 4 })
  expect(document.port.postMessage).toHaveBeenCalledWith({ type: 'gate', id: id.id, enabled: true, epoch: 4 })
  content.disconnect()
  expect(document.port.postMessage).toHaveBeenCalledWith({ type: 'close', id: id.id })
  await expect.poll(() => chrome.offscreen!.closeDocument).toHaveBeenCalledOnce()
})

it('does not register Chromium offscreen capture in Firefox', () => {
  const addListener = vi.fn()
  vi.stubGlobal('chrome', { runtime: { onConnect: { addListener } } })
  setupTabAudioRuntime()
  expect(addListener).not.toHaveBeenCalled()
})

it('waits for idle teardown before recreating a document and ignores the old port disconnect', async () => {
  let connect!: (port: ChromePort) => void, releaseClose!: () => void
  const documents: ReturnType<typeof port>[] = []
  const createDocument = vi.fn(async () => {
    const document = port('nola-offscreen-audio', { url: 'chrome-extension://test/offscreen.html' })
    documents.push(document); connect(document.port)
  })
  const closeDocument = vi.fn(() => new Promise<void>(resolve => { releaseClose = resolve }))
  const capture = vi.fn().mockResolvedValue('stream')
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, offscreen: { createDocument, closeDocument }, tabCapture: { getMediaStreamId: capture }, runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`, getContexts: vi.fn().mockResolvedValue([]), onConnect: { addListener: (listener: typeof connect) => { connect = listener } },
  } })
  setupTabAudioRuntime()
  const first = port('nola-tab-audio', { frameId: 0, tab: { id: 1 }, url: 'http://localhost/video' })
  connect(first.port); first.message({ type: 'start' })
  await expect.poll(() => capture.mock.calls.length).toBe(1)
  first.disconnect()
  await expect.poll(() => closeDocument.mock.calls.length).toBe(1)
  const next = port('nola-tab-audio', { frameId: 0, tab: { id: 2 }, url: 'https://video.test/watch' })
  connect(next.port); next.message({ type: 'start' })
  documents[0].disconnect()
  expect(next.port.postMessage).not.toHaveBeenCalled()
  expect(createDocument).toHaveBeenCalledOnce()
  releaseClose()
  await expect.poll(() => createDocument.mock.calls.length).toBe(2)
  await expect.poll(() => capture.mock.calls.length).toBe(2)
  expect(capture).toHaveBeenLastCalledWith({ targetTabId: 2 })
})

it('closes a document whose only capture owner disconnects while startup is pending', async () => {
  let connect!: (port: ChromePort) => void, finishCreate!: () => void
  const closeDocument = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, offscreen: {
    createDocument: vi.fn(() => new Promise<void>(resolve => { finishCreate = () => { connect(port('nola-offscreen-audio', { url: 'chrome-extension://test/offscreen.html' }).port); resolve() } })), closeDocument,
  }, tabCapture: { getMediaStreamId: vi.fn() }, runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`, getContexts: vi.fn().mockResolvedValue([]), onConnect: { addListener: (listener: typeof connect) => { connect = listener } },
  } })
  setupTabAudioRuntime()
  const content = port('nola-tab-audio', { frameId: 0, tab: { id: 1 }, url: 'https://video.test/watch' })
  connect(content.port); content.message({ type: 'start' })
  await expect.poll(() => typeof finishCreate).toBe('function')
  content.disconnect(); finishCreate()
  await expect.poll(() => closeDocument.mock.calls.length).toBe(1)
  expect(chrome.tabCapture!.getMediaStreamId).not.toHaveBeenCalled()
})
