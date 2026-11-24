import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import { astrBotChatPresets } from '../shared/astrbot-chat-presets'
import { workspaceChatConnection } from '../shared/model-workspace'
import { CHATGPT_PLAN_ENDPOINT, CHATGPT_PLAN_SERVICE } from '../shared/chatgpt-plan'
import { localChatSettingsOf } from '../shared/language-model'
import type { CustomTranslationModel } from '../shared/settings'
import type { DirectModelServices } from './direct-model'
import { measureCloudFetch } from './gateway-performance'

export interface GatewayLanguageModel {
  profile: Pick<CustomTranslationModel, 'id' | 'model' | 'endpoint' | 'apiFormat' | 'contextWindow' | 'maxOutputTokens'>
  name: string
  local: boolean
  model(effort: string): LanguageModel
  redact(message: string): string
  onFailed?(listener: () => void): () => void
  close(): Promise<void>
}

/** Provider-specific transports stay behind the gateway; callers never own a model process. */
export async function createGatewayLanguageModel(services: DirectModelServices, binding: string, signal: AbortSignal): Promise<GatewayLanguageModel> {
  const local = binding.startsWith('resource:')
  const localSettings = local ? localChatSettingsOf(services.getSettings().modelWorkspace, binding.slice(9)) : undefined
  const saved = customModelsOf(services.getSettings().translation).find(profile => profile.id === binding.replace(/^custom:/, ''))
  let closed = false
  let failed = false
  const failures = new Set<() => void>()
  const fail = () => { if (!closed && !failed) { failed = true; for (const listener of failures) listener() } }
  let backendConnection: Awaited<ReturnType<NonNullable<DirectModelServices['openLocalLanguageModel']>>>
  try {
    if (localSettings) {
      backendConnection = await services.openLocalLanguageModel?.(binding.slice(9), signal, localSettings.contextWindow)
      if (!backendConnection) throw new Error('Local language model runtime unavailable')
    }
    const connection = backendConnection
    const profile = connection && localSettings ? { id: binding, model: binding.slice(9), endpoint: connection.endpoint,
      apiFormat: 'chat-completions' as const, contextWindow: connection.contextWindow,
      maxOutputTokens: Math.min(localSettings.maxOutputTokens, connection.contextWindow) } : saved
    if (!profile) throw new Error('Select an installed language model or a saved LLM connection')
    const workspace = workspaceChatConnection(services.getSettings().modelWorkspace, profile.id)
    if (!local && workspace?.service === CHATGPT_PLAN_SERVICE) {
      const planProfile = { ...profile, endpoint: CHATGPT_PLAN_ENDPOINT, apiFormat: 'chat-responses' as const }
      const planModel = createOpenAI({ apiKey: 'chatgpt-plan', baseURL: CHATGPT_PLAN_ENDPOINT, fetch: async (input, init) => {
          if (String(input) !== CHATGPT_PLAN_ENDPOINT + '/responses' || init?.method?.toUpperCase() !== 'POST') {
            throw new Error('CHATGPT_PLAN_UNSUPPORTED_REQUEST')
          }
          const body = JSON.parse(String(init.body))
          if (body.stream !== true) throw new Error('CHATGPT_PLAN_REQUIRES_STREAMING')
          delete body.previous_response_id
          body.store = false
          const token = await services.getChatGptPlanToken?.(workspace.id)
          if (!token) throw new Error('CHATGPT_SIGN_IN_REQUIRED')
          init.signal?.throwIfAborted()
          const headers = new Headers(init.headers)
          headers.set('Authorization', 'Bearer ' + token)
          return measureCloudFetch(profile.model, fetch)(CHATGPT_PLAN_ENDPOINT + '/responses',
            { ...init, headers, body: JSON.stringify(body), redirect: 'error' })
        } }).responses(profile.model)
      return { profile: planProfile, local: false, name: saved?.name ?? profile.model, redact: message => message.slice(0, 1000),
        model: () => wrapLanguageModel({ model: planModel,
          middleware: [
            defaultSettingsMiddleware({ settings: { providerOptions: { openai: { store: false } } } }),
            { specificationVersion: 'v4', wrapStream: async ({ params, model }) => {
              const result = await model.doStream({ ...params, includeRawChunks: true })
              let terminal = false
              return { ...result, stream: result.stream.pipeThrough(new TransformStream({
                transform(part, controller) {
                  if (part.type === 'raw') {
                    const event = part.rawValue as { type?: string } | undefined
                    terminal ||= event?.type === 'response.completed' || event?.type === 'response.incomplete'
                      || event?.type === 'response.failed' || event?.type === 'error'
                    if (!params.includeRawChunks) return
                  }
                  if (part.type === 'error') terminal = true
                  if (part.type === 'finish' && !terminal) throw new Error('CHATGPT_RESPONSE_INTERRUPTED')
                  controller.enqueue(part)
                },
              })) }
            } },
          ] }),
        close: async () => {} }
    }
    const apiKey = local ? '' : await services.getCredential(customCredentialSlot(profile.id, services.getSettings().modelWorkspace))
    signal.throwIfAborted()
    const preset = astrBotChatPresets.find(item => item.id === workspace?.service)
    const tokenPlan = profile.apiFormat === 'anthropic' && (preset?.id === 'minimax-token-plan'
      || preset?.id === 'minimax-token-plan-global' || preset?.id === 'xiaomi-token-plan')
    const headers = {
      ...(preset && 'headers' in preset ? preset.headers : {}),
      ...(preset?.id === 'kimi-code' || preset?.id === 'kimi-code-global' ? { 'User-Agent': 'astrbot/4.29.4' } : {}),
      ...(tokenPlan ? { Authorization: 'Bearer ' + apiKey } : {}),
    }
    const providerFetch = measureCloudFetch(profile.model, (input, init) => {
      const outgoingHeaders = new Headers(init?.headers)
      for (const [key, value] of Object.entries(headers)) if (value !== undefined) outgoingHeaders.set(key, value)
      return fetch(input, { ...init, headers: outgoingHeaders, redirect: 'error',
        signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout((preset && 'timeout' in preset ? preset.timeout : 120) * 1000)]) })
    })
    const standardFetch = preset ? providerFetch : measureCloudFetch(profile.model, fetch)
    const baseURL = profile.endpoint.replace(/\/+$/, '')
    return { profile, local, name: saved?.name ?? profile.model, redact: message => (apiKey ? message.replaceAll(apiKey, '[redacted]') : message).slice(0, 1000),
      onFailed: listener => { failures.add(listener); if (failed) queueMicrotask(listener); return () => { failures.delete(listener) } },
      model: effort => {
        if (closed || failed) throw new Error('LLM service is stopped')
        if (localSettings) return createOpenAICompatible({ name: 'llama.cpp', baseURL, includeUsage: true,
          fetch: async (input, init) => {
            const headers = new Headers(init?.headers)
            for (const [key, value] of Object.entries(backendConnection?.headers ?? {})) headers.set(key, value)
            try {
              const response = await fetch(input, { ...init, headers, redirect: 'error' })
              if (response.status === 502 && !init?.signal?.aborted) fail()
              return response
            }
            catch (error) { if (!init?.signal?.aborted) fail(); throw error }
          },
          transformRequestBody: body => ({ ...body, parallel_tool_calls: false,
            chat_template_kwargs: { enable_thinking: localSettings.reasoningLevels.includes('enabled')
              && (!localSettings.reasoningLevels.includes('disabled') || ['enabled', 'medium', 'high'].includes(effort)) } }) }).chatModel(profile.model)
        if (workspace?.protocol === 'google-native') {
          const url = /\/v1(?:beta|alpha)?$/.test(baseURL) ? baseURL : `${baseURL}/v1beta`
          const safetySettings = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT']
            .map(name => ({ category: 'HARM_CATEGORY_' + name, threshold: 'BLOCK_MEDIUM_AND_ABOVE' }))
          const thinkingConfig = /^gemini-2\.5/.test(profile.model) ? { thinkingBudget: 0 }
            : /^gemini-3[.-]/.test(profile.model) ? { thinkingLevel: 'HIGH' } : undefined
          return wrapLanguageModel({ model: createGoogle({ apiKey, baseURL: url, fetch: providerFetch })(profile.model),
            middleware: defaultSettingsMiddleware({ settings: { providerOptions: { google: {
              safetySettings, ...(thinkingConfig ? { thinkingConfig } : {}),
            } } } }),
          })
        }
        if (workspace?.protocol === 'azure-openai') {
          const url = new URL(`${baseURL.replace(/\/openai$/, '')}/openai/deployments/${encodeURIComponent(profile.model)}/chat/completions`)
          url.searchParams.set('api-version', workspace.workspace || '2024-05-01-preview')
          return createOpenAI({ apiKey, baseURL, fetch: (_input, init) => {
            const azureHeaders = new Headers(init?.headers)
            azureHeaders.delete('authorization')
            azureHeaders.set('api-key', apiKey)
            return providerFetch(url, { ...init, headers: azureHeaders })
          } }).chat(profile.model)
        }
        if (profile.apiFormat === 'anthropic') return createAnthropic({ apiKey: apiKey || 'no-key',
          baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`, headers, fetch: standardFetch })(profile.model)
        // Preserve the workbench's existing Ollama OpenAI-compatible transport. MT retains its native adapter.
        if (profile.apiFormat === 'ollama') return createOpenAICompatible({ name: 'ollama', baseURL: `${baseURL}/v1`, apiKey: apiKey || 'no-key', fetch: standardFetch }).chatModel(profile.model)
        const provider = createOpenAI({ apiKey: apiKey || 'no-key', baseURL, headers, fetch: standardFetch })
        return profile.apiFormat === 'chat-responses' ? provider.responses(profile.model) : provider.chat(profile.model)
      }, close: async () => {
        closed = true
        failures.clear()
        if (backendConnection) await backendConnection.release()
      } }
  } catch (error) {
    if (backendConnection) await backendConnection.release()
    throw error
  }
}
