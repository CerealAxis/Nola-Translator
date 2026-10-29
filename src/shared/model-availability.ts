import { cloudModelsOf } from './cloud-models'
import { ALIYUN_LANGUAGES, recognitionLabel, remoteSourceLanguages } from './cloud-config'
import { INDEX_TRANSLATE_LANGUAGES } from './index-translate'
import { LANGUAGE_CODES } from './languages'
import { isModelEnabled } from './model-policy'
import type { AvailableGatewayModel, GatewayCapability } from './model-gateway'
import type { AppSettings, CredentialProvider } from './settings'

/** The main process supplies credential presence; this catalog never reads or returns secrets. */
export function buildConfiguredCloudModels(settings: AppSettings, credentials: Readonly<Record<CredentialProvider, boolean>>): Record<GatewayCapability, AvailableGatewayModel[]> {
  const result: Record<GatewayCapability, AvailableGatewayModel[]> = { asr: [], mt: [], tts: [], llm: [] }
  const providers: Record<string, string> = { microsoft: 'Microsoft Translator', google: 'Google Translate', mymemory: 'MyMemory', 'index-translate': 'Index Translate', recognition: 'Aliyun LiveTranslate' }
  const add = (model: AvailableGatewayModel) => {
    if (isModelEnabled(settings, model.kind, model.binding)) result[model.kind].push(model)
  }
  for (const model of cloudModelsOf(settings, credentials).filter(item => item.ready)) {
    if (model.profile) {
      const profile = model.profile
      add({ binding: `custom:${profile.id}`, name: profile.name, kind: 'llm', origin: 'cloud', free: false,
        sourceLanguages: profile.sourceLanguages, targetLanguages: profile.languages })
      add({ binding: `mt-custom:${profile.id}`, name: profile.name, kind: 'mt', origin: 'cloud', free: false,
        sourceLanguages: profile.sourceLanguages ?? ['auto', ...LANGUAGE_CODES], targetLanguages: profile.languages })
      continue
    }
    if (model.kind === 'recognitionModel' && (model.id === 'aliyun' || model.id === 'minimax')) {
      const recognition = { ...settings.recognition, provider: model.id }
      add({ binding: `cloud:${model.id}`, name: recognitionLabel(recognition), kind: 'asr', origin: 'cloud', free: false,
        sourceLanguages: remoteSourceLanguages(recognition) })
      continue
    }
    if (model.id === 'cloud') continue
    add({ binding: `cloud:${model.id}`, name: providers[model.id] ?? model.id, kind: 'mt', origin: 'cloud', free: model.free,
      sourceLanguages: model.id === 'recognition' ? ['auto', ...ALIYUN_LANGUAGES] : model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : ['auto', ...LANGUAGE_CODES],
      targetLanguages: model.id === 'recognition' ? ALIYUN_LANGUAGES : model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : LANGUAGE_CODES,
      images: model.id === 'index-translate' })
  }
  return result
}
