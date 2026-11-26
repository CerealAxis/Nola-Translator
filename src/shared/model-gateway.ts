import { astrBotSpeechPresetForBinding } from './astrbot-speech-presets'
import type { TtsPresetVoiceDescriptor } from './tts/capabilities'
import { z } from 'zod'
import type { SessionConfig } from './contracts'
import type { ResourceRecord } from './contracts'
import type { GatewayPerformanceSnapshot } from './gateway-performance'

export type GatewayCapability = 'asr' | 'mt' | 'tts' | 'llm' | 'ocr'
export function gatewayConcurrency(binding: string, saved: number | undefined, resource?: Pick<ResourceRecord, 'provider'>): number {
  if (binding.startsWith('resource:') && (resource?.provider === 'crisp-asr' || resource?.provider === 'crisp-tts')) return 1
  const fallback = !binding || binding.startsWith('resource:') ? 1 : 10
  return saved !== undefined && Number.isSafeInteger(saved) && saved >= 1 ? saved : fallback
}
type PublicGatewayCapability = Exclude<GatewayCapability, 'llm' | 'ocr'>
export type GatewayServiceState = 'stopped' | 'pending' | 'loading' | 'ready' | 'failed'
export interface ModelGatewaySettings {
  loadMode?: 'on-demand' | 'direct'
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  asr: boolean
  mt: boolean
  tts: boolean
  llm?: boolean
  ocr?: boolean
  /**
   * Which model each capability is bound to, in binding form (see `normalizeModelBinding`). Empty
   * means "follow the legacy default model settings", which keeps profiles written before the
   * gateway owned model loading working without a migration pass.
   */
  asrModel?: string
  mtModel?: string
  ttsModel?: string
  llmModel?: string
  ocrModel?: string
  /** Translation used when the bound one fails. Same binding form; empty disables the fallback. */
  mtFallbackModel?: string
  externalEnabled?: boolean
  /** Public aliases are independent of the local weights selected for loading. */
  externalModels?: Partial<Record<PublicGatewayCapability, string>>
  externalCapabilities?: Partial<Record<PublicGatewayCapability, boolean>>
  targetLanguage: string
  concurrency?: Partial<Record<GatewayCapability, number>>
}
export const DEFAULT_MODEL_GATEWAY: ModelGatewaySettings = {
  loadMode: 'on-demand',
  host: '127.0.0.1', port: 17860, asr: false, mt: true, tts: false, llm: false, ocr: false,
  asrModel: '', mtModel: '', ttsModel: '', llmModel: '', ocrModel: '', mtFallbackModel: '', externalEnabled: true, targetLanguage: 'zh',
}
const binding = z.string().max(512).optional()
export const modelGatewaySettingsSchema = z.object({
  loadMode: z.enum(['on-demand', 'direct']).optional(),
  host: z.enum(['127.0.0.1', '0.0.0.0']), port: z.number().int().min(1024).max(65535),
  asr: z.boolean(), mt: z.boolean(), tts: z.boolean(), targetLanguage: z.string().min(1).max(32),
  llm: z.boolean().optional(), ocr: z.boolean().optional(), externalEnabled: z.boolean().optional(),
  externalModels: z.object({ asr: binding, mt: binding, tts: binding }).optional(),
  externalCapabilities: z.object({ asr: z.boolean().optional(), mt: z.boolean().optional(), tts: z.boolean().optional() }).optional(),
  asrModel: binding, mtModel: binding, ttsModel: binding, llmModel: binding, ocrModel: binding, mtFallbackModel: binding,
  concurrency: z.partialRecord(z.enum(['asr', 'mt', 'tts', 'llm', 'ocr']), z.number().int().min(1)).optional(),
})

/**
 * One string names a model everywhere a model is chosen or served.
 *
 * `resource:<id>` is a downloaded local model, `cloud:<provider>` a vendor interface,
 * `mt-custom:<id>` a saved custom connection used for translation and `custom:<id>` the same
 * records used as a chat model. The public aliases (`nola-asr`, `asr`) mean "whatever the gateway
 * capability is bound to" and normalize to the empty string.
 */
const GATEWAY_MODEL_ALIAS = { asr: 'nola-asr', mt: 'nola-mt', tts: 'nola-tts' } as const
const CLOUD_RECOGNITION = new Set(['aliyun', 'minimax'])
const CLOUD_TRANSLATION = new Set(['microsoft', 'google', 'mymemory', 'index-translate', 'recognition'])

