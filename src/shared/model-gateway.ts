import { z } from 'zod'

export type GatewayCapability = 'asr' | 'mt' | 'tts'
export type GatewayServiceState = 'stopped' | 'loading' | 'ready' | 'failed'
export interface ModelGatewaySettings {
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  asr: boolean
  mt: boolean
  tts: boolean
  targetLanguage: string
}
export const DEFAULT_MODEL_GATEWAY: ModelGatewaySettings = {
  host: '127.0.0.1', port: 17860, asr: false, mt: true, tts: false, targetLanguage: 'zh',
}
export const modelGatewaySettingsSchema = z.object({
  host: z.enum(['127.0.0.1', '0.0.0.0']), port: z.number().int().min(1024).max(65535),
  asr: z.boolean(), mt: z.boolean(), tts: z.boolean(), targetLanguage: z.string().min(1).max(32),
})
export interface GatewayServiceSnapshot {
  state: GatewayServiceState
  model: string
  name: string
  error?: string
  voices?: string[]
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
export interface ModelGatewaySnapshot {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
  address: string
  port: number
  connections: number
  activeRequests: number
  services: Record<GatewayCapability, GatewayServiceSnapshot>
  requests: GatewayRequestSnapshot[]
  error?: string
}
export interface ModelGatewayApi {
  snapshot(): Promise<ModelGatewaySnapshot>
  start(): Promise<ModelGatewaySnapshot>
  stop(): Promise<ModelGatewaySnapshot>
  revealKey(): Promise<string>
  rotateKey(): Promise<string>
  onChanged(callback: (snapshot: ModelGatewaySnapshot) => void): () => void
}
