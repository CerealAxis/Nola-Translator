import { astrBotSpeechBinding, astrBotSpeechPreset } from './astrbot-speech-presets'
import { customCredentialSlot } from './custom-models'
import { cloudModelsOf } from './cloud-models'
import { recognitionLabel, remoteSourceLanguages } from './cloud-config'
import { INDEX_TRANSLATE_LANGUAGES } from './index-translate'
import { LANGUAGE_CODES } from './languages'
import type { AvailableGatewayModel, GatewayCapability } from './model-gateway'
import { MIMO_TTS_BINDING, MIMO_TTS_LANGUAGES, MIMO_TTS_NAME, type AppSettings, type CredentialProvider } from './settings'
import { isCloudModelDisabled, isModelEnabled } from './model-policy'

/** The main process supplies credential presence; this catalog never reads or returns secrets. */
export function buildConfiguredCloudModels(settings: AppSettings, credentials: Readonly<Record<CredentialProvider, boolean>>): Record<GatewayCapability, AvailableGatewayModel[]> {
  const result: Record<GatewayCapability, AvailableGatewayModel[]> = { asr: [], mt: [], tts: [], llm: [], ocr: [] }
  if (credentials['mimo-tts'] && isModelEnabled(settings, 'tts', MIMO_TTS_BINDING)) {
    result.tts.push({ binding: MIMO_TTS_BINDING, name: MIMO_TTS_NAME, kind: 'tts', origin: 'cloud', free: false, targetLanguages: MIMO_TTS_LANGUAGES })
  }
  const providers: Record<string, string> = { microsoft: 'Microsoft Translator', google: 'Google Translate', mymemory: 'MyMemory', 'index-translate': 'Index Translate', recognition: 'Aliyun LiveTranslate' }
  const add = (model: AvailableGatewayModel) => {
    if (!isCloudModelDisabled(settings, model.kind, model.binding)) result[model.kind].push(model)
  }
  for (const model of cloudModelsOf(settings, credentials).filter(item => item.ready)) {
    if (model.profile) {
      const profile = model.profile
      add({ binding: `custom:${profile.id}`, name: profile.name, kind: 'llm', origin: 'cloud', free: false,
        images: profile.images === true,
        sourceLanguages: ['auto', ...LANGUAGE_CODES], targetLanguages: LANGUAGE_CODES })
      if (!model.chatOnly) add({ binding: `mt-custom:${profile.id}`, name: profile.name, kind: 'mt', origin: 'cloud', free: false,
        sourceLanguages: ['auto', ...LANGUAGE_CODES], targetLanguages: LANGUAGE_CODES })
      continue
    }
    if (model.kind === 'recognitionModel' && (model.id === 'aliyun' || model.id === 'minimax')) {
      const recognition = { ...settings.recognition, provider: model.id }
      add({ binding: `cloud:${model.id}`, name: recognitionLabel(recognition), kind: 'asr', origin: 'cloud', free: false,
        sourceLanguages: remoteSourceLanguages(recognition) })
      continue
    }
    if (model.id === 'cloud' || model.id === 'recognition') continue
    add({ binding: `cloud:${model.id}`, name: providers[model.id] ?? model.id, kind: 'mt', origin: 'cloud', free: model.free,
      sourceLanguages: model.id === 'index-translate' ? ['auto', ...INDEX_TRANSLATE_LANGUAGES] : model.id === 'mymemory' ? LANGUAGE_CODES : ['auto', ...LANGUAGE_CODES],
      targetLanguages: model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : LANGUAGE_CODES,
      images: model.id === 'index-translate' })
  }
  return result
}

export function configuredBatchSpeechModels(settings: AppSettings, credentials: Readonly<Record<CredentialProvider, boolean>>): AvailableGatewayModel[] {
  return (settings.modelWorkspace?.connections ?? []).flatMap(connection => {
    const preset = astrBotSpeechPreset(connection.service)
    if (!preset || (!preset.keyless && !credentials[preset.id === 'mimo' ? 'mimo-tts' : customCredentialSlot(connection.id)])) return []
    return connection.models.flatMap(model => {
      const binding = astrBotSpeechBinding(preset.id, model.profileId)
      if (!model.enabled || (binding === MIMO_TTS_BINDING && !isModelEnabled(settings, 'tts', binding))) return []
      return [{ binding, name: preset.voiceOnly ? connection.name : model.name,
        kind: preset.capability === 'ASR' ? 'asr' : 'tts', origin: 'cloud', free: !!preset.keyless }]
    })
  })
}
