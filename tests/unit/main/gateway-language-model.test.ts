import { generateText } from 'ai'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type CloudApiFormat } from '../../../src/shared/settings'
import { createGatewayLanguageModel } from '../../../src/main/gateway-language-model'

afterEach(() => { vi.restoreAllMocks() })

it.each([
  ['chat-completions', 'https://fixture.invalid/v1', 'https://fixture.invalid/v1/chat/completions'],
  ['chat-responses', 'https://fixture.invalid/v1', 'https://fixture.invalid/v1/responses'],
  ['anthropic', 'https://fixture.invalid/anthropic', 'https://fixture.invalid/anthropic/v1/messages'],
  ['ollama', 'http://127.0.0.1:11434', 'http://127.0.0.1:11434/v1/chat/completions'],
] as const)('keeps %s protocol routing and credentials behind the gateway without inference at startup', async (apiFormat: CloudApiFormat, endpoint, url) => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.translation.customModels = [{ id: 'chat', name: 'Chat', endpoint, model: 'fixture', apiFormat, contextWindow: 4096, maxOutputTokens: 512, languages: ['zh'] }]
  const credentials = vi.fn(async () => 'fixture-secret')
  const fetchModel = vi.spyOn(globalThis, 'fetch')
  const runtime = await createGatewayLanguageModel({ getSettings: () => settings, getCredential: credentials }, 'custom:chat', new AbortController().signal)
  expect(fetchModel).not.toHaveBeenCalled()
  const reply = apiFormat === 'anthropic'
    ? { id: 'msg', type: 'message', role: 'assistant', model: 'fixture', content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 2, output_tokens: 1 } }
    : apiFormat === 'chat-responses'
      ? { id: 'resp', object: 'response', created_at: 1, model: 'fixture', status: 'completed', output: [{ type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
      : { id: 'chat', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }
  fetchModel.mockResolvedValue(new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } }))
  try {
    const result = await generateText({ model: runtime.model('auto'), prompt: 'Reply OK', maxRetries: 0 })
    expect(result.text).toBe('OK')
    expect(fetchModel.mock.calls[0][0]).toBe(url)
    expect(credentials).toHaveBeenCalledWith('cloud-model:chat')
    const headers = new Headers(fetchModel.mock.calls[0][1]?.headers)
    expect(headers.get(apiFormat === 'anthropic' ? 'x-api-key' : 'authorization')).toBe(apiFormat === 'anthropic' ? 'fixture-secret' : 'Bearer fixture-secret')
    expect(runtime.redact('Rejected fixture-secret')).toBe('Rejected [redacted]')
  } finally { await runtime.close() }
})
