import { configurationOf, recognitionLanguages, supportsTranslation, translationLanguages } from '../shared/model-capabilities'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS } from '@/bridge'
import { resolveModelBinding, useAvailableModels, useGatewaySnapshot } from './available-models'
import { remoteSourceLanguages } from '../shared/cloud-config'
import { bindingIsLocal, normalizeModelBinding } from '../shared/model-gateway'
import { defaultModelBinding, sceneModelBinding } from '../shared/model-policy'
import { buildConfiguredCloudModels } from '../shared/model-availability'
import type { AvailableModel } from './available-models'
import type { ResourceRecord } from '../shared/contracts'
import { normalizeLanguage } from '../shared/languages'
import { screenConfigSchema, screenTranslationModel } from '../shared/screen-translation'

export interface ModelChoice { value: string; label: string; isDisabled: boolean }
const defaultScreenConfig = screenConfigSchema.parse({})

export function modelSupportsTranslation(model: AvailableModel | undefined, resource: ResourceRecord | undefined, source: string, target: string): boolean {
  if (target === 'none') return true
  if (resource) return supportsTranslation(resource, source, target)
  return !!model && (model.sourceLanguages === undefined || model.sourceLanguages.map(normalizeLanguage).includes(normalizeLanguage(source)))
    && !!model.targetLanguages?.map(normalizeLanguage).includes(normalizeLanguage(target))
}

export function intersectLanguages(languages: readonly string[], supported?: readonly string[]): string[] {
  const codes = [...new Set(languages.map(normalizeLanguage))]
  if (!supported) return codes
  const allowed = new Set(supported.map(normalizeLanguage))
  return codes.filter(code => allowed.has(code))
}

export function modelTranslationLanguages(model: AvailableModel | undefined, resource: ResourceRecord | undefined, source: string) {
  return resource ? translationLanguages(resource, source).filter(code => code !== 'none')
    : intersectLanguages((model?.targetLanguages ?? []).filter(code => code !== 'none' && modelSupportsTranslation(model, undefined, source, code)))
}

export function useScreenLanguageModels({ source, binding, needsOcr = true }: { source: string; binding?: string; needsOcr?: boolean }) {
  const gateway = useGatewaySnapshot()
  const catalog = useAvailableModels()
  const resources = useStore(stores.models, state => state.resources)
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const mtBinding = binding ?? screenTranslationModel(defaultScreenConfig, settings)
  const translator = catalog.mt.find(model => model.binding === mtBinding && model.binding !== 'cloud:recognition')
  const translation = translator?.origin === 'gateway' ? resources.find(resource => `resource:${resource.resourceId}` === mtBinding) : undefined
  const ocrBinding = normalizeModelBinding('ocr', settings.modelGateway.ocrModel) || defaultModelBinding(settings, 'ocr')
  const ocr = catalog.ocr.find(model => !ocrBinding || model.binding === ocrBinding)
  const ocrResource = ocr ? resources.find(resource => resource.kind === 'ocrModel' && `resource:${resource.resourceId}` === ocr.binding) : undefined
  const ocrCodes = ocrResource?.languages.length ? ['auto', ...ocrResource.languages] : ocr?.sourceLanguages ?? []
  const translationSources = configurationOf(translation)?.sourceLanguages ?? translator?.sourceLanguages
  const targetsFor = (from: string) => modelTranslationLanguages(translator, translation, from)
  const sourceLanguages = intersectLanguages(needsOcr ? ocrCodes : translationSources ?? [], translationSources)
    .filter(code => targetsFor(code).length > 0)
  const unavailable = gateway?.state !== 'running' ? 'gateway'
    : !translator || needsOcr && !ocrCodes.length ? 'models'
      : !sourceLanguages.length ? 'pair' : undefined
  const requiredModels = [
    ...(!translator && (!mtBinding || bindingIsLocal(mtBinding)) ? ['MT'] : []),
    ...(needsOcr && !ocrCodes.length ? ['OCR'] : []),
  ]
  return { sourceLanguages, targetLanguages: targetsFor(source), targetsFor, unavailable, requiredModels } as const
}

export function useModelOptions(recognitionId?: string, translationId?: string, source?: string, target?: string) {
  const gateway = useGatewaySnapshot()
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
  const sourceLanguages = intersectLanguages(recognitionSourceLanguages,
    targetLanguage === 'none' ? undefined : selectedMt?.sourceLanguages ?? configurationOf(translation)?.sourceLanguages)
  const targetLanguages = ['none', ...(selectedMt ? modelTranslationLanguages(selectedMt, translation, sourceLanguage) : [])]
  const localRequired = !asrBinding || bindingIsLocal(asrBinding) || !!mtBinding && bindingIsLocal(mtBinding) && targetLanguage !== 'none'
  const languageUnavailable: 'gateway' | 'models' | 'pair' | undefined = localRequired && gateway?.state !== 'running' ? 'gateway'
    : !selectedAsr ? 'models'
      : !sourceLanguages.length ? 'pair' : undefined
  return {
    recognition, translation, recognitionProvider,
    translationAvailable: !!selectedMt || !!configurationOf(translation),
    sourceLanguages, recognitionSourceLanguages,
    languageUnavailable,
    requiredModels: [
      ...(!selectedAsr && (!asrBinding || bindingIsLocal(asrBinding)) ? ['ASR'] : []),
      ...(targetLanguage !== 'none' && !selectedMt && (!mtBinding || bindingIsLocal(mtBinding)) ? ['MT'] : []),
    ],
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
