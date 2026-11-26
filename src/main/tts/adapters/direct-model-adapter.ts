import type { DirectModelRequest, DirectModelResult } from '../../../shared/agent-workspace'
import { astrBotSpeechBinding, astrBotSpeechPreset } from '../../../shared/astrbot-speech-presets'
import type { TtsModelCapabilities } from '../../../shared/tts/capabilities'
import type { ResolvedTtsRequest } from '../../../shared/tts/synthesis'
import type { WorkspaceConnection } from '../../../shared/model-workspace'
import type { TtsAdapter } from './tts-adapter'

export class DirectModelTtsAdapter implements TtsAdapter {
  constructor(private readonly dependencies: {
    capabilities(binding: string): Promise<TtsModelCapabilities>;
    reference(assetId: string): Promise<string>;
    execute(request: DirectModelRequest, signal: AbortSignal): Promise<DirectModelResult>;
  }) {}

  capabilities(connection: WorkspaceConnection, modelId: string) {
    const provider = astrBotSpeechPreset(connection.service)
    const model = connection.models.find(item => item.id === modelId)
    if (!provider || !model) throw new Error('voiceModelMissing')
    return this.dependencies.capabilities(astrBotSpeechBinding(provider.id, model.profileId))
  }

  async synthesize(request: ResolvedTtsRequest, signal: AbortSignal) {
    const result = await this.dependencies.execute({ id: request.requestId, kind: 'tts', model: request.modelBinding,
      text: request.text, target: request.targetLanguage, voiceRef: request.voiceRef,
      conditioning: request.conditioning, controls: request.controls, output: request.output,
      ...(request.conditioning.kind === 'reference-audio' ? { audio: await this.dependencies.reference(request.conditioning.assetId) } : {}),
    }, signal)
    if (!result.audio) throw new Error('ttsNoAudio')
    return { audio: result.audio, mime: /^data:([^;]+);/.exec(result.audio)?.[1] ?? 'audio/wav' }
  }
}
