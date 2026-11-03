import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { normalizeModelBinding } from '../shared/model-gateway'
import { MIMO_TTS_BINDING, MIMO_TTS_MODEL } from '../shared/settings'
import type { SessionConfig } from '../shared/contracts'
import type { BackendSupervisor } from './backend-supervisor'
import { GatewayWorkerError } from './model-gateway-worker'
import type { GatewayWorkerResult } from './model-gateway-worker'

const catalog = z.object({ models: z.array(z.object({
  model_id: z.string(), enabled: z.boolean(), operations: z.array(z.string()),
})) })
const result = z.object({ text: z.string(), audio: z.string().optional(), voices: z.array(z.string()).optional() })
const operations = { asr: 'transcribe', mt: 'translate', tts: 'synthesize' } as const
type BackendConnection = Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader'>
export interface BackendInferenceOptions { batchAsr?: boolean; mp3?: boolean; inspect?: boolean }
const CLOUD_MT_MODELS = ['google', 'microsoft', 'mymemory', 'index-translate'] as const
export function backendCloudMt(binding: string) {
  return binding.startsWith('mt-custom:') && binding !== 'mt-custom:legacy-fallback' ? 'custom-mt'
    : CLOUD_MT_MODELS.find(model => binding === `cloud:${model}`)
}

export function backendCloudAsr(binding: string) {
  return binding === 'cloud:aliyun' ? 'aliyun' : binding === 'cloud:minimax' ? 'minimax' : undefined
}

export function backendAsrHeaders(options: SessionConfig['recognitionOptions']): Record<string, string> {
  if (!options?.apiKey) return {}
  return {
    'x-nola-asr-key': options.apiKey,
    ...(options?.model ? { 'x-nola-asr-model': options.model } : {}),
    ...(options?.region ? { 'x-nola-asr-region': options.region } : {}),
    ...(options?.workspaceId ? { 'x-nola-asr-workspace': options.workspaceId } : {}),
    ...(options?.endpoint ? { 'x-nola-asr-endpoint': options.endpoint } : {}),
  }
}

export function backendMtHeaders(translation: SessionConfig['translationOptions'], prefix = 'x-nola-provider-'): Record<string, string> {
  if (!translation) return {}
  const { apiKey, endpoint, region, email, model, apiFormat, contextWindow, maxOutputTokens } = translation
  return {
    ...(apiKey ? { [prefix + 'key']: apiKey } : {}),
    ...(endpoint ? { [prefix + 'endpoint']: endpoint } : {}),
    ...(region ? { [prefix + 'region']: region } : {}),
    ...(email ? { [prefix + 'email']: email } : {}),
    ...(model ? { [prefix + 'model']: model } : {}),
    ...(apiFormat ? { [prefix + 'api-format']: apiFormat } : {}),
    ...(contextWindow ? { [prefix + 'context-window']: String(contextWindow) } : {}),
    ...(maxOutputTokens ? { [prefix + 'max-output-tokens']: String(maxOutputTokens) } : {}),
  }
}

export async function openBackendAsrStream(
  backend: BackendConnection,
  binding: string,
  signal: AbortSignal,
  emit: (event: GatewayWorkerResult) => void,
  headers: Record<string, string>,
) {
  signal.throwIfAborted()
  const url = new URL('/api/v2/gateway/asr-stream', backend.baseUrl)
  url.protocol = 'ws:'
  url.searchParams.set('model', backendCloudAsr(binding) ?? binding.slice('resource:'.length))
  const socket = new WebSocket(url, { headers: { ...backend.authorizationHeader(), ...headers }, handshakeTimeout: 10_000, maxPayload: 1024 * 1024 })
  let pending: { op: string; resolve: () => void; reject: (error: Error) => void } | undefined
  const unavailable = () => new GatewayWorkerError('network_unavailable', 'Realtime recognition disconnected')
  const close = () => socket.terminate()
  const closed = new Promise<void>(resolve => { socket.once('close', () => resolve()) })
  signal.addEventListener('abort', close, { once: true })
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('close', () => {
      signal.removeEventListener('abort', close)
      reject(unavailable())
      pending?.reject(unavailable())
      pending = undefined
    })
    socket.on('error', () => { reject(unavailable()); close() })
  })
  const frame = z.object({ ack: z.string().optional(), event: z.record(z.string(), z.unknown()).optional() })
  socket.on('message', raw => {
    try {
      const value = frame.parse(JSON.parse(raw.toString()))
      if (value.event) emit(value.event)
      else if (pending && value.ack === pending.op) {
        const ack = pending
        pending = undefined
        ack.resolve()
      } else close()
    } catch { close() }
  })
  await ready
  return { close, closed, request: (payload: GatewayWorkerResult) => new Promise<void>((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN || pending) { reject(unavailable()); return }
    pending = { op: String(payload.op), resolve, reject }
    socket.send(JSON.stringify(payload), error => { if (error) close() })
  }) }
}

