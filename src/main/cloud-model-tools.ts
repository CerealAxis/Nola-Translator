import { z } from 'zod'
import { generateText, streamText } from 'ai'
import { astrBotChatPresets } from '../shared/astrbot-chat-presets'
import { CHATGPT_PLAN_SERVICE } from '../shared/chatgpt-plan'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import { workspaceChatConnection } from '../shared/model-workspace'
import { supportErrorCodeForCause } from '../shared/error-catalog'
import type { CloudModelListRequest, RemoteChatModel } from '../shared/cloud-model-tools'
import type { AppSettings, CredentialProvider } from '../shared/settings'
import type { ModelGateway } from './model-gateway'

const remoteModel = z.object({
  id: z.string().trim().min(1).max(256),
  inputTokenLimit: z.number().int().min(256).max(10_000_000).optional(),
  outputTokenLimit: z.number().int().min(1).max(10_000_000).optional(),
})
const modelPage = z.object({
  data: z.array(z.object({ id: z.unknown() }).passthrough()).optional(),
  models: z.array(z.object({ name: z.unknown() }).passthrough()).optional(),
  nextPageToken: z.string().optional(),
  has_more: z.boolean().optional(),
  last_id: z.string().optional(),
})

export function cloudModelError(code: string, message = code) {
  return Object.assign(new Error(message), { code })
}

export function cloudModelHttpError(status: number, hasKey?: boolean) {
  const code = status === 401 ? (hasKey === false ? 'CLOUD_MODEL_KEY_REQUIRED' : 'AUTHENTICATION_FAILED')
    : status === 402 ? 'CLOUD_MODEL_BILLING_REQUIRED'
    : status === 403 ? 'CLOUD_MODEL_ACCESS_DENIED'
    : status === 429 ? 'CLOUD_MODEL_RATE_LIMITED'
    : status >= 500 ? 'CLOUD_MODEL_PROVIDER_UNAVAILABLE'
    : 'CLOUD_MODEL_REQUEST_REJECTED'
  return cloudModelError(code, `Provider returned HTTP ${status}`)
}

/** Keep provider failures actionable when they cross the cloud-model IPC boundary. */
export function cloudModelProbeError(error: unknown, signal?: AbortSignal) {
  const source = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : undefined
  if (typeof source?.code === 'string' && source.code
    && source.code !== 'UNKNOWN_ERROR'
    && (source.code.startsWith('CLOUD_MODEL_') || supportErrorCodeForCause(source.code) !== 'ERR-999')) return error
  const message = typeof source?.message === 'string' ? source.message : String(error ?? '')
  if (signal?.aborted || /(?:abort|timeout|timed out)/i.test(message)) return cloudModelError('REQUEST_TIMEOUT')
  if (/invalid\s+url/i.test(message)) return cloudModelError('CLOUD_MODEL_INVALID_ADDRESS')
  if (error instanceof TypeError || /(?:fetch failed|network|socket|connection|dns|econn|enotfound)/i.test(message)) {
    return cloudModelError('NETWORK_UNAVAILABLE')
  }
  if (error instanceof SyntaxError || /(?:json|response).*(?:invalid|parse|unexpected)/i.test(message)) {
    return cloudModelError('SYNTHESISFAILED')
  }
  return cloudModelError('SYNTHESISFAILED')
}

export async function probeCloudLanguageModel(
  binding: string,
  settings: AppSettings,
  getCredential: (provider: CredentialProvider) => Promise<string>,
  acquire: ModelGateway['acquireLanguageModel'],
  signal: AbortSignal,
): Promise<void> {
  const profileId = binding.slice('custom:'.length)
  const profile = customModelsOf(settings.translation).find(model => model.id === profileId)
  const isPlan = workspaceChatConnection(settings.modelWorkspace, profileId)?.service === CHATGPT_PLAN_SERVICE
  const hasKey = isPlan || Boolean((await getCredential(customCredentialSlot(profileId, settings.modelWorkspace))).trim())
  if (!hasKey && profile && URL.canParse(profile.endpoint) && new URL(profile.endpoint).origin === 'https://api.openai.com') {
    throw cloudModelError('CLOUD_MODEL_KEY_REQUIRED')
  }
  const lease = await acquire(binding, true)
  let failure: unknown
  try {
    const options = { model: lease.model('disabled'), prompt: 'Reply with OK.', maxOutputTokens: Math.min(32, lease.profile.maxOutputTokens),
      maxRetries: 0, abortSignal: AbortSignal.any([signal, lease.signal]) }
    if (isPlan) {
      let streamError: unknown
      const result = streamText({ ...options, onError: ({ error }) => { streamError = error } })
      try { await result.text } catch (error) { throw streamError ?? error }
      if (streamError) throw streamError
    } else await generateText(options)
  } catch (error) {
    const status = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined
    failure = signal.aborted ? cloudModelError('REQUEST_TIMEOUT') : typeof status === 'number' ? cloudModelHttpError(status, hasKey)
      : new Error(lease.redact(error instanceof Error ? error.message : 'Model request failed'))
    throw failure
  } finally { lease.release(failure) }
}

