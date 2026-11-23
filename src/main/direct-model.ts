import { directModelRequestSchema, type DirectModelRequest, type DirectModelResult } from '../shared/agent-workspace'
import type { AppSettings, CredentialProvider } from '../shared/settings'

export interface DirectModelServices {
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  inferModel?(request: DirectModelRequest, signal: AbortSignal, inspect?: boolean): Promise<DirectModelResult>
  openLocalLanguageModel?(resourceId: string, signal: AbortSignal): Promise<{
    endpoint: string; headers: Record<string, string>; contextWindow: number; release(): Promise<void>
  } | undefined>
}

export async function runDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect = false): Promise<DirectModelResult> {
  if (!services.inferModel) throw new Error('Model inference service unavailable')
  signal.throwIfAborted()
  return services.inferModel(directModelRequestSchema.parse(raw), signal, inspect)
}
