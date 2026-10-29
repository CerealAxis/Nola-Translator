import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import type { ResourceRecord, SessionConfig } from '../shared/contracts'
import { defaultModelBinding, isModelEnabled, mergeModelPolicy, sceneModelBinding } from '../shared/model-policy'
import { buildConfiguredCloudModels } from '../shared/model-availability'
import { legacyFallbackReady } from '../shared/cloud-models'
import { configurationOf, recognitionLanguages } from '../shared/model-capabilities'
import { recognitionBindingOf, translationBindingOf } from './session-controller'
import { fallbackTranslationFieldsOf, recognitionFieldsOf, supportsRecognitionNativeTranslation, translationOptionsFor, translationOptionsOf } from '../shared/cloud-config'
import { INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../shared/index-translate'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import type { AppSettings, AppSettingsPatch, CredentialProvider, TranslationProvider } from '../shared/settings'
import { DEFAULT_MODEL_GATEWAY, bindingIsLocal, modelGatewaySettingsSchema, normalizeModelBinding, type AvailableGatewayModel, type GatewayCapability, type GatewayRequestSnapshot, type ModelGatewaySettings, type ModelGatewaySnapshot } from '../shared/model-gateway'
import type { EngineLaunchSpec } from './engine-process'
import { createGatewayWorker, GatewayWorkerError, type GatewayWorker, type GatewayWorkerFactory, type GatewayWorkerResult } from './model-gateway-worker'
import { GatewayInternalServer, type GatewayCapabilityLease } from './gateway-internal-server'
import { createGatewayLanguageModel, type GatewayLanguageModel } from './gateway-language-model'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import type { DirectModelServices } from './direct-model'
import { gatewayChat } from './gateway-chat'
import { ZodError } from 'zod'

const WORKER_KINDS = ['asr', 'mt', 'tts'] as const
type WorkerKind = typeof WORKER_KINDS[number]
const KINDS: GatewayCapability[] = [...WORKER_KINDS, 'llm']
const RESOURCE_KIND = { asr: 'recognitionModel', mt: 'translationModel', tts: 'ttsModel' } as const
const MAX_BODY = 24 * 1024 * 1024
const MAX_TEXT = 64_000
/** A cloud instance costs no weights, so it is kept warm for a while after its last request. */
const LAZY_IDLE_MS = 10 * 60_000
interface WorkerSlot {
  worker: GatewayWorker
  kind: WorkerKind
  binding: string
  signature: string
  refs: number
  retired: boolean
  resources: string[]
  lazy: boolean
  idle?: ReturnType<typeof setTimeout>
}
interface WorkerPlan {
  name: string
  resourceId?: string
  workerConfig: GatewayWorkerResult
  fallbackConfig?: GatewayWorkerResult
  fallbackResourceId?: string
  fallbackUsesPrimary: boolean
  signature: string
}
export interface ModelGatewayOptions {
  getSettings(): AppSettings
  directLaunch(model: string): Promise<EngineLaunchSpec>
  listResources(): Promise<ResourceRecord[]>
  getCredential?(provider: CredentialProvider): Promise<string>
  getKey(): Promise<string>
  setKey(value: string): Promise<void>
  onChanged?(snapshot: ModelGatewaySnapshot): void
  createWorker?: GatewayWorkerFactory
  createLanguageModel?: typeof createGatewayLanguageModel
}
class GatewayError extends Error { constructor(readonly status: number, message: string, readonly code = 'invalid_request_error') { super(message) } }
const clientError = (error: unknown): unknown => {
  if (!(error instanceof GatewayWorkerError)) return error
  const status = { invalid_request: 400, authentication_failed: 502, rate_limited: 429, network_unavailable: 503, request_timeout: 504, out_of_memory: 503, inference_failed: 500 }[error.code]
  return new GatewayError(status, error.message, error.code)
}
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function text(value: unknown, name: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GatewayError(400, `Invalid ${name}`)
  return value
}
const isCloudRecognition = (binding: string): boolean => binding === 'cloud:aliyun' || binding === 'cloud:minimax'
const cloudTranslationProvider = (binding: string): TranslationProvider | undefined => {
  if (!binding.startsWith('cloud:')) return undefined
  const provider = binding.slice(6)
  return ['microsoft', 'google', 'mymemory', 'index-translate', 'recognition'].includes(provider) ? provider as TranslationProvider : undefined
}

/**
 * One authenticated listener per capability binding.
 *
 * The gateway page binds exactly one model per capability, which is loaded eagerly and owns the
 * public `nola-*` id. Business consumers may instead name a configured cloud interface: those
 * instances carry no weights, so they are created on first use and retired after an idle period.
 * A local model that the gateway has not loaded is never started on demand, because that would
 * allocate memory nobody asked for.
 */
export class ModelGateway {
  private state: ModelGatewaySnapshot['state'] = 'stopped'
  private error?: string
  private server?: Server
  private webSockets?: WebSocketServer
  private readonly sockets = new Set<Socket>()
  private readonly clients = new Set<WebSocket>()
  private readonly controllers = new Set<AbortController>()
  private readonly slots = new Map<string, WorkerSlot>()
  private readonly retiring = new Set<WorkerSlot>()
  private readonly eager = new Map<WorkerKind, string>()
  private readonly creating = new Map<string, Promise<WorkerSlot>>()
  private services: ModelGatewaySnapshot['services'] = { asr: { state: 'stopped', model: '', name: '' }, mt: { state: 'stopped', model: '', name: '' }, tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' } }
  private internal?: GatewayInternalServer
  private internalStarting?: Promise<void>
  private cloudCatalog: Record<GatewayCapability, AvailableGatewayModel[]> = { asr: [], mt: [], tts: [], llm: [] }
  private inventory: ResourceRecord[] = []
  private readonly cloudLanguageLeases = new Set<() => void>()
  private readonly cloudLanguageControllers = new Set<AbortController>()
  private readonly cloudLanguageClosing = new Set<Promise<void>>()
  private externalEnabled = true
  private llm?: { runtime: GatewayLanguageModel; signature: string; refs: number; retired: boolean; controller: AbortController }
  private readonly retiredLanguageModels = new Set<NonNullable<ModelGateway['llm']>>()
  private loadingLanguageModel?: AbortController
  private readonly requests: GatewayRequestSnapshot[] = []
  private key = ''
  private keyLoading?: Promise<string>
  private readonly tickets = new Map<string, number>()
  private lifecycle: Promise<unknown> = Promise.resolve()
  private host = DEFAULT_MODEL_GATEWAY.host
  private port = DEFAULT_MODEL_GATEWAY.port
  private stopping = false
  private stopVersion = 0

  constructor(private readonly options: ModelGatewayOptions) {}

  sessionEnvironment(): NodeJS.ProcessEnv { return this.internal?.environment() ?? (() => { throw new Error('Start the required capabilities in Model Gateway') })() }

  /**
   * Fail before spawning a business process when a capability the session needs is not ready.
   * `native` means the ASR service itself translates, so no text translation model is involved.
   */
  requireCapabilities(translation: boolean, native = false): void {
    if (this.state !== 'running' || this.services.asr.state !== 'ready') throw new Error('ASR service is not ready. Start it in Model Gateway.')
    if (!translation) return
    if (native) {
      if (!this.services.asr.nativeTranslation) throw new Error('The active ASR service does not provide native translation')
    } else if (this.services.mt.state !== 'ready') throw new Error('MT service is not ready. Start it in Model Gateway.')
  }

  resourceInUse(resourceId: string): boolean {
    return [...this.slots.values(), ...this.retiring].some(slot => slot.resources.includes(resourceId) || slot.binding === `resource:${resourceId}`)
      || [...this.retiredLanguageModels, ...(this.llm ? [this.llm] : [])].some(slot => slot.runtime.profile.id === `resource:${resourceId}`)
  }

  /** Reject disruptive edits before settings are persisted; leases keep running calls pinned. */
  assertSettingsChange(patch: AppSettingsPatch): void {
    const settings = this.options.getSettings()
    for (const kind of KINDS) {
      const binding = this.services[kind].model
      const slot = kind === 'llm' ? this.llm : this.slots.get(`${kind}:${binding}`)
      if (!slot?.refs || !bindingIsLocal(binding)) continue
      const changed = patch.modelGateway?.[`${kind}Model`] ?? (!settings.modelGateway[`${kind}Model`] ? patch.modelPolicy?.defaults[kind] : undefined)
      const disabled = patch.modelPolicy && !isModelEnabled({ ...settings, modelPolicy: mergeModelPolicy(settings, patch.modelPolicy) }, kind, binding)
      if (disabled || patch.compute || patch.modelGateway?.[kind] === false || changed !== undefined && normalizeModelBinding(kind, changed) !== binding) throw new GatewayError(409, 'RESOURCE_IN_USE', 'resource_in_use')
    }
  }

  async leaseCapability(kind: WorkerKind, binding?: string): Promise<GatewayCapabilityLease> {
    const slot = await this.ensureSlot(kind, normalizeModelBinding(kind, binding))
    slot.refs++; this.clearIdle(slot)
    let entry: GatewayRequestSnapshot
    try { entry = this.begin(kind, slot.binding) }
    catch (error) { this.unhold(slot); throw error }
    let released = false
    return { worker: slot.worker, model: slot.binding, release: error => {
      if (released) return
      released = true; this.finish(entry, error); this.unhold(slot)
    } }
  }

  async infer(request: DirectModelRequest, signal: AbortSignal, inspect = false): Promise<DirectModelResult> {
    const kind = request.kind as WorkerKind
    const slot = await this.ensureSlot(kind, normalizeModelBinding(kind, request.model))
    if (inspect) return { text: '', voices: this.voicesOf(slot) }
    const entry = this.begin(kind, slot.binding)
    slot.refs++
    this.clearIdle(slot)
    try {
      const result = await slot.worker.request({ ...request, op: 'infer',
        audio: request.audio?.replace(/^data:audio\/wav;base64,/, ''), response_format: 'wav' }, signal)
      this.finish(entry)
      return result as unknown as DirectModelResult
    } catch (error) {
      this.finish(entry, error, signal.aborted)
      throw error
    } finally {
      if (entry.status === 'running') this.finish(entry)
      this.unhold(slot)
    }
  }

  private voicesOf(slot: WorkerSlot): string[] {
    const eager = this.eager.get(slot.kind)
    return eager === slot.binding ? this.services[slot.kind].voices ?? [] : []
  }

  languageModel(binding?: string) {
    const slot = this.llm
    if (!slot || this.services.llm.state !== 'ready') throw new Error('LLM service is not ready. Start it in Model Gateway.')
    const wanted = normalizeModelBinding('llm', binding ?? '')
    if (wanted && wanted !== this.services.llm.model) throw new Error('Select the LLM service enabled in Model Gateway')
    const entry = this.begin('llm', this.services.llm.model)
    slot.refs++
    let released = false
    return { ...slot.runtime, signal: slot.controller.signal, release: (error?: unknown) => {
      if (released) return
      released = true; slot.refs--; this.finish(entry, error)
      if (slot.retired && !slot.refs) { this.retiredLanguageModels.delete(slot); void slot.runtime.close() }
    } }
  }

  snapshot(): ModelGatewaySnapshot {
    return { state: this.state, address: `http://${this.host}:${this.port}/v1`, port: this.port, connections: this.clients.size,
      activeRequests: this.requests.filter(request => request.status === 'running').length,
      services: structuredClone(this.services), availableModels: this.availableModels(), requests: this.requests.map(request => ({ ...request })), ...(this.error ? { error: this.error } : {}) }
  }
  private availableModels(): Record<GatewayCapability, AvailableGatewayModel[]> {
    const settings = this.options.getSettings()
    const selectedAsr = sceneModelBinding(settings, 'asr')
    const effectiveAsr = this.cloudCatalog.asr.some(model => model.binding === selectedAsr && isModelEnabled(settings, 'asr', model.binding))
      ? selectedAsr : this.services.asr.state === 'ready' ? this.services.asr.model : selectedAsr
    const nativeTranslation = effectiveAsr === 'cloud:aliyun'
      ? supportsRecognitionNativeTranslation({ ...settings.recognition, provider: 'aliyun' })
      : bindingIsLocal(effectiveAsr) && this.services.asr.nativeTranslation === true
    return Object.fromEntries(KINDS.map(kind => {
      const service = this.services[kind]
      const local: AvailableGatewayModel[] = []
      if (this.state === 'running' && service.state === 'ready' && bindingIsLocal(service.model) && isModelEnabled(settings, kind, service.model)) {
        const resource = this.inventory.find(item => `resource:${item.resourceId}` === service.model)
        const configuration = resource && configurationOf(resource)
        local.push({ binding: service.model, name: service.name, kind, origin: 'gateway', free: true,
          images: [...INDEX_TRANSLATE_MODEL_IDS, ...INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS].some(id => `resource:${id}` === service.model),
          ...(configuration ? { sourceLanguages: kind === 'asr' ? recognitionLanguages(resource!) : configuration.sourceLanguages, targetLanguages: configuration.targetLanguages } : {}) })
      }
      return [kind, [...local, ...this.cloudCatalog[kind].filter(model => isModelEnabled(settings, kind, model.binding) && (model.binding !== 'cloud:recognition' || nativeTranslation))]]
    })) as Record<GatewayCapability, AvailableGatewayModel[]>
  }
  async snapshotWithCatalog(): Promise<ModelGatewaySnapshot> {
    const settings = this.options.getSettings()
    const credentials = await this.credentialPresence(settings)
    // A settings update wins over a slow credential read. Its next refresh supplies the new catalog.
    if (JSON.stringify(settings) === JSON.stringify(this.options.getSettings())) this.cloudCatalog = buildConfiguredCloudModels(settings, credentials)
    return this.snapshot()
  }
  private async credentialPresence(settings: AppSettings): Promise<Record<CredentialProvider, boolean>> {
    const slots: CredentialProvider[] = ['aliyun-asr', 'minimax-asr', 'microsoft', 'google', 'cloud',
      'fallback-cloud', 'fallback-google',
      ...customModelsOf(settings.translation).map(profile => customCredentialSlot(profile.id))]
    return Object.fromEntries(await Promise.all(slots.map(async slot => [slot, !!await this.options.getCredential?.(slot)]))) as Record<CredentialProvider, boolean>
  }
  private changed(): void { this.options.onChanged?.(this.snapshot()) }
  revealKey(): Promise<string> {
    if (this.key) return Promise.resolve(this.key)
    this.keyLoading ??= (async () => {
      this.key = await this.options.getKey()
      if (!this.key) { this.key = this.generateKey(); await this.options.setKey(this.key) }
      return this.key
    })().finally(() => { this.keyLoading = undefined })
    return this.keyLoading
  }
  private generateKey(): string { return 'nola-' + randomBytes(32).toString('base64url') }
  async rotateKey(): Promise<string> {
    await this.revealKey()
    const key = this.generateKey(); await this.options.setKey(key); this.key = key
    this.tickets.clear()
    for (const client of this.clients) client.close(1008, 'API key rotated')
    return key
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.lifecycle.catch(() => undefined).then(operation); this.lifecycle = task; return task
  }
  start(): Promise<ModelGatewaySnapshot> { const version = this.stopVersion; return this.serialize(() => this.startInternal(version)) }
  reconfigure(): Promise<ModelGatewaySnapshot> { return this.serialize(async () => {
    if (this.state !== 'running') return this.snapshot()
    const settings = modelGatewaySettingsSchema.parse(this.options.getSettings().modelGateway)
    if (settings.host !== this.host || settings.port !== this.port || (settings.externalEnabled !== false) !== this.externalEnabled) {
      await this.stopListener()
      this.host = settings.host; this.port = settings.port; this.externalEnabled = settings.externalEnabled !== false
      if (this.externalEnabled) await this.startListener()
    }
    await this.configureWorkers(); return this.snapshot()
  }) }
  stop(): Promise<ModelGatewaySnapshot> {
    // Abort immediately even if startup is waiting on a cold model load.
    this.stopping = true
    this.stopVersion++
    this.loadingLanguageModel?.abort()
    for (const slot of this.slots.values()) if (bindingIsLocal(slot.binding)) void slot.worker.close()
    return this.serialize(() => this.stopInternal())
  }
  async dispose(): Promise<void> {
    for (const controller of this.cloudLanguageControllers) controller.abort()
    for (const release of this.cloudLanguageLeases) release()
    await Promise.all(this.cloudLanguageClosing)
    await this.stop()
    await this.internalStarting
    await this.internal?.close()
    this.internal = undefined
    await Promise.all([...this.slots.values()].map(slot => this.closeSlot(slot)))
    this.slots.clear()
  }

  /** Cloud calls share a private transport even when local loading and public API are stopped. */
  private async ensureInternal(): Promise<void> {
    if (this.internalStarting) return this.internalStarting
    if (this.internal) return
    const internal = new GatewayInternalServer({ snapshot: () => this.snapshot(), acquire: (kind, binding) => this.leaseCapability(kind, binding) })
    this.internalStarting = internal.start().then(() => { this.internal = internal }).finally(() => { this.internalStarting = undefined })
    return this.internalStarting
  }

  async prepareSession(config: SessionConfig): Promise<void> {
    await this.ensureInternal()
    const resolveLocal = (kind: 'asr' | 'mt', binding: string): string => {
      if (!bindingIsLocal(binding)) return binding
      const service = this.services[kind]
      if (this.state === 'running' && service.state === 'ready' && bindingIsLocal(service.model) && isModelEnabled(this.options.getSettings(), kind, service.model)) return service.model
      throw new GatewayError(503, 'The selected local model is not loaded in Model Gateway.', 'model_not_loaded')
    }
    const asrBinding = resolveLocal('asr', normalizeModelBinding('asr', config.recognitionBinding || recognitionBindingOf(config)))
    config.recognitionBinding = asrBinding
    if (bindingIsLocal(asrBinding)) { config.recognitionProvider = 'local'; config.recognitionModelId = asrBinding.slice(9) }
    else config.recognitionProvider = asrBinding.slice(6) as SessionConfig['recognitionProvider']
    const asr = await this.ensureSlot('asr', asrBinding)
    if (!config.targetLanguages.length) return
    const mtBinding = resolveLocal('mt', normalizeModelBinding('mt', config.translationBinding || (config.translationProvider === 'recognition' ? 'cloud:recognition' : translationBindingOf(config, this.options.getSettings()))))
    config.translationBinding = mtBinding
    if (mtBinding === 'cloud:recognition') config.translationProvider = 'recognition'
    else if (bindingIsLocal(mtBinding)) { config.translationProvider = 'local'; config.translationModelId = mtBinding.slice(9) }
    else if (mtBinding) config.translationProvider = mtBinding.startsWith('mt-custom:') ? 'cloud' : mtBinding.slice(6) as TranslationProvider
    if (config.translationProvider === 'recognition') {
      if (!isModelEnabled(this.options.getSettings(), 'mt', 'cloud:recognition')) throw new GatewayError(503, 'Enable native translation in Model Management before using it.', 'model_disabled')
      if (!(await asr.worker.ready).nativeTranslation) throw new GatewayError(400, 'The selected ASR model does not support native translation', 'model_unavailable')
      return
    }
    await this.ensureSlot('mt', mtBinding)
  }

  async acquireLanguageModel(binding?: string) {
    const settings = this.options.getSettings()
    const wanted = normalizeModelBinding('llm', binding) || defaultModelBinding(settings, 'llm')
    if (!wanted || !isModelEnabled(settings, 'llm', wanted)) throw new GatewayError(503, 'The language model is not enabled in Model Management', 'model_disabled')
    if (bindingIsLocal(wanted)) return this.languageModel(wanted)
    const controller = new AbortController()
    this.cloudLanguageControllers.add(controller)
    let runtime: GatewayLanguageModel
    try {
      runtime = await (this.options.createLanguageModel ?? createGatewayLanguageModel)({ getSettings: this.options.getSettings,
        directLaunch: this.options.directLaunch, getCredential: provider => this.options.getCredential?.(provider) ?? Promise.resolve('') }, wanted, controller.signal)
      if (controller.signal.aborted) { await runtime.close(); throw new Error('Cloud model initialization cancelled') }
    } catch (error) { this.cloudLanguageControllers.delete(controller); throw error }
    let entry: GatewayRequestSnapshot
    try { entry = this.begin('llm', wanted) }
    catch (error) { this.cloudLanguageControllers.delete(controller); controller.abort(); await runtime.close(); throw error }
    let released = false
    const release = (error?: unknown) => {
      if (released) return
      released = true; this.cloudLanguageLeases.delete(release); this.finish(entry, error); controller.abort()
      this.cloudLanguageControllers.delete(controller)
      const closing = runtime.close().catch(error => console.error('[gateway] cloud language model close failed', error)).finally(() => this.cloudLanguageClosing.delete(closing))
      this.cloudLanguageClosing.add(closing)
    }
    this.cloudLanguageLeases.add(release)
    return { ...runtime, signal: controller.signal, release }
  }

  private async startInternal(version = this.stopVersion): Promise<ModelGatewaySnapshot> {
    if (version !== this.stopVersion) return this.snapshot()
    if (this.state === 'running') return this.snapshot()
    this.stopping = false; this.state = 'starting'; this.error = undefined; this.changed()
    try {
      await this.revealKey()
      const config = modelGatewaySettingsSchema.parse(this.options.getSettings().modelGateway)
      this.host = config.host; this.port = config.port
      this.externalEnabled = config.externalEnabled !== false
      await this.ensureInternal()
      if (this.externalEnabled) await this.startListener()
      await this.configureWorkers()
      if (this.stopping) return this.snapshot()
      this.state = 'running'; this.changed()
    } catch {
      await this.stopInternal(); this.state = 'failed'; this.error = 'Gateway could not start. Check the address, port and installed runtime.'; this.changed()
    }
    return this.snapshot()
  }

  private async startListener(): Promise<void> {
      this.server = createServer((request, response) => { void this.http(request, response) })
      this.server.requestTimeout = 30_000; this.server.headersTimeout = 10_000; this.server.keepAliveTimeout = 5000
      this.server.on('connection', socket => { this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket)) })
      this.webSockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false })
      this.server.on('upgrade', (request, socket, head) => {
        try {
          const ticket = new URL(request.url ?? '/', 'http://localhost').searchParams.get('ticket')
          if (ticket) { const expires = this.tickets.get(ticket) ?? 0; this.tickets.delete(ticket); if (expires < Date.now()) throw new GatewayError(401, 'Invalid realtime ticket') }
          else this.authorize(request)
          if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/v1/realtime') throw new GatewayError(404, 'Unknown endpoint')
          if (this.state !== 'running') throw new GatewayError(503, 'Gateway is loading')
          if (this.clients.size >= 8) throw new GatewayError(429, 'Too many realtime sessions')
          this.webSockets!.handleUpgrade(request, socket, head, client => this.realtime(client, request))
        } catch (error) {
          const status = error instanceof GatewayError ? error.status : 400
          socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
        }
      })
      await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(this.port, this.host, () => { this.server!.removeListener('error', reject); resolve() }) })
      this.server.on('error', () => { this.error = 'Gateway listener failed'; this.state = 'failed'; this.changed(); void this.stop() })
  }

  private async stopListener(): Promise<void> {
    for (const client of this.clients) client.terminate()
    this.clients.clear(); this.tickets.clear()
    this.webSockets?.close(); this.webSockets = undefined
    for (const socket of this.sockets) socket.destroy()
    const server = this.server; this.server = undefined
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  }

  /** The binding a capability had before the gateway owned model selection. */
  private legacyBinding(kind: WorkerKind, settings: AppSettings, nativeFallback: boolean): string {
    if (kind === 'asr') {
      const provider = settings.recognition.provider ?? 'local'
      return provider === 'local' ? `resource:${settings.recognition.modelId}` : `cloud:${provider}`
    }
    if (kind === 'tts') return `resource:${settings.synthesis.modelId}`
    const translation = nativeFallback ? { ...settings.translation, ...settings.translation.fallback } : settings.translation
    const provider = translation.provider
    if (provider === 'local') return `resource:${settings.translation.localModelId}`
    // A native-speech session binds the text backup instead, whose connection and credential live in
    // the fallback configuration rather than the primary one.
    if (nativeFallback) return `native:${provider}`
    if (provider === 'cloud') return `mt-custom:${translation.customModelId || settings.translation.customModelId || 'legacy'}`
    return `cloud:${provider}`
  }

  private bindingFor(kind: WorkerKind, config: ModelGatewaySettings, settings: AppSettings): string {
    const stored = normalizeModelBinding(kind, kind === 'asr' ? config.asrModel : kind === 'mt' ? config.mtModel : config.ttsModel)
    if (stored) return stored
    const nativeFallback = settings.translation.provider === 'recognition' && settings.translation.fallback.provider !== 'disabled'
    return nativeFallback && kind === 'mt' ? this.legacyBinding(kind, settings, true) : defaultModelBinding(settings, kind) || this.legacyBinding(kind, settings, false)
  }

  /** The backup binding the gateway page chose, or the empty string when there is none. */
  private fallbackBindingFor(config: ModelGatewaySettings): string {
    return normalizeModelBinding('mt', config.mtFallbackModel)
  }

  private publicBinding(kind: GatewayCapability): string {
    const settings = this.options.getSettings()
    const config = settings.modelGateway
    const legacy = normalizeModelBinding(kind, config.externalModels?.[kind])
    // Keep explicit legacy API mappings readable; new configurations share the gateway binding.
    if (config.externalCapabilities?.[kind] === false || (!legacy && !config[kind])) throw new GatewayError(503, 'This capability is not exposed through the public API', 'capability_disabled')
    return legacy || normalizeModelBinding(kind, config[`${kind}Model`]) || defaultModelBinding(settings, kind)
  }

  /**
   * Everything one worker instance needs, derived from a binding alone. Credentials are read here
   * and never leave the main process: they reach the worker through its init payload only.
   */
  private async plan(kind: WorkerKind, binding: string, resources: ResourceRecord[], settings: AppSettings, config: ModelGatewaySettings): Promise<WorkerPlan> {
    const policyBinding = binding === 'native:cloud' ? 'mt-custom:legacy-fallback' : binding.startsWith('native:') ? `cloud:${binding.slice(7)}` : binding
    if (!isModelEnabled(settings, kind, policyBinding)) throw new GatewayError(503, 'Enable this model in Model Management before using it.', 'model_disabled')
    const local = bindingIsLocal(binding)
    const nativeFallback = settings.translation.provider === 'recognition' && settings.translation.fallback.provider !== 'disabled'
    // A `native:` binding is the text backup of a native-speech session: its connection fields and
    // credential slot come from the fallback configuration, not the primary one.
    const backup = binding.startsWith('native:')
    if (!local && !backup && !buildConfiguredCloudModels(settings, await this.credentialPresence(settings))[kind].some(model => model.binding === binding)) throw new GatewayError(503, 'The cloud model configuration or credentials are incomplete.', 'invalid_configuration')
    if (backup && binding === 'native:cloud' && !legacyFallbackReady(settings, await this.credentialPresence(settings))) throw new GatewayError(503, 'The backup cloud model configuration or credentials are incomplete.', 'invalid_configuration')
    const backupSettings = backup ? { ...settings.translation, ...settings.translation.fallback } as AppSettings['translation'] : settings.translation
    const translationProvider = (binding.startsWith('mt-custom:') ? 'cloud'
      : binding.startsWith('cloud:') || binding.startsWith('native:') ? binding.slice(binding.indexOf(':') + 1) : 'local') as TranslationProvider
    const workerConfig: GatewayWorkerResult = { compute: settings.compute,
      recognitionProvider: kind === 'asr' ? (isCloudRecognition(binding) ? binding.slice(6) : 'local') : 'aliyun',
      recognitionModelId: kind === 'asr' && local ? binding.slice(9) : undefined,
      translationProvider: kind === 'mt' ? translationProvider : 'local',
      translationModelId: kind === 'mt' && local ? binding.slice(9) : undefined,
      sourceLanguage: 'auto', targetLanguages: kind === 'mt' ? [config.targetLanguage] : [],
      max_segment_ms: settings.recognition.max_segment_ms, silence_end_ms: settings.recognition.silence_end_ms }
    const nameOf = (): string => local
      ? resources.find(item => item.resourceId === binding.slice(9))?.name ?? binding.slice(9)
      : kind === 'asr' ? (binding === 'cloud:aliyun' ? settings.recognition.aliyunModel ?? 'Aliyun' : settings.recognition.minimaxModel ?? 'MiniMax')
        : binding.startsWith('mt-custom:') ? customModelsOf(settings.translation).find(item => item.id === binding.slice(10))?.name ?? 'Custom API'
          : kind === 'mt' ? backupSettings.cloudName || backupSettings.cloudModel || translationProvider
            : binding.slice(6)
    if (kind === 'mt' && binding === 'cloud:recognition') throw new GatewayError(400, 'The native translation provider returns translation with audio. Select a text translation model for nola-mt.')
    if (!local) {
      if (kind === 'asr') {
        Object.assign(workerConfig, recognitionFieldsOf({ ...settings.recognition, provider: binding.slice(6) as 'aliyun' | 'minimax' }))
        const key = await this.options.getCredential?.(binding === 'cloud:aliyun' ? 'aliyun-asr' : 'minimax-asr')
        if (!key) throw new GatewayError(503, 'The configured cloud recognition service has no API key.', 'model_unavailable')
        workerConfig.recognitionOptions = { ...workerConfig.recognitionOptions as object, apiKey: key }
      } else if (kind === 'mt') {
        const options = backup ? translationOptionsOf(backupSettings)
          : translationOptionsFor(settings.translation, translationProvider, binding.startsWith('mt-custom:') ? binding.slice(10) : undefined)
        const credential: CredentialProvider | undefined = translationProvider === 'cloud'
          ? backup ? 'fallback-cloud' : customCredentialSlot(binding.slice(10))
          : translationProvider === 'google' ? backup ? 'fallback-google' : 'google'
            : translationProvider === 'microsoft' ? 'microsoft' : undefined
        // A missing key stays a request-time failure rather than a load failure, the way a cloud
        // translation binding behaved before the gateway owned several instances per capability.
        const key = credential ? await this.options.getCredential?.(credential) : undefined
        workerConfig.translationOptions = { ...options as object, ...(key ? { apiKey: key } : {}) }
      }
    }
    let fallbackConfig: GatewayWorkerResult | undefined
    let fallbackResourceId: string | undefined
    let fallbackUsesPrimary = false
    if (kind === 'mt') {
      const chosen = this.fallbackBindingFor(config)
      if (chosen && chosen !== binding) {
        if (bindingIsLocal(chosen)) throw new GatewayError(503, 'A backup cannot load a second local translation model. Select an enabled cloud interface.', 'model_not_loaded')
        const base = await this.plan('mt', chosen, resources, settings, config)
        fallbackConfig = base.workerConfig
        fallbackResourceId = base.resourceId
      } else if (chosen || nativeFallback) {
        // Explicit gateway choices take precedence over the legacy native-session backup.
        fallbackUsesPrimary = true
      } else {
        const legacy = fallbackTranslationFieldsOf(settings.translation)
        if (legacy.fallbackTranslationProvider) {
          const provider = legacy.fallbackTranslationProvider
          const fallbackBinding = provider === 'local' ? `resource:${settings.translation.localModelId}` : provider === 'cloud' ? 'mt-custom:legacy-fallback' : `cloud:${provider}`
          if (!isModelEnabled(settings, 'mt', fallbackBinding)) throw new GatewayError(503, 'Enable the backup model in Model Management before using it.', 'model_disabled')
          if (provider === 'local' && fallbackBinding !== binding) throw new GatewayError(503, 'The local backup model is not loaded.', 'model_not_loaded')
          if (provider === 'cloud' && !legacyFallbackReady(settings, await this.credentialPresence(settings))) throw new GatewayError(503, 'The backup cloud model configuration or credentials are incomplete.', 'invalid_configuration')
          if (provider === 'local') fallbackUsesPrimary = true
          else {
            fallbackConfig = { ...workerConfig, translationProvider: provider,
              translationOptions: legacy.fallbackTranslationOptions as object }
            const credential: CredentialProvider | undefined = provider === 'cloud' ? 'fallback-cloud'
              : provider === 'google' ? 'fallback-google' : provider === 'microsoft' ? 'microsoft' : undefined
            if (credential && this.options.getCredential) {
              const apiKey = await this.options.getCredential(credential)
              fallbackConfig.translationOptions = { ...legacy.fallbackTranslationOptions as object, ...(apiKey ? { apiKey } : {}) }
            }
          }
        }
      }
    }
    const resourceId = local ? binding.slice(9) : undefined
    if (local) {
      const record = resources.find(item => item.resourceId === resourceId)
      if (!record?.installed || record.kind !== RESOURCE_KIND[kind]) throw new GatewayError(503, 'Select an installed model with the correct capability.', 'model_unavailable')
    }
    return { name: nameOf(), ...(resourceId ? { resourceId } : {}), workerConfig, ...(fallbackConfig ? { fallbackConfig, fallbackResourceId } : {}),
      fallbackUsesPrimary, signature: createHash('sha256').update(JSON.stringify([binding, workerConfig, fallbackConfig, fallbackUsesPrimary])).digest('hex') }
  }

  private async configureWorkers(): Promise<void> {
    const stored = this.options.getSettings()
    const config = modelGatewaySettingsSchema.parse(stored.modelGateway)
    const needsInventory = WORKER_KINDS.some(kind => config[kind] && (bindingIsLocal(this.bindingFor(kind, config, stored))
      || (kind === 'mt' && (bindingIsLocal(this.fallbackBindingFor(config)) || stored.translation.fallback.provider === 'local'))))
    const resources = needsInventory ? await this.options.listResources().catch(() => []) : []
    this.inventory = resources
    await Promise.all([...WORKER_KINDS.map(kind => this.configureCapability(kind, config, stored, resources)), this.configureLanguageModel()])
  }

  private async configureCapability(kind: WorkerKind, config: ModelGatewaySettings, stored: AppSettings, resources: ResourceRecord[]): Promise<void> {
    const enabled = config[kind] === true
    const previous = this.eager.get(kind) ?? ''
    const binding = enabled ? this.bindingFor(kind, config, stored) : ''
    this.eager.set(kind, binding)
    if (!enabled) {
      const owned = [...this.slots.values()].filter(slot => slot.kind === kind && bindingIsLocal(slot.binding))
      for (const slot of owned) this.slots.delete(`${slot.kind}:${slot.binding}`)
      const retiringNow = [...this.retiring].filter(slot => slot.kind === kind && bindingIsLocal(slot.binding))
      for (const slot of retiringNow) this.retiring.delete(slot)
      await Promise.all([...owned, ...retiringNow].map(slot => this.closeSlot(slot)))
      this.services[kind] = { state: 'stopped', model: '', name: '' }
      this.changed(); return
    }
    // A cloud binding that stopped being configured (key removed, profile deleted) must not stay warm.
    await this.pruneLazy(kind, config, stored, resources)
    let plan: WorkerPlan
    try { plan = await this.plan(kind, binding, resources, stored, config) }
    catch (error) {
      const message = error instanceof GatewayError ? error.message : 'Model could not load. Check the model configuration, runtime and connection.'
      this.services[kind] = { state: 'failed', model: binding, name: '', error: message, errorCode: error instanceof GatewayError ? error.code : 'inference_failed' }
      this.changed(); return
    }
    const existing = this.slots.get(`${kind}:${binding}`)
    if (existing && !existing.retired && existing.signature === plan.signature && this.services[kind].state === 'ready') return
    if (existing && !existing.retired) { this.slots.delete(`${kind}:${binding}`); this.retire(existing) }
    if (previous && previous !== binding) {
      const stale = this.slots.get(`${kind}:${previous}`)
      if (stale) { this.slots.delete(`${kind}:${previous}`); this.retire(stale) }
    }
    if (this.stopping) return
    this.services[kind] = { state: 'loading', model: binding, name: plan.name }
    this.changed()
    try {
      await this.createSlot(kind, binding, plan, false)
      const slot = this.slots.get(`${kind}:${binding}`)
      if (!slot || this.stopping || this.eager.get(kind) !== binding) { await slot?.worker.close(); return }
      const ready = await slot.worker.ready
      if (this.stopping || this.slots.get(`${kind}:${binding}`) !== slot) return
      this.services[kind] = { ...this.services[kind], state: 'ready',
        ...(typeof ready.providerName === 'string' ? { providerName: ready.providerName } : {}),
        ...(kind === 'asr' ? { nativeTranslation: ready.nativeTranslation === true } : {}),
        ...(kind === 'mt' ? { fallback: ready.fallbackReady === true, fallbackReady: ready.fallbackReady === true,
          ...(typeof ready.fallbackProviderName === 'string' ? { fallbackProviderName: ready.fallbackProviderName } : {}) } : {}),
        ...(Array.isArray(ready.voices) ? { voices: ready.voices.filter((voice): voice is string => typeof voice === 'string') } : {}) }
    } catch (error) {
      const slot = this.slots.get(`${kind}:${binding}`)
      if (slot) { this.slots.delete(`${kind}:${binding}`); await slot.worker.close() }
      if (!this.stopping) {
        const known = error instanceof GatewayError && /^(Select an installed|The configured|The saved|The native|Model gateway)/.test(error.message)
        this.services[kind] = { state: 'failed', model: binding, name: plan.name, error: known ? error.message : 'Model could not load. Check the model configuration, runtime and connection.', errorCode: error instanceof GatewayError ? error.code : 'inference_failed' }
      }
    }
    this.changed()
  }

  /** Drop warm cloud instances whose binding is no longer configured. */
  private async pruneLazy(kind: WorkerKind, config: ModelGatewaySettings, stored: AppSettings, resources: ResourceRecord[]): Promise<void> {
    for (const slot of [...this.slots.values()]) {
      if (slot.kind !== kind || !slot.lazy || slot.refs || slot.retired) continue
      const valid = await this.plan(kind, slot.binding, resources, stored, config).then(() => true, () => false)
      if (!valid) { this.slots.delete(`${kind}:${slot.binding}`); await this.closeSlot(slot) }
    }
  }

  private async createSlot(kind: WorkerKind, binding: string, plan: WorkerPlan, lazy: boolean): Promise<WorkerSlot> {
    const launch = await this.options.directLaunch(binding)
    if (this.stopping && bindingIsLocal(binding)) throw new Error('Gateway stopped')
    const key = `${kind}:${binding}`
    const slot: WorkerSlot = { worker: undefined as unknown as GatewayWorker, kind, binding, signature: plan.signature, refs: 0, retired: false,
      lazy, resources: [...new Set([...(plan.resourceId ? [plan.resourceId] : []), ...(plan.fallbackResourceId ? [plan.fallbackResourceId] : [])])] }
    slot.worker = (this.options.createWorker ?? createGatewayWorker)(launch, { kind, ...(plan.resourceId ? { resourceId: plan.resourceId } : {}),
      config: plan.workerConfig, ...(plan.fallbackConfig ? { fallbackConfig: plan.fallbackConfig, fallbackResourceId: plan.fallbackResourceId } : {}),
      ...(plan.fallbackUsesPrimary ? { fallbackUsesPrimary: true } : {}) }, message => {
      // Only the bound instance reports through the service state; a warm cloud failure is per-request.
      if (this.slots.get(key) !== slot || this.eager.get(kind) !== binding || this.stopping) return
      this.services[kind].state = 'failed'; this.services[kind].error = message; this.changed()
    })
    this.slots.set(key, slot)
    return slot
  }

  /**
   * Resolve the instance a consumer asked for. An empty binding means the capability's own binding;
   * an unconfigured or unloaded local model is refused with the action the user has to take.
   */
  private async ensureSlot(kind: WorkerKind, binding: string): Promise<WorkerSlot> {
    const stored = this.options.getSettings()
    const config = modelGatewaySettingsSchema.parse(stored.modelGateway)
    const wanted = binding || this.eager.get(kind) || this.bindingFor(kind, config, stored)
    if (!wanted) throw new GatewayError(503, `${kind.toUpperCase()} has no model bound in Model Gateway.`, 'model_unavailable')
    if (!isModelEnabled(stored, kind, wanted === 'native:cloud' ? 'mt-custom:legacy-fallback' : wanted.startsWith('native:') ? `cloud:${wanted.slice(7)}` : wanted)) throw new GatewayError(503, 'Enable this model in Model Management before using it.', 'model_disabled')
    if (bindingIsLocal(wanted) && (this.state !== 'running' || this.stopping || !config[kind])) throw new GatewayError(503, `${kind.toUpperCase()} is not loaded in Model Gateway.`, 'model_not_loaded')
    const key = `${kind}:${wanted}`
    const ready = (slot?: WorkerSlot) => slot && !slot.retired && this.services[slot.kind].model === slot.binding
      ? this.services[slot.kind].state === 'ready' : slot && !slot.retired
    const found = this.slots.get(key)
    if (bindingIsLocal(wanted) && ready(found)) { this.clearIdle(found!); return found! }
    if (bindingIsLocal(wanted) && wanted !== (this.eager.get(kind) ?? '')) {
      // Not found rather than unavailable: a public client named a model this gateway does not
      // serve, and an internal session gets the same text through its `model_unavailable` code.
      throw new GatewayError(404, 'This local model is not loaded in Model Gateway. Load it there or pick a cloud interface.', 'model_not_found')
    }
    const pending = this.creating.get(key)
    if (pending) return pending.then(slot => { if (!ready(slot)) throw new GatewayError(503, `${kind.toUpperCase()} instance stopped.`, 'model_unavailable'); return slot })
    const task = (async () => {
      const resources = bindingIsLocal(wanted) ? await this.options.listResources() : []
      const plan = await this.plan(kind, wanted, resources, stored, config)
      if (JSON.stringify(stored) !== JSON.stringify(this.options.getSettings())) throw new GatewayError(409, 'Model configuration changed during initialization. Retry the request.', 'configuration_changed')
      if (found && !found.retired && found.signature === plan.signature) return found
      if (found) { this.slots.delete(key); this.retire(found) }
      const slot = await this.createSlot(kind, wanted, plan, wanted !== (this.eager.get(kind) ?? ''))
      await slot.worker.ready
      if ((bindingIsLocal(wanted) && this.stopping) || this.slots.get(key) !== slot) throw new GatewayError(503, `${kind.toUpperCase()} instance stopped.`, 'model_unavailable')
      return slot
    })()
    this.creating.set(key, task)
    try { return await task } finally { if (this.creating.get(key) === task) this.creating.delete(key) }
  }

  private unhold(slot: WorkerSlot): void {
    slot.refs--
    // Only the retirement owner closes it, so a lease released after the capability was already
    // stopped does not report a second teardown of the same process.
    if (slot.retired && !slot.refs) { if (this.retiring.delete(slot)) void this.closeSlot(slot); return }
    if (slot.lazy && !slot.refs) {
      this.clearIdle(slot)
      slot.idle = setTimeout(() => {
        if (slot.refs || slot.retired) return
        if (this.slots.get(`${slot.kind}:${slot.binding}`) === slot) this.slots.delete(`${slot.kind}:${slot.binding}`)
        void this.closeSlot(slot)
      }, LAZY_IDLE_MS)
      slot.idle.unref?.()
    }
  }
  private clearIdle(slot: WorkerSlot): void { if (slot.idle) { clearTimeout(slot.idle); slot.idle = undefined } }
  private async closeSlot(slot: WorkerSlot): Promise<void> { this.clearIdle(slot); await slot.worker.close() }

  private retire(slot: WorkerSlot): void {
    slot.retired = true; this.clearIdle(slot); this.retiring.add(slot)
    if (!slot.refs) { this.retiring.delete(slot); void this.closeSlot(slot) }
  }
  private async stopInternal(): Promise<ModelGatewaySnapshot> {
    this.stopping = true; this.state = 'stopping'; this.changed()
    for (const controller of this.controllers) controller.abort()
    this.loadingLanguageModel?.abort()
    const languageModels = [...this.retiredLanguageModels, ...(this.llm ? [this.llm] : [])]
    for (const slot of languageModels) slot.controller.abort()
    const workers = [...this.slots.values(), ...this.retiring].filter(slot => bindingIsLocal(slot.binding))
    await Promise.all([this.stopListener(), ...workers.map(slot => this.closeSlot(slot)), ...languageModels.map(slot => slot.runtime.close())])
    this.llm = undefined; this.retiredLanguageModels.clear()
    for (const slot of workers) { this.slots.delete(`${slot.kind}:${slot.binding}`); this.retiring.delete(slot) }
    this.eager.clear()
    this.tickets.clear()
    for (const kind of KINDS) this.services[kind] = { ...this.services[kind], state: 'stopped', error: undefined }
    this.state = 'stopped'; this.error = undefined; this.changed(); return this.snapshot()
  }

  private async configureLanguageModel(): Promise<void> {
    const settings = this.options.getSettings()
    const binding = normalizeModelBinding('llm', settings.modelGateway.llmModel)
    const previous = this.llm
    const services: DirectModelServices = { getSettings: this.options.getSettings, directLaunch: this.options.directLaunch,
      getCredential: provider => this.options.getCredential?.(provider) ?? Promise.resolve('') }
    let signature: string
    try {
      const profile = customModelsOf(settings.translation).find(item => item.id === binding.replace(/^custom:/, ''))
      signature = createHash('sha256').update(JSON.stringify([binding, settings.compute, profile,
        !settings.modelGateway.llm || !binding || bindingIsLocal(binding) ? '' : await services.getCredential(customCredentialSlot(binding.replace(/^custom:/, '')))])).digest('hex')
    } catch {
      this.services.llm = { state: 'failed', model: binding, name: '', error: 'LLM credentials are unavailable' }
      this.changed(); return
    }
    if (settings.modelGateway.llm && previous?.signature === signature && this.services.llm.state === 'ready') return
    if (!settings.modelGateway.llm) for (const retired of this.retiredLanguageModels) retired.controller.abort()
    this.llm = undefined
    if (previous) {
      previous.retired = true
      if (!settings.modelGateway.llm) previous.controller.abort()
      if (previous.refs) this.retiredLanguageModels.add(previous)
      else await previous.runtime.close()
    }
    this.services.llm = { state: settings.modelGateway.llm ? 'loading' : 'stopped', model: binding, name: '' }
    this.changed()
    if (!settings.modelGateway.llm || this.stopping) return
    if (!isModelEnabled(settings, 'llm', binding)) {
      this.services.llm = { state: 'failed', model: binding, name: '', error: 'Enable this model in Model Management before loading it.', errorCode: 'model_disabled' }
      this.changed(); return
    }
    const controller = new AbortController()
    this.loadingLanguageModel = controller
    try {
      const runtime = await (this.options.createLanguageModel ?? createGatewayLanguageModel)(services, binding, controller.signal)
      if (this.stopping) { await runtime.close(); return }
      const slot = { runtime, signature, refs: 0, retired: false, controller }
      this.llm = slot
      this.services.llm = { state: 'ready', model: binding, name: runtime.name }
      runtime.onFailed?.(() => {
        controller.abort()
        if (this.llm === slot && !this.stopping) {
          this.services.llm = { state: 'failed', model: binding, name: runtime.name, error: 'Local LLM stopped. Restart the capability in Model Gateway.' }
          this.changed()
        }
      })
    } catch {
      if (!this.stopping) this.services.llm = { state: 'failed', model: binding, name: '', error: 'LLM could not initialize. Check the selected model, protocol and runtime.' }
    } finally { if (this.loadingLanguageModel === controller) this.loadingLanguageModel = undefined; this.changed() }
  }

  private authorize(request: IncomingMessage): void {
    const header = request.headers.authorization ?? ''
    const offered = header.startsWith('Bearer ') ? header.slice(7) : ''
    const left = Buffer.from(offered); const right = Buffer.from(this.key)
    if (!right.length || left.length !== right.length || !timingSafeEqual(left, right)) throw new GatewayError(401, 'Invalid API key', 'authentication_error')
  }
  private begin(kind: GatewayCapability, model: string): GatewayRequestSnapshot {
    if (this.requests.filter(request => request.status === 'running').length >= 16) throw new GatewayError(429, 'Too many active requests')
    const request: GatewayRequestSnapshot = { id: randomUUID(), kind, model, status: 'running', startedAt: Date.now() }
    this.requests.unshift(request)
    while (this.requests.length > 64) { const index = this.requests.map(item => item.status !== 'running').lastIndexOf(true); if (index < 0) break; this.requests.splice(index, 1) }
    this.changed(); return request
  }
  private finish(request: GatewayRequestSnapshot, error?: unknown, cancelled = false): void {
    if (request.status !== 'running') return
    request.status = error ? cancelled ? 'cancelled' : 'failed' : 'completed'; request.durationMs = Date.now() - request.startedAt
    if (error && !cancelled) request.error = error instanceof GatewayError ? error.message : 'Inference failed'
    this.changed()
  }
  private json(response: ServerResponse, status: number, data: unknown): void { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)) }
  private async body(request: IncomingMessage): Promise<Buffer> {
    if (Number(request.headers['content-length']) > MAX_BODY) throw new GatewayError(413, 'Request body is too large')
    const chunks: Buffer[] = []; let length = 0
    for await (const chunk of request) { length += chunk.length; if (length > MAX_BODY) throw new GatewayError(413, 'Request body is too large'); chunks.push(chunk) }
    return Buffer.concat(chunks)
  }
  private async http(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let entry: GatewayRequestSnapshot | undefined
    let release: (() => void) | undefined
    const controller = new AbortController(); this.controllers.add(controller)
    const abort = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', abort)
    try {
      const origin = request.headers.origin
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin') }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }); response.end(); return
      }
      this.authorize(request)
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      if (request.method === 'POST' && path === '/v1/realtime/sessions') {
        await this.ensureSlot('asr', this.publicBinding('asr'))
        for (const [ticket, expires] of this.tickets) if (expires < Date.now()) this.tickets.delete(ticket)
        if (this.tickets.size >= 64) throw new GatewayError(429, 'Too many unused realtime tickets')
        const ticket = randomBytes(24).toString('base64url'); const expires = Date.now() + 30_000; this.tickets.set(ticket, expires)
        this.json(response, 200, { client_secret: { value: ticket, expires_at: Math.floor(expires / 1000) }, url: `/v1/realtime?ticket=${ticket}` }); return
      }
      if (request.method === 'GET' && path === '/v1/models') {
        const catalog = (await this.snapshotWithCatalog()).availableModels!
      this.json(response, 200, { object: 'list', data: KINDS.filter(kind => {
        const settings = this.options.getSettings()
        if (settings.modelGateway.externalCapabilities?.[kind] === false
          || (!settings.modelGateway[kind] && !normalizeModelBinding(kind, settings.modelGateway.externalModels?.[kind]))) return false
        const binding = this.publicBinding(kind)
        return binding !== 'cloud:recognition' && catalog[kind].some(model => model.binding === binding)
      }).map(kind => ({ id: `nola-${kind}`, object: 'model', created: 0, owned_by: 'nola', capabilities: [kind], ...(kind === 'tts' ? { voices: this.services[kind].voices ?? [] } : {}) })) }); return
      }
      if (request.method !== 'POST' || !['/v1/chat/completions', '/v1/audio/speech', '/v1/audio/transcriptions'].includes(path)) throw new GatewayError(404, 'Unknown endpoint')
      if (this.state !== 'running') throw new GatewayError(503, 'Gateway is loading')
      const bytes = await this.body(request)
      let data: Record<string, unknown>
      if (path === '/v1/audio/transcriptions') data = await parseMultipart(request.headers['content-type'] ?? '', bytes)
      else {
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new GatewayError(415, 'Expected application/json')
        try { data = object(JSON.parse(bytes.toString('utf8'))) } catch { throw new GatewayError(400, 'Invalid JSON') }
      }
      if (path === '/v1/chat/completions' && data.model === 'nola-llm') {
        const lease = await this.acquireLanguageModel(this.publicBinding('llm'))
        let error: unknown
        try { await gatewayChat(lease, data, response, AbortSignal.any([controller.signal, lease.signal])) }
        catch (cause) { error = cause; if (cause instanceof ZodError || cause instanceof SyntaxError) throw new GatewayError(400, 'Invalid LLM request'); throw cause }
        finally { lease.release(error) }
        return
      }
      const kind: WorkerKind = path === '/v1/chat/completions' ? 'mt' : path === '/v1/audio/speech' ? 'tts' : 'asr'
      const requested = normalizeModelBinding(kind, data.model)
      const publicBinding = this.publicBinding(kind)
      if (requested && requested !== publicBinding) throw new GatewayError(404, 'The public API only serves its configured model alias', 'model_not_found')
      const slot = await this.ensureSlot(kind, publicBinding)
      slot.refs++; this.clearIdle(slot)
      const held = slot
      release = () => this.unhold(held)
      entry = this.begin(kind, slot.binding)
      let payload: GatewayWorkerResult
      if (kind === 'mt') payload = translationRequest(data, this.options.getSettings().modelGateway.targetLanguage)
      else if (kind === 'tts') {
        if (data.response_format && !['mp3', 'wav', 'pcm'].includes(String(data.response_format))) throw new GatewayError(400, 'Supported speech formats are mp3, wav and pcm')
        if (data.speed !== undefined && data.speed !== 1) throw new GatewayError(400, 'Only speech speed 1 is supported')
        payload = { op: 'infer', text: text(data.input, 'input'), voice: data.voice === undefined ? this.options.getSettings().synthesis.voice : text(data.voice, 'voice', 256), response_format: data.response_format ?? 'mp3' }
      } else {
        if (!['json', 'text', undefined].includes(data.response_format as string | undefined)) throw new GatewayError(400, 'Supported transcription formats are json and text')
        payload = { op: 'infer', audio: data.audio, source: data.language === undefined ? 'auto' : text(data.language, 'language', 32) }
      }
      const result = await slot.worker.request(payload, controller.signal)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (kind === 'tts') {
        const format = data.response_format ?? 'mp3'; const prefix = format === 'mp3' ? 'data:audio/mpeg;base64,' : 'data:audio/wav;base64,'
        if (typeof result.audio !== 'string' || !result.audio.startsWith(prefix)) throw new Error('Invalid speech response')
        const bytes = Buffer.from(result.audio.slice(prefix.length), 'base64')
        const audio = format === 'pcm' ? wavPcm(bytes) : bytes
        response.writeHead(200, { 'Content-Type': format === 'pcm' ? 'application/octet-stream' : format === 'mp3' ? 'audio/mpeg' : 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store' }); response.end(audio)
      } else if (kind === 'asr') {
        if (data.response_format === 'text') { response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(String(result.text ?? '')) }
        else this.json(response, 200, { text: result.text ?? '' })
      } else {
        const id = `chatcmpl-${entry.id}`; const created = Math.floor(Date.now() / 1000)
        const content = String(result.text ?? '')
        if (data.stream === true) {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
          const send = (delta: unknown, finish: string | null) => response.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: `nola-${kind}`, choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n')
          send({ role: 'assistant', content }, null); send({}, 'stop'); response.end('data: [DONE]\n\n')
        } else this.json(response, 200, { id, object: 'chat.completion', created, model: `nola-${kind}`, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] })
      }
      this.finish(entry)
    } catch (cause) {
      const error = clientError(cause)
      if (entry) this.finish(entry, error, controller.signal.aborted)
      if (!response.headersSent && !response.destroyed) this.json(response, error instanceof GatewayError ? error.status : 500, { error: { message: error instanceof GatewayError ? error.message : 'Inference failed. Check the capability status in Nola.', type: error instanceof GatewayError ? error.code : 'server_error', code: error instanceof GatewayError ? error.code : 'inference_failed' } })
      else if (!response.writableEnded) response.end()
    } finally { release?.(); this.controllers.delete(controller); response.removeListener('close', abort) }
  }

  private realtime(client: WebSocket, request: IncomingMessage): void {
    const id = randomUUID(); let slot: WorkerSlot | undefined
    let entry: GatewayRequestSnapshot | undefined; let unsubscribe: (() => void) | undefined
    let opened = false; let finished = false; let queuedBytes = 0; let queue = Promise.resolve()
    const send = (event: Record<string, unknown>) => { if (client.readyState === WebSocket.OPEN) { if (client.bufferedAmount > MAX_BODY) { client.terminate(); return }; client.send(JSON.stringify({ event_id: `event_${randomUUID()}`, ...event })) } }
    const error = (message: string) => send({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_request', message } })
    const session: { id: string; object: string; model?: string; input_audio_format: string; sample_rate: number; input_audio_transcription: { language: string }; turn_detection: { type: string; silence_duration_ms: number } | null } = { id, object: 'realtime.session', model: new URL(request.url ?? '/', 'http://localhost').searchParams.get('model') ?? undefined, input_audio_format: 'pcm16', sample_rate: 16000, input_audio_transcription: { language: 'auto' }, turn_detection: { type: 'server_vad', silence_duration_ms: 800 } }
    this.clients.add(client); this.changed(); send({ type: 'session.created', session })
    const open = async () => {
      if (opened) return
      const binding = this.publicBinding('asr')
      const wanted = normalizeModelBinding('asr', session.model)
      if (wanted && wanted !== binding) throw new GatewayError(404, 'The public API only serves its configured model alias', 'model_not_found')
      slot = await this.ensureSlot('asr', binding)
      slot.refs++; this.clearIdle(slot)
      entry = this.begin('asr', slot.binding)
      unsubscribe = slot.worker.subscribe(event => {
        if (event.fatal) { error('ASR worker is unavailable'); client.close(1011, 'ASR worker failed'); return }
        if (event.session !== id || !event.event) return
        send(object(event.event))
      })
      await slot.worker.request({ op: 'session.open', session: id, language: session.input_audio_transcription.language, silenceMs: session.turn_detection?.silence_duration_ms ?? 800, manual: session.turn_detection === null })
      opened = true
    }
    client.on('message', (raw, binary) => {
      if (finished) { error('Session is finished'); return }
      const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw
      queuedBytes += bytes.length
      if (queuedBytes > 4 * 1024 * 1024) { client.close(1009, 'Too much pending audio'); return }
      const length = bytes.length
      queue = queue.then(async () => {
        if (client.readyState !== WebSocket.OPEN) return
        if (binary) throw new GatewayError(400, 'Use base64 PCM16 in input_audio_buffer.append')
        let message: Record<string, unknown>
        try { message = object(JSON.parse(bytes.toString())) } catch { throw new GatewayError(400, 'Invalid JSON') }
        if (message.type === 'session.update') {
          if (opened) throw new GatewayError(400, 'Update the session before sending audio')
          const update = object(message.session)
          if (update.input_audio_format !== undefined && !['pcm16', 'pcm'].includes(String(update.input_audio_format))) throw new GatewayError(400, 'Only PCM16 audio is supported')
          if (update.sample_rate !== undefined && update.sample_rate !== 16000) throw new GatewayError(400, 'Audio sample rate must be 16000')
          if (update.model !== undefined) session.model = text(update.model, 'model', 512)
          const transcription = object(update.input_audio_transcription)
          if (transcription.language !== undefined) session.input_audio_transcription.language = text(transcription.language, 'language', 32)
          const vad = object(update.turn_detection)
          if (update.turn_detection !== undefined && update.turn_detection !== null && vad.type !== 'server_vad') throw new GatewayError(400, 'Use server_vad or null turn detection')
          if (update.turn_detection === null) session.turn_detection = null
          if (vad.silence_duration_ms !== undefined) {
            if (typeof vad.silence_duration_ms !== 'number' || vad.silence_duration_ms < 300 || vad.silence_duration_ms > 2000) throw new GatewayError(400, 'Invalid silence_duration_ms')
            session.turn_detection = { type: 'server_vad', silence_duration_ms: vad.silence_duration_ms }
          }
          await open(); send({ type: 'session.updated', session }); return
        }
        await open()
        if (message.type === 'input_audio_buffer.append') {
          const audio = text(message.audio, 'audio', 1024 * 1024)
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio) || Buffer.from(audio, 'base64').length % 2) throw new GatewayError(400, 'Invalid PCM16 audio')
          await slot!.worker.request({ op: 'session.append', session: id, audio })
        } else if (message.type === 'input_audio_buffer.commit') {
          await slot!.worker.request({ op: 'session.commit', session: id }); send({ type: 'input_audio_buffer.committed' })
        } else if (message.type === 'session.finish') {
          await slot!.worker.request({ op: 'session.finish', session: id }); finished = true; this.finish(entry!); send({ type: 'session.finished', session }); client.close(1000, 'Finished')
        } else throw new GatewayError(400, 'Unknown realtime event')
      }).catch(reason => {
        const cause = clientError(reason)
        error(cause instanceof GatewayError ? cause.message : 'Realtime transcription failed')
        if (!(cause instanceof GatewayError)) { finished = true; if (entry) this.finish(entry, cause); client.close(1011, 'Transcription failed') }
      }).finally(() => { queuedBytes -= length })
    })
    client.once('close', () => {
      this.clients.delete(client); unsubscribe?.()
      void queue.finally(async () => { if (opened) await slot?.worker.request({ op: 'session.close', session: id }).catch(() => undefined); if (slot) this.unhold(slot) })
      if (entry && !finished) this.finish(entry, new Error('Session closed'), true)
      this.changed()
    })
    client.on('error', () => client.terminate())
  }
}