export function normalizeModelBinding(kind: GatewayCapability, value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw === kind || (kind !== 'llm' && kind !== 'ocr' && raw === GATEWAY_MODEL_ALIAS[kind])) return ''
  if (raw.startsWith('resource:')) return raw.slice(9) ? raw : ''
  if (kind === 'ocr') return raw.includes(':') ? '' : `resource:${raw}`
  if (raw.startsWith('fallback:')) return kind === 'mt' && CLOUD_TRANSLATION.has(raw.slice(9)) ? `cloud:${raw.slice(9)}` : ''
  if (raw.startsWith('mt-custom:')) return kind === 'mt' && raw.slice(10) ? raw : ''
  if (raw.startsWith('custom:')) {
    if (!raw.slice(7)) return ''
    return kind === 'mt' ? `mt-custom:${raw.slice(7)}` : kind === 'llm' ? raw : ''
  }
  if (raw.startsWith('cloud:')) {
    const provider = raw.slice(6)
    if (kind === 'asr') return (CLOUD_RECOGNITION.has(provider)
      || /^cloud:[^:]+(?::[a-zA-Z0-9_-]{1,64})?$/.test(raw) && astrBotSpeechPresetForBinding(raw)?.capability === 'ASR') ? raw : ''
    if (kind === 'llm') return ''
    // `cloud:cloud` is how a saved custom connection used to be spelled for translation.
    return provider === 'cloud' ? '' : CLOUD_TRANSLATION.has(provider) ? raw : kind === 'mt' ? '' : raw
  }
  // A bare id is always a local model: the pickers historically stored `recognition.modelId`.
  return kind === 'llm' || kind === 'tts' || kind === 'asr' || kind === 'mt' ? `resource:${raw}` : ''
}

export const bindingIsLocal = (value: string): boolean => value.startsWith('resource:')

/** Explicit session bindings take precedence over provider fields copied from saved settings. */
export function resolveSessionModelBindings(config: SessionConfig): SessionConfig {
  const resolved = { ...config }
  const asr = normalizeModelBinding('asr', config.recognitionBinding)
  if (asr) {
    resolved.recognitionBinding = asr
    if (bindingIsLocal(asr)) {
      resolved.recognitionProvider = 'local'
      resolved.recognitionModelId = asr.slice(9)
    } else {
      resolved.recognitionProvider = asr.slice(6) as SessionConfig['recognitionProvider']
    }
  }
  const mt = normalizeModelBinding('mt', config.translationBinding)
  if (mt) {
    resolved.translationBinding = mt
    if (bindingIsLocal(mt)) {
      resolved.translationProvider = 'local'
      resolved.translationModelId = mt.slice(9)
    } else {
      resolved.translationProvider = mt.startsWith('mt-custom:') ? 'cloud' : mt.slice(6) as SessionConfig['translationProvider']
    }
  }
  return resolved
}

export interface GatewayServiceSnapshot {
  state: GatewayServiceState
  model: string
  name: string
  error?: string
  errorCode?: string
  voices?: string[]
  voiceInventory?: TtsPresetVoiceDescriptor[]
  providerName?: string
  nativeTranslation?: boolean
  fallback?: boolean
  fallbackReady?: boolean
  fallbackProviderName?: string
}
export interface GatewayRequestSnapshot {
  id: string
  kind: GatewayCapability
  model: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  durationMs?: number
  error?: string
}
export interface AvailableGatewayModel {
  binding: string
  name: string
  kind: GatewayCapability
  origin: 'gateway' | 'cloud'
  free: boolean
  sourceLanguages?: readonly string[]
  targetLanguages?: readonly string[]
  images?: boolean
}

export interface ModelGatewaySnapshot {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
  address: string
  port: number
  connections: number
  activeRequests: number
  services: Record<Exclude<GatewayCapability, 'ocr'>, GatewayServiceSnapshot> & { ocr?: GatewayServiceSnapshot }
  requests: GatewayRequestSnapshot[]
  availableModels?: Partial<Record<GatewayCapability, AvailableGatewayModel[]>>
  realtime?: {
    models: { model_id: string; enabled: boolean; kinds: string[]; operations: string[] }[]
    instances: { instance_id: string; model_id: string; state: string; active_leases: number }[]
  }
  error?: string
  errorCode?: string
}

export function gatewayStartupHint(code?: string) {
  if (code === 'BACKEND_DEPENDENCY_MISSING') return 'gateway.startupDependencyHint' as const
  if (code === 'BACKEND_START_TIMEOUT') return 'gateway.startupTimeoutHint' as const
  if (code === 'FILE_NOT_FOUND' || code === 'ENOENT') return 'gateway.startupRuntimeMissingHint' as const
  if (code === 'EADDRINUSE') return 'gateway.startupPortHint' as const
  return 'gateway.startupRetryHint' as const
}
export interface ModelGatewayApi {
  snapshot(): Promise<ModelGatewaySnapshot>
  start(): Promise<ModelGatewaySnapshot>
  stop(): Promise<ModelGatewaySnapshot>
  revealKey(): Promise<string>
  rotateKey(): Promise<string>
  openPerformanceMonitor?(): Promise<void>
  performanceSnapshot?(): Promise<GatewayPerformanceSnapshot>
  onChanged(callback: (snapshot: ModelGatewaySnapshot) => void): () => void
}