export async function fetchCloudChatModels(request: CloudModelListRequest, key: string, signal: AbortSignal, fetcher = fetch): Promise<RemoteChatModel[]> {
  const { protocol } = request
  if (!URL.canParse(request.endpoint)) throw cloudModelError('CLOUD_MODEL_INVALID_ADDRESS')
  const url = new URL(request.endpoint)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw cloudModelError('CLOUD_MODEL_INVALID_ADDRESS')
  if (protocol === 'azure-openai') throw cloudModelError('CLOUD_MODEL_AZURE_DEPLOYMENT')
  if (!key && url.origin === 'https://api.openai.com') throw cloudModelError('CLOUD_MODEL_KEY_REQUIRED')
  const preset = astrBotChatPresets.find(item => item.id === request.service)
  const basePath = url.pathname.replace(/\/+$/, '')
  const headers = new Headers(preset && 'headers' in preset ? preset.headers : undefined)
  if (protocol === 'anthropic') {
    url.pathname = basePath.endsWith('/v1') ? basePath + '/models' : basePath + '/v1/models'
    headers.set('anthropic-version', '2023-06-01')
    if (key) {
      headers.set('x-api-key', key)
      if (['minimax-token-plan', 'minimax-token-plan-global', 'xiaomi-token-plan'].includes(request.service)) headers.set('authorization', 'Bearer ' + key)
    }
    if (request.service === 'kimi-code' || request.service === 'kimi-code-global') headers.set('user-agent', 'astrbot/4.29.4')
  } else if (protocol === 'google-native') {
    url.pathname = /\/v1(?:beta|alpha)?$/.test(basePath) ? basePath + '/models' : basePath + '/v1beta/models'
    if (key) headers.set('x-goog-api-key', key)
  } else {
    url.pathname = protocol === 'ollama' ? basePath + '/api/tags' : basePath + '/models'
    if (key) headers.set('authorization', 'Bearer ' + key)
  }
  const models = new Map<string, RemoteChatModel>()
  const visited = new Set<string>()
  for (let pages = 0; pages < 20 && !visited.has(url.href); pages++) {
    visited.add(url.href)
    const response = await fetcher(url.href, { headers, signal, redirect: 'error' }).catch(() => {
      throw cloudModelError(signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_UNAVAILABLE')
    })
    if (response.status === 404 || response.status === 405 || response.status === 501) throw cloudModelError('CLOUD_MODEL_LIST_UNAVAILABLE')
    if (!response.ok) throw cloudModelHttpError(response.status, Boolean(key))
    const page = modelPage.safeParse(await response.json().catch(() => undefined))
    if (!page.success) throw cloudModelError(signal.aborted ? 'REQUEST_TIMEOUT' : 'CLOUD_MODEL_INVALID_RESPONSE')
    const result = page.data
    const entries = protocol === 'google-native' || protocol === 'ollama' ? result.models : result.data
    if (!entries) throw cloudModelError('CLOUD_MODEL_INVALID_RESPONSE')
    for (const entry of entries) {
      if (protocol === 'google-native' && (!Array.isArray(entry.supportedGenerationMethods) || !entry.supportedGenerationMethods.includes('generateContent'))) continue
      const id = 'id' in entry ? entry.id : entry.name
      const parsed = remoteModel.safeParse({ ...entry, id: protocol === 'google-native' && typeof id === 'string' ? id.replace(/^models\//, '') : id })
      if (!parsed.success) continue
      const { id: modelId, inputTokenLimit, outputTokenLimit } = parsed.data
      models.set(modelId, { id: modelId, contextWindow: inputTokenLimit, maxOutputTokens: outputTokenLimit })
    }
    if (protocol === 'google-native' && result.nextPageToken) url.searchParams.set('pageToken', result.nextPageToken)
    else if (protocol === 'anthropic' && result.has_more && result.last_id) url.searchParams.set('after_id', result.last_id)
    else break
  }
  return [...models.values()]
}