export function translationRequest(data: Record<string, unknown>, defaultTarget: string): GatewayWorkerResult {
  if (!Array.isArray(data.messages) || !data.messages.length || data.messages.length > 64) throw new GatewayError(400, 'messages must be a nonempty array')
  if (data.tools !== undefined || data.tool_choice !== undefined) throw new GatewayError(400, 'Translation models do not provide tools')
  if (data.n !== undefined && data.n !== 1) throw new GatewayError(400, 'Only n=1 is supported')
  if (data.stream !== undefined && typeof data.stream !== 'boolean') throw new GatewayError(400, 'Invalid stream flag')
  const messages = data.messages.map(value => {
    const message = object(value)
    if (!['system', 'developer', 'user', 'assistant'].includes(String(message.role))) throw new GatewayError(400, 'Unsupported message role')
    return { role: String(message.role), content: text(message.content, 'message content') }
  })
  const last = [...messages].reverse().find(message => message.role === 'user')
  if (!last) throw new GatewayError(400, 'A user message is required')
  const options = object(data.translation_options)
  const instructions = messages.filter(message => ['system', 'developer'].includes(message.role)).map(message => message.content).join('\n')
  const promptTarget = /(?:translate[\s\S]{0,100}?\b(?:to|into)\s+)([\p{L}-]+)/iu.exec(instructions)?.[1]
    ?? /翻译(?:成|为)([\p{L}-]+)/u.exec(instructions)?.[1]
  let source = last.content
  const inline = /^\s*translate\s+(?:the\s+following\s+(?:text\s+)?)?(?:from\s+[\p{L}-]+\s+)?(?:to|into)\s+([\p{L}-]+)\s*:\s*([\s\S]+)$/iu.exec(source)
  if (inline) source = inline[2]
  return { op: 'infer', text: source, source: text(options.source_lang ?? options.source_language ?? options.source ?? 'auto', 'source language', 32),
    target: normalizeLanguage(text(options.target_lang ?? options.target_language ?? options.target ?? promptTarget ?? inline?.[1] ?? defaultTarget, 'target language', 32)) }
}
function normalizeLanguage(value: string): string {
  const names: Record<string, string> = { chinese: 'zh', english: 'en', japanese: 'ja', korean: 'ko', french: 'fr', german: 'de', spanish: 'es', russian: 'ru', portuguese: 'pt', italian: 'it', arabic: 'ar', 中文: 'zh', 简体中文: 'zh', 繁体中文: 'zh-TW', 英文: 'en', 英语: 'en', 日语: 'ja', 日文: 'ja', 韩语: 'ko' }
  return names[value.toLowerCase()] ?? value
}
async function parseMultipart(contentType: string, bytes: Buffer): Promise<Record<string, unknown>> {
  if (!contentType.toLowerCase().startsWith('multipart/form-data;') || !/boundary=/i.test(contentType)) throw new GatewayError(415, 'Expected multipart/form-data')
  let form: FormData
  try { form = await new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': contentType } }).formData() } catch { throw new GatewayError(400, 'Invalid multipart body') }
  const file = form.get('file')
  if (!file || typeof file === 'string' || file.size === 0) throw new GatewayError(400, 'Audio file is required')
  const data: Record<string, unknown> = { audio: Buffer.from(await file.arrayBuffer()).toString('base64') }
  for (const field of ['model', 'language', 'response_format']) { const value = form.get(field); if (value !== null) { if (typeof value !== 'string') throw new GatewayError(400, `Invalid ${field}`); data[field] = value } }
  return data
}
function wavPcm(wav: Buffer): Buffer {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV response')
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4)
    if (wav.toString('ascii', offset, offset + 4) === 'data' && offset + 8 + size <= wav.length) return wav.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + size % 2
  }
  throw new Error('WAV data chunk is missing')
}
