import { afterEach, expect, it, vi } from 'vitest'
import { createProvider } from './providers'
import { openAliyunSpeech } from './speech-socket'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('cancels a pending credential rule before opening the speech socket', async () => {
  vi.useFakeTimers()
  let finish!: () => void
  const rules = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, runtime: { getURL: () => 'chrome-extension://testextension/' }, declarativeNetRequest: { updateSessionRules: rules } })
  const Socket = vi.fn(function () { return { close: vi.fn() } })
  vi.stubGlobal('WebSocket', Socket)
  const controller = new AbortController()
  const provider = { ...createProvider('alibaba'), apiKey: 'fixture-key', options: { workspaceId: 'workspace' } }
  const pending = openAliyunSpeech(provider, 'asr', 'auto', 'en', vi.fn(), controller.signal)
  const failure = pending.catch(error => error)
  await vi.waitFor(() => expect(rules).toHaveBeenCalledOnce())
  controller.abort()
  finish()
  await vi.advanceTimersByTimeAsync(20001)
  expect(await failure).toMatchObject({ name: 'AbortError' })
  expect(Socket).not.toHaveBeenCalled()
  expect(rules.mock.calls[1][0]).toEqual({ removeRuleIds: [rules.mock.calls[0][0].addRules[0].id] })
})

it('restricts the credential rule to an extension-owned handshake and removes it after connecting', async () => {
  const rules = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, runtime: { getURL: () => 'chrome-extension://testextension/' }, declarativeNetRequest: { updateSessionRules: rules } })
  let socket!: FakeSocket
  class FakeSocket {
    static OPEN = 1
    readyState = 1
    bufferedAmount = 0
    onopen?: () => void
    onmessage?: (event: { data: string }) => void
    onclose?: () => void
    onerror?: () => void
    send = vi.fn()
    close = vi.fn()
    constructor(public url: string) { socket = this }
  }
  vi.stubGlobal('WebSocket', FakeSocket)
  const provider = { ...createProvider('alibaba'), apiKey: 'private-test-key', options: { workspaceId: 'workspace', region: 'cn-beijing' } }
  const emit = vi.fn()
  const pending = openAliyunSpeech(provider, 's2s', 'auto', 'ja', emit, new AbortController().signal)
  await expect.poll(() => Boolean(socket)).toBe(true)
  const rule = rules.mock.calls[0][0].addRules[0]
  expect(rule.condition.initiatorDomains).toEqual(['testextension'])
  expect(rule.condition.resourceTypes).toEqual(['websocket'])
  expect(rule.condition.regexFilter).toMatch(/^\^wss/)
  socket.onopen?.()
  await expect.poll(() => rules.mock.calls.length).toBe(2)
  expect(rules.mock.calls[1][0]).toEqual({ removeRuleIds: [rule.id] })
  socket.onmessage?.({ data: JSON.stringify({ type: 'session.created' }) })
  const config = JSON.parse(socket.send.mock.calls[0][0])
  expect(config.session).toMatchObject({ output_modalities: ['text'], translation: { language: 'ja' } })
  expect(JSON.stringify(config)).not.toContain(provider.apiKey)
  socket.onmessage?.({ data: JSON.stringify({ type: 'session.updated' }) })
  const stream = await pending
  await stream.append('AAA=')
  expect(JSON.parse(socket.send.mock.calls[1][0])).toMatchObject({ type: 'input_audio_buffer.append', audio: 'AAA=' })
  expect(() => socket.onmessage?.({ data: 'null' })).not.toThrow()
  expect(emit).toHaveBeenCalledWith({ type: 'error', code: 'providerInvalid' })
  expect(socket.close).toHaveBeenCalled()
  await expect(stream.append('AAA=')).rejects.toThrow('providerDisconnected')
})
