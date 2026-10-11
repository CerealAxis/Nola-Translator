import { configurationOf, isModelReady, recognitionLanguages, supportsTranslation, translationLanguages } from '../shared/model-capabilities'
import { supportsSelectedEngine } from '../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'
import type { ComputeSettings } from '../shared/compute'
import type { ResourceRecord } from '../shared/contracts'
import { normalizeLanguage } from '../shared/languages'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS, TARGET_LANGUAGE_OPTIONS } from '@/bridge'
import { ALIYUN_LANGUAGES, recognitionLabel, remoteSourceLanguages } from '../shared/cloud-config'

export interface ModelChoice { value: string; label: string; isDisabled: boolean }

/**
 * Only installed recognition models are offered, matching the translation list: a model that was
 * never downloaded cannot run, so listing it invites a choice that fails at session start.
 *
 * The configured id stays in the list even when it is not installed (just uninstalled, or settings
 * synced from another machine): it is the current value rather than a candidate, and dropping it
 * leaves the picker blank, which reads as broken. It is disabled, and an empty result is left for
 * the caller to render as its own "nothing installed" state.
 */
function installedRecognitionModels(resources: readonly ResourceRecord[], currentId: string, compute: ComputeSettings): ModelChoice[] {
  const installed = resources
    .filter(model => model.kind === 'recognitionModel' && model.installed)
    .map(model => ({ value: model.resourceId, label: model.name, isDisabled: !isModelReady(model) || !supportsSelectedEngine(model, compute, model.resourceId) }))
  if (installed.length > 0 && !installed.some(option => option.value === currentId)) {
    const current = resources.find(model => model.resourceId === currentId)
    installed.push({ value: currentId, label: current?.name ?? currentId, isDisabled: true })
  }
  return installed
}

export function useModelOptions(recognitionId?: string, translationId?: string, source?: string, target?: string) {
  const resources = useStore(stores.models, state => state.resources)
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const recognitionProvider = settings.recognition.provider ?? 'local'
  const remote = recognitionProvider !== 'local'
  const recognition = remote ? undefined : resources.find(model => model.resourceId === (recognitionId ?? settings.recognition.modelId))
  const translation = resources.find(model => model.resourceId === (translationId ?? settings.translation.localModelId))
  const sourceLanguage = source ?? settings.recognition.sourceLanguage
  const targetLanguage = target ?? settings.translation.targetLanguage
  return {
    recognition, translation, recognitionProvider,
    sourceLanguages: remote ? [...remoteSourceLanguages(settings.recognition)] : recognitionLanguages(recognition),
    // Native translation reuses the Aliyun socket, so its targets are that connection's language
    // table. A provider without one has already fallen back to MyMemory above.
    targetLanguages: settings.translation.provider === 'recognition' ? ['none', ...ALIYUN_LANGUAGES] : settings.translation.provider === 'local' ? translationLanguages(translation, sourceLanguage) : [...TARGET_LANGUAGE_OPTIONS],
    recognitionModels: remote ? [{ value: settings.recognition.modelId, label: recognitionLabel(settings.recognition), isDisabled: false }] : installedRecognitionModels(resources, settings.recognition.modelId, settings.compute ?? DEFAULT_COMPUTE_SETTINGS),
    translationModels: resources.filter(model => model.kind === 'translationModel' && model.installed).map(model => ({
      value: model.resourceId, label: model.name,
      isDisabled: !isModelReady(model) || !supportsSelectedEngine(model, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, model.resourceId)
        || (targetLanguage === 'none'
          ? !translationLanguages(model, sourceLanguage).some(code => code !== 'none' && code !== normalizeLanguage(sourceLanguage))
          : !supportsTranslation(model, sourceLanguage, targetLanguage)),
    })),
    translationCompatible: settings.translation.provider !== 'local' || supportsTranslation(translation, sourceLanguage, settings.translation.targetLanguage),
    configured: remote || !!configurationOf(recognition),
  }
}
