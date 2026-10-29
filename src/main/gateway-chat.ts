import { jsonSchema, streamText, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ServerResponse } from 'node:http'
import type { GatewayLanguageModel } from './gateway-language-model'

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
    content: z.union([z.string().max(64000), z.array(z.object({ type: z.enum(['text', 'image_url']), text: z.string().optional(),
      image_url: z.object({ url: z.string().max(16000000) }).optional() })).max(32), z.null()]).optional(),
    tool_call_id: z.string().optional(), tool_calls: z.array(z.object({ id: z.string(), type: z.literal('function'),
      function: z.object({ name: z.string(), arguments: z.string() }) })).max(32).optional(),
  })).min(1).max(200),
  tools: z.array(z.object({ type: z.literal('function'), function: z.object({ name: z.string().regex(/^[\w-]{1,64}$/),
    description: z.string().max(16000).optional(), parameters: z.record(z.string(), z.unknown()) }) })).max(128).optional(),
  stream: z.boolean().optional(), max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(), top_p: z.number().min(0).max(1).optional(),
  stop: z.union([z.string(), z.array(z.string()).max(4)]).optional(), seed: z.number().int().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  reasoning_effort: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  tool_choice: z.union([z.enum(['auto', 'none', 'required']), z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) })]).optional(),
}).strict()

/** The public compatibility layer translates wire formats, while upstream protocols remain native SDK adapters. */
export async function gatewayChat(runtime: GatewayLanguageModel, raw: Record<string, unknown>, response: ServerResponse, signal: AbortSignal): Promise<void> {
  const { model: _model, ...body } = raw
  const data = requestSchema.parse(body)
  const messages: ModelMessage[] = data.messages.map(message => {
    if (message.role === 'tool') {
      if (!message.tool_call_id || typeof message.content !== 'string') throw new Error('Invalid tool result')
      const call = data.messages.flatMap(item => item.tool_calls ?? []).find(item => item.id === message.tool_call_id)
      if (!call) throw new Error('Tool result has no matching call')
      return { role: 'tool', content: [{ type: 'tool-result', toolCallId: call.id, toolName: call.function.name, output: { type: 'text', value: message.content } }] }
    }
    if (message.role === 'system' || message.role === 'developer') {
      if (typeof message.content !== 'string') throw new Error('Invalid system message')
      return { role: 'system', content: message.content }
    }
    if (message.role === 'assistant') {
      if (message.content == null && !message.tool_calls?.length) throw new Error('Assistant message requires content or tool calls')
      const content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }> = []
      if (typeof message.content === 'string' && message.content) content.push({ type: 'text', text: message.content })
      for (const call of message.tool_calls ?? []) content.push({ type: 'tool-call', toolCallId: call.id, toolName: call.function.name, input: JSON.parse(call.function.arguments) })
      return { role: 'assistant', content }
    }
    if (typeof message.content === 'string') return { role: 'user', content: message.content }
    if (!Array.isArray(message.content)) throw new Error('User message requires content')
    return { role: 'user', content: message.content.map(part => {
      if (part.type === 'text' && part.text !== undefined) return { type: 'text' as const, text: part.text }
      if (part.type === 'image_url' && part.image_url) return { type: 'image' as const, image: part.image_url.url }
      throw new Error('Invalid user content')
    }) }
  })
  const tools: ToolSet = Object.fromEntries((data.tools ?? []).map(item => [item.function.name, {
    description: item.function.description, inputSchema: jsonSchema(item.function.parameters),
  }]))
  const providerOptions: Record<string, unknown> = {}
  const effort = data.reasoning_effort ?? 'auto'
  if (!runtime.local && effort !== 'auto') providerOptions[runtime.profile.apiFormat === 'anthropic' ? 'anthropic' : 'openai'] = runtime.profile.apiFormat === 'anthropic' ? { effort } : { reasoningEffort: effort }
  const result = streamText({ model: runtime.model(effort), messages, tools, abortSignal: signal,
    temperature: data.temperature, topP: data.top_p, seed: data.seed,
    stopSequences: typeof data.stop === 'string' ? [data.stop] : data.stop,
    maxOutputTokens: Math.min(data.max_completion_tokens ?? data.max_tokens ?? runtime.profile.maxOutputTokens, runtime.profile.maxOutputTokens),
    toolChoice: typeof data.tool_choice === 'object' ? { type: 'tool', toolName: data.tool_choice.function.name } : data.tool_choice,
    providerOptions: providerOptions as never })
  const id = `chatcmpl-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const reason = (value: string) => value === 'tool-calls' ? 'tool_calls' : value === 'length' ? 'length' : 'stop'
  const usage = (value: { inputTokens: number | undefined; outputTokens: number | undefined; totalTokens: number | undefined }) => ({ prompt_tokens: value.inputTokens ?? 0, completion_tokens: value.outputTokens ?? 0, total_tokens: value.totalTokens ?? 0 })
  if (data.stream) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (delta: unknown, finish: string | null = null) => response.write('data: ' + JSON.stringify({ id, created, model: 'nola-llm', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n')
    const calls = new Map<string, number>()
    send({ role: 'assistant' })
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') send({ content: part.text })
      else if (part.type === 'reasoning-delta') send({ reasoning_content: part.text })
      else if (part.type === 'tool-input-start') { calls.set(part.id, calls.size); send({ tool_calls: [{ index: calls.get(part.id), id: part.id, type: 'function', function: { name: part.toolName, arguments: '' } }] }) }
      else if (part.type === 'tool-input-delta') send({ tool_calls: [{ index: calls.get(part.id), function: { arguments: part.delta } }] })
      else if (part.type === 'finish') send({}, reason(part.finishReason))
      else if (part.type === 'error') throw new Error('LLM inference failed')
    }
    response.write('data: ' + JSON.stringify({ id, created, model: 'nola-llm', object: 'chat.completion.chunk', choices: [], usage: usage(await result.totalUsage) }) + '\n\n')
    response.end('data: [DONE]\n\n')
  } else {
    const text = await result.text
    const calls = await result.toolCalls
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ id, created, object: 'chat.completion', model: 'nola-llm', choices: [{ index: 0,
      message: { role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls.map(call => ({ id: call.toolCallId, type: 'function', function: { name: call.toolName, arguments: JSON.stringify(call.input) } })) } : {}) },
      finish_reason: reason(await result.finishReason) }], usage: usage(await result.totalUsage) }))
  }
}
