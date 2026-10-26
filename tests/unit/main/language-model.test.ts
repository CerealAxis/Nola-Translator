import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => handlers.set(name, callback) } }))
import { registerLanguageModelIpc } from '../../../src/main/language-model'
import { normalizeDirectToolHistory } from '../../../src/main/language-model-stream'
import type { AgentWorkspace } from '../../../src/main/agent-workspace'
afterEach(() => { vi.restoreAllMocks(); handlers.clear() })

it('keeps desktop media workflow history without presenting it as provider-executed cloud tools', () => {
  const history = [{ id: 'media', role: 'assistant' as const, parts: [{ type: 'dynamic-tool' as const,
    toolName: 'nola_translate_text', toolCallId: 'direct', providerExecuted: true, state: 'output-available' as const,
    input: { model: 'resource:test' }, output: 'Translation completed' }] }]
  const normalized = normalizeDirectToolHistory(history)
  expect(normalized[0].parts).toEqual([{ type: 'text', text: 'Nola media operation nola_translate_text completed: Translation completed' }])
  expect(history[0].parts[0].providerExecuted).toBe(true)
})

it('streams Anthropic reasoning before completion and forwards text and actual usage', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const encoder = new TextEncoder()
  const event = (data: unknown) => encoder.encode('data: ' + JSON.stringify(data) + '\n\n')
  const response = new Response(new ReadableStream({ async start(controller) {
    controller.enqueue(event({ type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: 'MiniMax-M3.1-Flash', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }))
    controller.enqueue(event({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }))
    controller.enqueue(event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Working through the question.' } }))
    await gate
    controller.enqueue(event({ type: 'content_block_stop', index: 0 }))
    controller.enqueue(event({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }))
    controller.enqueue(event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'OK' } }))
    controller.enqueue(event({ type: 'content_block_stop', index: 1 }))
    controller.enqueue(event({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }))
    controller.enqueue(event({ type: 'message_stop' }))
    controller.close()
  } }), { headers: { 'Content-Type': 'text/event-stream' } })
  const fetchModel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
  const profile = { id: 'saved', name: 'MiniMax', endpoint: 'https://api.minimax.cn/anthropic', model: 'MiniMax-M3.1-Flash', apiFormat: 'anthropic' as const, contextWindow: 4096, maxOutputTokens: 512, languages: ['zh'] }
  const getCredential = vi.fn().mockResolvedValue('fixture-secret')
  registerLanguageModelIpc({ getSettings: () => ({ ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } }), getCredential }, () => true)
  const chunks: string[] = []
  const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false, send: (_channel: string, data: { chunk: string }) => chunks.push(data.chunk) })
  let completed = false
  const run = handlers.get('app:language-model:stream')!({ sender }, { id: crypto.randomUUID(), modelId: 'saved', body: { messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Reply OK' }] }], tools: {} } }).then(() => { completed = true })
  await vi.waitFor(() => expect(chunks.join('')).toContain('reasoning-delta'))
  expect(completed).toBe(false)
  finish()
  await run
  expect(chunks.join('')).toContain('text-delta')
  expect(chunks.join('')).toContain('OK')
  expect(chunks.join('')).toContain('totalTokens')
  expect(chunks.join('')).not.toContain('fixture-secret')
  expect(fetchModel.mock.calls[0][0]).toBe('https://api.minimax.cn/anthropic/v1/messages')
  expect(JSON.parse(String(fetchModel.mock.calls[0][1]?.body)).stream).toBe(true)
  expect(getCredential).toHaveBeenCalledWith('cloud-model:saved')
})

it('rejects requests from documents outside the development window', async () => {
  const getCredential = vi.fn()
  registerLanguageModelIpc({ getSettings: () => DEFAULT_SETTINGS, getCredential }, () => false)
  await expect(handlers.get('app:language-model:stream')!({ sender: {} }, {})).rejects.toThrow('access denied')
  expect(getCredential).not.toHaveBeenCalled()
})

it.each([true, false])('executes a terminal tool only after an SDK approval response (approved=%s)', async approved => {
  const profile = { id: 'approval-model', name: 'Fixture', endpoint: 'https://fixture.invalid', model: 'fixture', apiFormat: 'anthropic' as const, contextWindow: 4096, maxOutputTokens: 512, languages: ['en'] }
  const project = { id: crypto.randomUUID(), name: 'Project', path: 'C:/fixture' }
  const terminal = vi.fn().mockResolvedValue('{"exitCode":0,"output":"safe"}')
  const workspace = { project: async () => project, skills: async () => [], definitions: async () => [], canUseTerminal: async () => true,
    terminal, readProjectFile: vi.fn() } as unknown as AgentWorkspace
  const sse = (toolCall: boolean) => new Response([
    { type: 'message_start', message: { id: crypto.randomUUID(), type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Step reasoning.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'fixture-signature' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: toolCall ? 'I will run the requested command.' : 'Completed.' } },
    { type: 'content_block_stop', index: 1 },
    ...(toolCall ? [
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'terminal_call', name: 'terminal', input: {} } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":"echo safe"}' } },
      { type: 'content_block_stop', index: 2 },
    ] : []),
    { type: 'message_delta', delta: { stop_reason: toolCall ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ].map(item => 'data: ' + JSON.stringify(item) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => sse(true)).mockImplementation(async () => sse(false))
  registerLanguageModelIpc({ getSettings: () => ({ ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } }), getCredential: async () => 'secret', workspace }, () => true)
  const chunks: string[] = []
  const sender = Object.assign(new EventEmitter(), { id: approved ? 201 : 202, isDestroyed: () => false, send: (_channel: string, data: { chunk: string }) => chunks.push(data.chunk) })
  const user = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Run echo safe' }] }
  const invoke = (messages: unknown[]) => handlers.get('app:language-model:stream')!({ sender }, { id: crypto.randomUUID(), modelId: profile.id, projectId: project.id, body: { messages, tools: {} } })
  await invoke([user])
  expect(terminal).not.toHaveBeenCalled()
  const events = chunks.join('').split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
  const approval = events.find(event => event.type === 'tool-approval-request')
  expect(approval).toMatchObject({ toolCallId: 'terminal_call' })
  const answer = { id: 'assistant', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'terminal', toolCallId: approval.toolCallId,
    input: { command: 'echo safe' }, state: 'approval-responded', approval: { id: approval.approvalId, approved, signature: approval.signature } }] }
  const changed = structuredClone(answer)
  changed.parts[0].input.command = 'echo changed'
  await expect(invoke([user, changed])).rejects.toThrow('pending approval')
  expect(terminal).not.toHaveBeenCalled()
  await invoke([user, answer])
  expect(terminal).toHaveBeenCalledTimes(approved ? 1 : 0)
  expect(chunks.join('')).toContain('Completed.')
  const allEvents = chunks.join('').split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
  expect(allEvents.filter(event => event.type === 'start').at(-1)).toMatchObject({ messageId: answer.id })
  expect(allEvents.filter(event => event.type === 'text-delta').map(event => event.delta).join('')).toBe('I will run the requested command.Completed.')
  // Equal reasoning from two real model turns must remain visible, without replaying the first turn.
  expect(allEvents.filter(event => event.type === 'reasoning-delta' && event.delta).map(event => event.delta)).toEqual(['Step reasoning.', 'Step reasoning.'])
  await expect(invoke([user, answer])).rejects.toThrow('pending approval')
  expect(terminal).toHaveBeenCalledTimes(approved ? 1 : 0)
})