export async function openBackendLanguageModel(backend: BackendConnection, model: string, signal: AbortSignal) {
  const headers = backend.authorizationHeader()
  const list = await fetch(new URL('/api/v2/gateway/capabilities', backend.baseUrl), { headers, signal })
  if (!list.ok) throw new Error('Realtime model catalog is unavailable')
  if (!catalog.parse(await list.json()).models.some(entry =>
    entry.enabled && entry.model_id === `llm:${model}` && entry.operations.includes('generate'))) return
  const leaseId = randomUUID()
  const release = async () => {
    await fetch(new URL(`/api/v2/gateway/language-models/${leaseId}`, backend.baseUrl), {
      method: 'DELETE', headers, signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }
  const schema = z.object({ lease_id: z.literal(leaseId), endpoint: z.url(), context_window: z.number().int().min(512).max(32768) })
  let lease: z.infer<typeof schema>
  try {
    const response = await fetch(new URL('/api/v2/gateway/language-models', backend.baseUrl), {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ model, lease_id: leaseId }),
    })
    if (!response.ok) throw new Error('Realtime language model is unavailable')
    lease = schema.parse(await response.json())
  } catch (error) {
    await release()
    throw error
  }
  const endpoint = new URL(lease.endpoint)
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port
      || endpoint.pathname !== '/v1' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || signal.aborted) {
    await release()
    signal.throwIfAborted()
    throw new Error('Invalid realtime language model endpoint')
  }
  return { endpoint: endpoint.href, contextWindow: lease.context_window, release }
}

export async function inferBackendModel(
  backend: BackendConnection,
  request: DirectModelRequest,
  signal: AbortSignal,
  options?: BackendInferenceOptions,
  ttsApiKey?: string,
  translation?: SessionConfig['translationOptions'],
  recognition?: Record<string, string>,
): Promise<DirectModelResult | undefined> {
  const binding = normalizeModelBinding(request.kind, request.model)
  const mimo = request.kind === 'tts' && binding === MIMO_TTS_BINDING
  const cloudMt = request.kind === 'mt' ? backendCloudMt(binding) : undefined
  const cloudAsr = request.kind === 'asr' ? backendCloudAsr(binding) : undefined
  if ((!mimo && !cloudMt && !cloudAsr && !binding.startsWith('resource:')) || request.image || (mimo && !ttsApiKey) || (cloudAsr && !recognition?.['x-nola-asr-key'])) return
  const model = mimo ? MIMO_TTS_MODEL : cloudAsr ?? cloudMt ?? binding.slice('resource:'.length)
  const headers = backend.authorizationHeader()
  const list = await fetch(new URL('/api/v2/gateway/capabilities', backend.baseUrl), { headers, signal })
  if (!list.ok) throw new Error('Realtime model catalog is unavailable')
  if (!catalog.parse(await list.json()).models.some(entry =>
    entry.enabled && entry.model_id === model && entry.operations.includes(operations[request.kind]))) return

  const { kind, id } = request
  const audio = request.audio?.startsWith('data:') ? request.audio : `data:audio/wav;base64,${request.audio ?? ''}`
  const inspect = kind === 'tts' && options?.inspect
  const parameters = inspect ? {} : kind === 'asr'
    ? { audio, source: request.source, batch: options?.batchAsr }
    : kind === 'mt'
      ? { text: request.text, source: request.source, target: request.target }
      : { text: request.text, voice: request.voice, response_format: options?.mp3 ? 'mp3' : undefined }
  const response = await fetch(new URL('/api/v2/gateway/infer', backend.baseUrl), {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(mimo && ttsApiKey ? { 'x-nola-tts-key': ttsApiKey } : {}),
      ...(cloudAsr ? recognition : {}),
      ...(cloudMt ? backendMtHeaders(translation) : {}),
    }, signal,
    body: JSON.stringify({ id, model, kind: inspect ? 'tts-voices' : kind, ...parameters }),
  })
  if (!response.ok) {
    if (response.status === 400) throw new GatewayWorkerError('invalid_request', 'Invalid inference input')
    const failure = z.object({ error: z.object({ code: z.string(), provider_code: z.string().nullish() }) }).safeParse(await response.json())
    const code = failure.success ? failure.data.error.provider_code : undefined
    if (code === 'authentication_failed' || code === 'rate_limited' || code === 'request_timeout' || code === 'network_unavailable') {
      throw new GatewayWorkerError(code, 'Inference provider unavailable')
    }
    throw new Error(failure.success ? failure.data.error.code : 'Realtime inference failed')
  }
  return result.parse(await response.json())
}
