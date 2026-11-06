import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { gatewayConcurrency, normalizeModelBinding } from '../shared/model-gateway'
import { MIMO_TTS_BINDING, MIMO_TTS_MODEL } from '../shared/settings'
import type { ResourceRecord, SessionConfig } from '../shared/contracts'
import type { BackendSupervisor } from './backend-supervisor'
import { GatewayWorkerError } from './model-gateway-worker'
import type { GatewayWorkerResult } from './model-gateway-worker'
import { backendError, backendFailure, readBackendFailure } from './backend-error'
import { resourceSchema } from '../shared/schemas'
import type { AppSettings } from '../shared/settings'
import { screenAppearanceSchema, type ScreenOcrRequest, type ScreenOcrResult, type ScreenOcrStatus } from '../shared/screen-translation'
import { resolveModelNetwork } from './network-region'

const catalog = z.object({ models: z.array(z.object({
  model_id: z.string(), enabled: z.boolean(), operations: z.array(z.string()),
})) })
const result = z.object({ text: z.string(), audio: z.string().optional(), voices: z.array(z.string()).optional() })
const operations = { asr: 'transcribe', mt: 'translate', tts: 'synthesize' } as const
type BackendConnection = Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader'>
export class BackendModelError extends Error {
  constructor(readonly status: number, readonly engineCode: string, readonly correlationId?: string) {
    super(engineCode)
  }
}

async function rejectBackendModel(response: Response): Promise<never> {
  throw backendModelFailure(response.status, await readBackendFailure(response))
}

function backendModelFailure(status: number, failure?: z.infer<typeof backendError>): Error {
  const provider = failure?.provider_code
  if (provider === 'authentication_failed') return new GatewayWorkerError(provider, 'The model provider rejected its credentials')
  if (provider === 'rate_limited') return new GatewayWorkerError(provider, 'The model provider rate limit was reached')
  if (provider === 'network_unavailable') return new GatewayWorkerError(provider, 'Could not reach the model provider')
  if (provider === 'request_timeout' || failure?.message_key === 'gateway.TIMEOUT') {
    return new GatewayWorkerError('request_timeout', 'The model request timed out')
  }
  if (status === 400) return new GatewayWorkerError('invalid_request', 'Invalid inference input')
  if (failure) return new BackendModelError(status, backendFailure(failure).message, failure.correlation_id)
  return new BackendModelError(status, 'engineTransportUnavailable')
}

export interface BackendInferenceOptions { batchAsr?: boolean; mp3?: boolean; inspect?: boolean; concurrency?: number }
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
  let failure: Error | undefined
  const unavailable = () => new GatewayWorkerError('network_unavailable', 'Realtime recognition disconnected')
  const close = () => socket.terminate()
  const closed = new Promise<Error | void>(resolve => { socket.once('close', () => resolve(failure)) })
  signal.addEventListener('abort', close, { once: true })
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('close', () => {
      signal.removeEventListener('abort', close)
      reject(unavailable())
      pending?.reject(failure ?? unavailable())
      pending = undefined
    })
    socket.on('error', () => { reject(unavailable()); close() })
  })
  const frame = z.object({
    ack: z.string().optional(), event: z.record(z.string(), z.unknown()).optional(),
    error: backendError.optional(), status: z.number().int().min(400).max(599).optional(),
  })
  socket.on('message', raw => {
    try {
      const value = frame.parse(JSON.parse(raw.toString()))
      if (value.error) {
        failure = backendModelFailure(value.status ?? 500, value.error)
        const rejected = pending
        pending = undefined
        rejected?.reject(failure)
      } else if (value.event) emit(value.event)
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

export async function openBackendLanguageModel(backend: BackendConnection, model: string, signal: AbortSignal, concurrency = 1) {
  const headers = backend.authorizationHeader()
  const list = await fetch(new URL('/api/v2/gateway/capabilities', backend.baseUrl), { headers, signal })
  if (!list.ok) return rejectBackendModel(list)
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
      body: JSON.stringify({ model, lease_id: leaseId, max_concurrency: concurrency }),
    })
    if (!response.ok) await rejectBackendModel(response)
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
  if (!list.ok) return rejectBackendModel(list)
  if (!catalog.parse(await list.json()).models.some(entry =>
    entry.enabled && entry.model_id === model && entry.operations.includes(operations[request.kind]))) return

  const { kind, id } = request
  const audio = request.audio?.startsWith('data:') ? request.audio : `data:audio/wav;base64,${request.audio ?? ''}`
  const inspect = kind === 'tts' && options?.inspect
  const parameters = inspect ? {} : kind === 'asr'
    ? { audio, source: request.source, batch: options?.batchAsr }
    : kind === 'mt'
      ? { text: request.text, source: request.source, target: request.target, ...(request.glossary?.length ? { glossary: request.glossary } : {}) }
      : { text: request.text, voice: request.voice, response_format: options?.mp3 ? 'mp3' : undefined }
  const response = await fetch(new URL('/api/v2/gateway/infer', backend.baseUrl), {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...(mimo && ttsApiKey ? { 'x-nola-tts-key': ttsApiKey } : {}),
      ...(cloudAsr ? recognition : {}),
      ...(cloudMt ? backendMtHeaders(translation) : {}),
    }, signal,
    body: JSON.stringify({ id, model, kind: inspect ? 'tts-voices' : kind,
      task_mode: request.taskMode ?? 'offline', max_concurrency: options?.concurrency ?? 1, ...parameters }),
  })
  if (!response.ok) return rejectBackendModel(response)
  return result.parse(await response.json())
}


