import type { AppSettings } from '../settings'
import { astrBotSpeechPresetForBinding } from '../astrbot-speech-presets'
import { workspaceSpeechConnection, workspaceSpeechModel } from '../model-workspace'
import { ttsCatalogCapabilities } from './catalog'
import { migrateLegacyVoice } from './migration'
import type { TtsVoiceRef } from './voice-ref'

export function presetVoiceId(ref: TtsVoiceRef | undefined): string {
  return ref?.kind === 'preset' ? ref.voiceId : ''
}

export function synthesisVoiceRef(settings: Pick<AppSettings, 'synthesis'>): TtsVoiceRef {
  const value = settings.synthesis
  return value.voiceRef ?? migrateLegacyVoice(value.voice, value.modelId.startsWith('cloud:') || value.modelId.startsWith('resource:')
    ? value.modelId : `resource:${value.modelId}`).voiceRef
}

export function migrateTtsSettings(settings: AppSettings): void {
  const synthesis = settings.synthesis
  if (!synthesis.voiceRef) {
    const binding = synthesis.modelId.startsWith('cloud:') || synthesis.modelId.startsWith('resource:') ? synthesis.modelId : `resource:${synthesis.modelId}`
    const connection = workspaceSpeechConnection(settings.modelWorkspace, 'tts', binding)
    const model = connection && workspaceSpeechModel(connection, binding)
    const provider = astrBotSpeechPresetForBinding(binding)
    const capability = provider ? ttsCatalogCapabilities(provider.id, model?.id ?? provider.model, binding) : undefined
    const migrated = migrateLegacyVoice(synthesis.voice, binding, capability?.presetVoices.map(voice => voice.id),
      { providerId: provider?.id, connectionId: connection?.id })
    synthesis.voiceRef = migrated.voiceRef
    synthesis.legacyVoice = migrated.legacy
  }
  synthesis.voice = presetVoiceId(synthesis.voiceRef)
}

export function persistedTtsSettings(settings: AppSettings) {
  const { voice: _legacyVoice, ...synthesis } = settings.synthesis
  return { ...settings, synthesis }
}
