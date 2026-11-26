import type { DirectModelRequest, DirectModelResult } from '../../../shared/agent-workspace'
import type { WorkspaceConnection } from '../../../shared/model-workspace'
export interface SpeechAdapterContext {
  request: DirectModelRequest; model: WorkspaceConnection['models'][number]; voice: string; targetLanguage: string; text: string; base: string;
  option(key: string): string; apiKey: string; signal: AbortSignal; bearer: Record<string, string>;
  http(url: string, init: RequestInit): Promise<Response>;
  post(url: string, body: unknown, headers?: Record<string, string>): Promise<Response>;
  wav(response: Response): Promise<DirectModelResult>; condition: DirectModelRequest['conditioning'];
}
