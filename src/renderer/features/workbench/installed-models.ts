import type { AppSettings, CredentialProvider } from '../../../shared/settings'
import type { ResourceRecord } from '../../../shared/contracts'
import { INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../../../shared/index-translate'
import type { TranslationKey } from '@/i18n'
import { cloudModelsOf } from '../../../shared/cloud-models'
import type { ModelKind } from './demo-runtime'
import { configurationOf, recognitionLanguages } from '../../../shared/model-capabilities'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { remoteSourceLanguages } from '../../../shared/cloud-config'
import { LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE } from '../../../shared/language-model'
import type { AvailableModels } from '@/available-models'

export interface PlaygroundModel {
  id: string
  name: string
  kind: ModelKind
  contextWindow?: number
  images?: boolean
  sourceLanguages?: readonly string[]
  targetLanguages?: readonly string[]
}

/**
 * What the workbench may run: the model the gateway loaded for each capability, plus every cloud
 * interface the user configured enough to call. An installed but unloaded local model stays out,
 * because selecting one would start a model the user never asked the gateway to load.
 */
export function callableModels(catalog: AvailableModels, playground: readonly PlaygroundModel[]): PlaygroundModel[] {
  return (['llm', 'asr', 'mt', 'tts'] as const).flatMap(kind => catalog[kind].map(model => {
    const known = playground.find(item => item.kind === kind && item.id === model.binding)
    return { ...known, id: model.binding, name: model.name, kind,
      ...(model.sourceLanguages ? { sourceLanguages: model.sourceLanguages } : {}),
      ...(model.targetLanguages ? { targetLanguages: model.targetLanguages } : {}),
      ...(model.images !== undefined ? { images: model.images } : {}) }
  }))
}

/** Mirrors the installed catalog, including saved profiles and configured cloud services. */
export function installedPlaygroundModels(
  resources: readonly ResourceRecord[],
  settings: AppSettings | null,
  credentials: Readonly<Record<CredentialProvider, boolean>>,
  t: (key: TranslationKey) => string,
): PlaygroundModel[] {
  const legacyIndexWeights: Record<string, number> = {
    'index-translate-2b-q4-k-m': 1_312_164_352,
    'index-translate-9b-q4-k-m': 5_780_090_304,
    'index-translate-35b-a3b-q4-k-m': 21_713_462_400,
  }
  const models: PlaygroundModel[] = resources.filter(resource => resource.installed ||
    INDEX_TRANSLATE_MODEL_IDS.includes(resource.resourceId as typeof INDEX_TRANSLATE_MODEL_IDS[number]) &&
    resource.installedBytes >= (legacyIndexWeights[resource.resourceId] ?? Number.MAX_SAFE_INTEGER)).map(resource => ({
    id: `resource:${resource.resourceId}`, name: resource.name,
    kind: resource.kind === 'recognitionModel' ? 'asr' : resource.kind === 'ttsModel' ? 'tts' : resource.resourceId.startsWith('qwen35-') ? 'llm' : 'mt',
    contextWindow: resource.resourceId.startsWith('qwen35-') ? LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE : undefined,
    images: new Set<string>([...INDEX_TRANSLATE_MODEL_IDS, ...INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS]).has(resource.resourceId),
    sourceLanguages: resource.kind === 'recognitionModel' ? recognitionLanguages(resource) : configurationOf(resource)?.sourceLanguages,
    targetLanguages: configurationOf(resource)?.targetLanguages,
  }))
  const names = {
    cloud: t('modelsSettingsUi.cloudService'), microsoft: t('settings.providerMicrosoft'),
    mymemory: t('settings.providerMyMemory'), google: t('settings.providerGoogle'),
    'index-translate': t('settings.providerIndexTranslate'), aliyun: t('modelsSettingsUi.aliyunAsr'),
    minimax: t('settings.providerMiniMax'), recognition: t('settings.providerRecognitionTranslation'),
  }
  for (const model of cloudModelsOf(settings, credentials).filter(model => model.id !== 'recognition' && (model.ready || model.profile))) {
    if (model.profile) {
      models.push({ id: model.id, name: model.profile.name, kind: 'llm' },
        { id: `mt-custom:${model.profile.id}`, name: model.profile.name, kind: 'mt', sourceLanguages: ['auto', ...LANGUAGE_CODES], targetLanguages: LANGUAGE_CODES })
    } else if (model.id in names) {
      models.push({ id: `cloud:${model.id}`, name: names[model.id as keyof typeof names],
        kind: model.kind === 'recognitionModel' ? 'asr' : 'mt', images: model.id === 'index-translate',
        sourceLanguages: model.kind === 'recognitionModel' && settings && (model.id === 'aliyun' || model.id === 'minimax')
          ? remoteSourceLanguages({ ...settings.recognition, provider: model.id }) : ['auto', ...LANGUAGE_CODES], targetLanguages: LANGUAGE_CODES })
    }
  }
  const order: ModelKind[] = ['llm', 'asr', 'mt', 'tts']
  return models.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}
