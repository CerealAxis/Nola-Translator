import type { WorkspaceConnection } from '../../../shared/model-workspace'
import type { TtsModelCapabilities } from '../../../shared/tts/capabilities'
import type { ResolvedTtsRequest, TtsAudioResult } from '../../../shared/tts/synthesis'

export interface TtsAdapter {
  capabilities(connection: WorkspaceConnection, modelId: string): Promise<TtsModelCapabilities>;
  synthesize(request: ResolvedTtsRequest, signal: AbortSignal): Promise<TtsAudioResult>;
}
