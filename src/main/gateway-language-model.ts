import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import type { CustomTranslationModel } from '../shared/settings'
import { closeDirectModelWorker, prepareLocalLanguageModel, type DirectModelServices } from './direct-model'

export interface GatewayLanguageModel {
  profile: Pick<CustomTranslationModel, 'id' | 'model' | 'endpoint' | 'apiFormat' | 'contextWindow' | 'maxOutputTokens'>
  name: string
  local: boolean
  model(effort: string): LanguageModel
  redact(message: string): string
  onFailed?(listener: () => void): () => void
  close(): Promise<void>
}

let nextOwner = -1

/** Provider-specific transports stay behind the gateway; callers never own a model process. */
export async function createGatewayLanguageModel(services: DirectModelServices, binding: string, signal: AbortSignal): Promise<GatewayLanguageModel> {
  const local = binding.startsWith('resource:')
  const owner = nextOwner--
  const saved = customModelsOf(services.getSettings().translation).find(profile => profile.id === binding.replace(/^custom:/, ''))
  let closed = false
  let failed = false
  const failures = new Set<() => void>()
  const fail = () => { if (!closed && !failed) { failed = true; for (const listener of failures) listener() } }
  let unsubscribe: (() => void) | undefined
  try {
    const connection = local ? await prepareLocalLanguageModel(services, owner, binding.slice(9), signal) : undefined
    const profile = connection ? { id: binding, model: binding.slice(9), endpoint: connection.endpoint,
      apiFormat: 'chat-completions' as const, contextWindow: connection.contextWindow,
      maxOutputTokens: Math.min(4096, Math.floor(connection.contextWindow / 2)) } : saved
    if (!profile) throw new Error('Select an installed language model or a saved LLM connection')
    const apiKey = local ? '' : await services.getCredential(customCredentialSlot(profile.id))
    signal.throwIfAborted()
    const baseURL = profile.endpoint.replace(/\/+$/, '')
    unsubscribe = connection?.onStopped(fail)
    return { profile, local, name: saved?.name ?? profile.model, redact: message => (apiKey ? message.replaceAll(apiKey, '[redacted]') : message).slice(0, 1000),
      onFailed: listener => { failures.add(listener); if (failed) queueMicrotask(listener); return () => { failures.delete(listener) } },
      model: effort => {
        if (closed || failed) throw new Error('LLM service is stopped')
        if (local) return createOpenAICompatible({ name: 'llama.cpp', baseURL, includeUsage: true,
          fetch: async (input, init) => { try { return await fetch(input, init) } catch (error) { if (!init?.signal?.aborted) fail(); throw error } },
          transformRequestBody: body => ({ ...body, parallel_tool_calls: false,
            chat_template_kwargs: { enable_thinking: effort === 'medium' || effort === 'high' } }) }).chatModel(profile.model)
        if (profile.apiFormat === 'anthropic') return createAnthropic({ apiKey: apiKey || 'no-key', baseURL: `${baseURL}/v1` })(profile.model)
        // Preserve the workbench's existing Ollama OpenAI-compatible transport. MT retains its native adapter.
        if (profile.apiFormat === 'ollama') return createOpenAICompatible({ name: 'ollama', baseURL: `${baseURL}/v1`, apiKey: apiKey || 'no-key' }).chatModel(profile.model)
        const provider = createOpenAI({ apiKey: apiKey || 'no-key', baseURL })
        return profile.apiFormat === 'chat-responses' ? provider.responses(profile.model) : provider.chat(profile.model)
      }, close: async () => { closed = true; unsubscribe?.(); failures.clear(); if (local) await closeDirectModelWorker(owner) } }
  } catch (error) {
    unsubscribe?.()
    if (local) await closeDirectModelWorker(owner)
    throw error
  }
}
