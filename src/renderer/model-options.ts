import { configurationOf, recognitionLanguages, supportsTranslation, translationLanguages } from '../shared/model-capabilities'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS, TARGET_LANGUAGE_OPTIONS } from '@/bridge'
import { INDEX_TRANSLATE_LANGUAGES } from '../shared/index-translate'
import { useAvailableModels } from './available-models'
import { ALIYUN_LANGUAGES, remoteSourceLanguages } from '../shared/cloud-config'

export interface ModelChoice { value: string; label: string; isDisabled: boolean }

export function useModelOptions(recognitionId?: string, translationId?: string, source?: string, target?: string) {
  const catalog = useAvailableModels()
  const resources = useStore(stores.models, state => state.resources)
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const recognitionProvider = settings.recognition.provider ?? 'local'
  const remote = recognitionProvider !== 'local'
  const recognition = remote ? undefined : resources.find(model => model.resourceId === (recognitionId ?? settings.recognition.modelId))
  const translation = resources.find(model => model.resourceId === (translationId ?? settings.translation.localModelId))
  const sourceLanguage = source ?? settings.recognition.sourceLanguage
  const targetLanguage = target ?? settings.translation.targetLanguage
  const recognizedSources = remote ? [...remoteSourceLanguages(settings.recognition)] : recognitionLanguages(recognition)
  const sourceLanguages = settings.translation.provider === 'cloud' && settings.translation.cloudSourceLanguages
    ? recognizedSources.filter(code => settings.translation.cloudSourceLanguages!.includes(code))
    : recognizedSources
  return {
    recognition, translation, recognitionProvider,
    sourceLanguages,
    // Native translation reuses the Aliyun socket, so its targets are that connection's language
    // table. A provider without one has already fallen back to MyMemory above.
    targetLanguages: settings.translation.provider === 'recognition' ? ['none', ...ALIYUN_LANGUAGES] : settings.translation.provider === 'index-translate' ? ['none', ...INDEX_TRANSLATE_LANGUAGES] : settings.translation.provider === 'local' ? translationLanguages(translation, sourceLanguage) : settings.translation.provider === 'cloud' && settings.translation.cloudLanguages ? ['none', ...settings.translation.cloudLanguages] : [...TARGET_LANGUAGE_OPTIONS],
    localRecognitionModels: catalog.asr.filter(model => model.origin === 'gateway').map(model => ({ value: model.binding.slice(9), label: model.name, isDisabled: false })),
    recognitionModels: catalog.asr.map(model => ({ value: model.binding.startsWith('resource:') ? model.binding.slice(9) : model.binding, label: model.name, isDisabled: false })),
    translationModels: catalog.mt.filter(model => model.origin === 'gateway').map(model => ({
      value: model.binding.slice(9), label: model.name,
      isDisabled: model.targetLanguages ? targetLanguage !== 'none' && !model.targetLanguages.includes(targetLanguage) : false,
    })),
    translationCompatible: settings.translation.provider !== 'local' || supportsTranslation(translation, sourceLanguage, settings.translation.targetLanguage),
    configured: remote || !!configurationOf(recognition),
  }
}