const screenOcrResult = z.object({ width: z.number().positive(), height: z.number().positive(), blocks: z.array(z.object({
  id: z.union([z.string(), z.number()]).transform(String), text: z.string().max(64000), confidence: z.number().min(0).max(1),
  quad: z.array(z.tuple([z.number().finite(), z.number().finite()])).length(4),
  appearance: screenAppearanceSchema.optional(),
})).max(2048) })
const screenOcrStatus = z.object({ installed: z.boolean(), state: z.string(),
  progress: z.number().nullish().transform(value => value ?? undefined), error: z.string().nullish().transform(value => value ?? undefined),
  languages: z.array(z.string()).optional(),
  resource: z.preprocess(value => value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null)) : value, resourceSchema).optional(),
})

/** Model management owns installation; Model Gateway alone loads and releases OCR weights. */
export class BackendScreenOcr {
  private poll?: NodeJS.Timeout
  private polling = false
  private disposed = false
  private readonly current = new Map<string, ScreenOcrStatus>()
  private activeResource = 'pp-ocrv5-mobile-onnx'
  constructor(private readonly options: {
    backend(): BackendSupervisor | undefined
    ensureBackend(): Promise<unknown>
    settings(): AppSettings
    changed(resource: ResourceRecord): void
  }) {}

  private async request(path = '', method = 'GET', body?: unknown, signal?: AbortSignal, resourceId = 'pp-ocrv5-mobile-onnx'): Promise<unknown> {
    await this.options.ensureBackend()
    const backend = this.options.backend()
    if (!backend?.ready) throw new Error('backendUnavailable')
    const response = await fetch(new URL(`/api/v2/screen/ocr${path}${this.query(resourceId)}`, backend.baseUrl), {
      method, headers: { ...backend.authorizationHeader(), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { detail?: unknown } | null
      const detail = failure?.detail
      const errors: Record<string, string> = { resourceBusy: 'resourceBusy', modelMissing: 'ocrMissing',
        modelCorrupt: 'ocrCorrupt', runtimeUnavailable: 'ocrRuntimeUnavailable', modelNotLoaded: 'ocrNotReady' }
      throw new Error(typeof detail === 'string' ? errors[detail] ?? 'ocrFailed' : 'ocrFailed')
    }
    return response.json()
  }

  private query(resourceId: string): string {
    return resourceId === 'pp-ocrv5-mobile-onnx' ? '' : `?resource_id=${encodeURIComponent(resourceId)}`
  }
  async status(resourceId = 'pp-ocrv5-mobile-onnx'): Promise<ScreenOcrStatus> {
    const status = screenOcrStatus.parse(await this.request('', 'GET', undefined, undefined, resourceId))
    if (this.disposed) return status
    this.current.set(resourceId, status)
    if (status.resource) this.options.changed(status.resource)
    this.schedulePoll()
    return status
  }
  private schedulePoll(): void {
    const pending = [...this.current].filter(([, status]) => status.state === 'running' || status.state === 'cancelling')
    if (this.disposed || this.poll || this.polling || !pending.length) return
    this.poll = setTimeout(() => {
      this.poll = undefined; this.polling = true
      void Promise.all(pending.map(async ([id]) => {
        try { await this.status(id) }
        catch {
          const resource = this.current.get(id)?.resource
          if (resource && !this.disposed) this.options.changed({ ...resource,
            state: 'failed', phase: undefined, errorCode: 'backendUnavailable', cancellable: false })
          this.current.delete(id)
        }
      })).finally(() => { this.polling = false; this.schedulePoll() })
    }, 1000)
    this.poll.unref()
  }
  async install(resourceId = 'pp-ocrv5-mobile-onnx'): Promise<ScreenOcrStatus> {
    await this.request('/install', 'POST', { network: await resolveModelNetwork(this.options.settings().network) }, undefined, resourceId)
    return this.status(resourceId)
  }
  async cancel(resourceId = 'pp-ocrv5-mobile-onnx'): Promise<ScreenOcrStatus> { await this.request('/install', 'DELETE', undefined, undefined, resourceId); return this.status(resourceId) }
  async remove(resourceId = 'pp-ocrv5-mobile-onnx'): Promise<ScreenOcrStatus> { await this.request('', 'DELETE', undefined, undefined, resourceId); return this.status(resourceId) }
  async load(resourceId = 'pp-ocrv5-mobile-onnx'): Promise<void> { this.activeResource = resourceId; await this.request('/load', 'POST', undefined, undefined, resourceId) }
  async release(): Promise<void> {
    // Shutdown must not restart a backend that has already exited.
    const backend = this.options.backend()
    if (!backend?.ready) return
    const response = await fetch(new URL(`/api/v2/screen/ocr/release${this.query(this.activeResource)}`, backend.baseUrl), {
      method: 'POST', headers: backend.authorizationHeader(), signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error('ocrFailed')
  }
  async infer(request: ScreenOcrRequest, signal: AbortSignal): Promise<ScreenOcrResult> {
    const { taskMode = 'realtime', ...payload } = request
    const concurrency = gatewayConcurrency(`resource:${this.activeResource}`, this.options.settings().modelGateway.concurrency?.ocr)
    return screenOcrResult.parse(await this.request('', 'POST', { ...payload, task_mode: taskMode,
      max_concurrency: taskMode === 'realtime' ? 1 : concurrency }, signal, this.activeResource))
  }
  dispose(): void { this.disposed = true; if (this.poll) clearTimeout(this.poll); this.poll = undefined }
}
