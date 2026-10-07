import { configurationOf, isModelReady, recognitionLanguages, supportsTranslation, translationLanguages } from '../shared/model-capabilities'
import { supportsSelectedEngine } from '../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'
import { normalizeLanguage } from '../shared/languages'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS, TARGET_LANGUAGE_OPTIONS } from '@/bridge'

export function useModelOptions(recognitionId?: string, translationId?: string, source?: string, target?: string) {
  const resources = useStore(stores.models, state => state.resources)
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const recognition = resources.find(model => model.resourceId === (recognitionId ?? settings.recognition.modelId))
  const translation = resources.find(model => model.resourceId === (translationId ?? settings.translation.localModelId))
  const sourceLanguage = source ?? settings.recognition.sourceLanguage
  const targetLanguage = target ?? settings.translation.targetLanguage
  return {
    recognition, translation,
    sourceLanguages: recognitionLanguages(recognition),
    targetLanguages: settings.translation.provider === 'local' ? translationLanguages(translation, sourceLanguage) : [...TARGET_LANGUAGE_OPTIONS],
    recognitionModels: resources.filter(model => model.kind === 'recognitionModel').map(model => ({ value: model.resourceId, label: model.name, isDisabled: !isModelReady(model) || !supportsSelectedEngine(model, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, model.resourceId) })),
    translationModels: resources.filter(model => model.kind === 'translationModel' && model.installed).map(model => ({
      value: model.resourceId, label: model.name,
      isDisabled: !isModelReady(model) || !supportsSelectedEngine(model, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, model.resourceId)
        || (targetLanguage === 'none'
          ? !translationLanguages(model, sourceLanguage).some(code => code !== 'none' && code !== normalizeLanguage(sourceLanguage))
          : !supportsTranslation(model, sourceLanguage, targetLanguage)),
    })),
    translationCompatible: settings.translation.provider !== 'local' || supportsTranslation(translation, sourceLanguage, settings.translation.targetLanguage),
    configured: !!configurationOf(recognition),
  }
}
