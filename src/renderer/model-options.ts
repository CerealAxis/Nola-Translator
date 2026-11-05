import { configurationOf, recognitionLanguages, supportsTranslation, translationLanguages } from '../shared/model-capabilities'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS } from '@/bridge'
import { resolveModelBinding, useAvailableModels } from './available-models'
import { remoteSourceLanguages } from '../shared/cloud-config'
import { normalizeModelBinding } from '../shared/model-gateway'
import { sceneModelBinding } from '../shared/model-policy'
import { buildConfiguredCloudModels } from '../shared/model-availability'
import type { AvailableModel } from './available-models'
import type { ResourceRecord } from '../shared/contracts'
import { normalizeLanguage } from '../shared/languages'

export interface ModelChoice { value: string; label: string; isDisabled: boolean }

export function modelSupportsTranslation(model: AvailableModel | undefined, resource: ResourceRecord | undefined, source: string, target: string): boolean {
  if (target === 'none') return true
  if (resource) return supportsTranslation(resource, source, target)
  return !!model && (model.sourceLanguages === undefined || model.sourceLanguages.map(normalizeLanguage).includes(normalizeLanguage(source)))
    && !!model.targetLanguages?.map(normalizeLanguage).includes(normalizeLanguage(target))
}

export function useModelOptions(recognitionId?: string, translationId?: string, source?: string, target?: string) {
  const catalog = useAvailableModels()
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const clouds = buildConfiguredCloudModels(settings, credentials)
  const asrBinding = recognitionId ? normalizeModelBinding('asr', recognitionId)
    : resolveModelBinding('asr', sceneModelBinding(settings, 'asr'), catalog.asr).binding
  const mtBinding = translationId ? normalizeModelBinding('mt', translationId)
    : resolveModelBinding('mt', sceneModelBinding(settings, 'mt'), catalog.mt).binding
  const selectedAsr = [...catalog.asr, ...clouds.asr].find(model => model.binding === asrBinding)
  const selectedMt = [...catalog.mt, ...clouds.mt].find(model => model.binding === mtBinding)
  const recognitionProvider = asrBinding.startsWith('cloud:') ? asrBinding.slice(6) as 'aliyun' | 'minimax' : 'local'
  const remote = recognitionProvider !== 'local'
  const recognition = remote ? undefined : resources.find(model => `resource:${model.resourceId}` === asrBinding)
  const translation = resources.find(model => `resource:${model.resourceId}` === mtBinding)
  const sourceLanguage = source ?? settings.recognition.sourceLanguage
  const targetLanguage = target ?? settings.translation.targetLanguage
  const recognitionSourceLanguages = selectedAsr?.sourceLanguages ?? (remote
    ? remoteSourceLanguages({ ...settings.recognition, provider: recognitionProvider }) : recognitionLanguages(recognition))
  const translationSourceLanguages = selectedMt?.sourceLanguages ?? configurationOf(translation)?.sourceLanguages ?? []
  const sourceLanguages = targetLanguage === 'none' || selectedMt?.sourceLanguages === undefined && !configurationOf(translation) ? recognitionSourceLanguages
    : recognitionSourceLanguages.filter(code => translationSourceLanguages.map(normalizeLanguage).includes(normalizeLanguage(code)))
  const targetLanguages = translation ? translationLanguages(translation, sourceLanguage)
    : ['none', ...(selectedMt?.targetLanguages ?? []).filter(code => modelSupportsTranslation(selectedMt, undefined, sourceLanguage, code))]
  return {
    recognition, translation, recognitionProvider,
    translationAvailable: !!selectedMt || !!configurationOf(translation),
    sourceLanguages, recognitionSourceLanguages,
    supportsTranslation: (from: string, to: string) => modelSupportsTranslation(selectedMt, translation, from, to),
    translationSourceLanguages,
    translationTargetLanguages: selectedMt?.targetLanguages ?? configurationOf(translation)?.targetLanguages ?? [],
    targetLanguages,
    localRecognitionModels: catalog.asr.filter(model => model.origin === 'gateway').map(model => ({ value: model.binding.slice(9), label: model.name, isDisabled: false })),
    recognitionModels: catalog.asr.map(model => ({ value: model.binding.startsWith('resource:') ? model.binding.slice(9) : model.binding, label: model.name, isDisabled: false })),
    translationModels: catalog.mt.filter(model => model.origin === 'gateway').map(model => ({
      value: model.binding.slice(9), label: model.name,
      isDisabled: !modelSupportsTranslation(model, resources.find(resource => `resource:${resource.resourceId}` === model.binding), sourceLanguage, targetLanguage),
    })),
    translationCompatible: modelSupportsTranslation(selectedMt, translation, sourceLanguage, targetLanguage),
    configured: remote || !!configurationOf(recognition),
  }
}
