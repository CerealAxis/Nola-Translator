import { useEffect, useMemo, useRef } from 'react'
import { getBridge, sessionStore, stores, updateSettings, useStore } from '@/store'
import { createStore } from '@/store/createStore'
import { useI18n } from '@/i18n'
import { installedPlaygroundModels } from './features/workbench/installed-models'
import { bindingIsLocal, normalizeModelBinding, type GatewayCapability, type ModelGatewaySnapshot } from '../shared/model-gateway'
import { ALIYUN_LANGUAGES, recognitionLabel, remoteSourceLanguages, supportsRecognitionNativeTranslation } from '../shared/cloud-config'
import { customModelPatch, customModelsOf } from '../shared/custom-models'
import { DEFAULT_SETTINGS, NO_TRANSLATION_LANGUAGE, type AppSettings, type AppSettingsPatch, type CredentialProvider, type RecognitionModelId, type TranslationProvider } from '../shared/settings'
import type { ResourceRecord } from '../shared/contracts'
import { configurationOf, recognitionLanguages } from '../shared/model-capabilities'
import { INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../shared/index-translate'
import { LANGUAGE_CODES } from '../shared/languages'
import { defaultModelBinding, isModelEnabled, modelEnablePatch, modelPolicyOf, sceneModelBinding, sceneModelPatch } from '../shared/model-policy'
import { notifyError, notifyGatewayModelUnavailable, notifyWarning } from '@/components/primitives/notify'
import { cloudModelsOf } from '../shared/cloud-models'

const imageTranslationIds = new Set<string>([...INDEX_TRANSLATE_MODEL_IDS, ...INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS])

export interface AvailableModel {
  /** Canonical binding: `resource:<id>`, `cloud:<provider>`, `mt-custom:<id>` or `custom:<id>`. */
  binding: string
  name: string
  kind: GatewayCapability
  /** `gateway` means the model gateway has this local model loaded right now. */
  origin: 'gateway' | 'cloud'
  /** Whether the configured interface can be called without paid credentials. */
  free: boolean
  sourceLanguages?: readonly string[]
  targetLanguages?: readonly string[]
  images?: boolean
}

export type AvailableModels = Record<GatewayCapability, AvailableModel[]>

const gatewayStore = createStore<{ snapshot: ModelGatewaySnapshot | null }>({ snapshot: null })
let tracking = 0
let stopGatewayTracking: (() => void) | undefined
let gatewayGeneration = 0

/** Share one IPC listener and initial read across every mounted catalog consumer. */
export function useGatewaySnapshot(): ModelGatewaySnapshot | null {
  useEffect(() => {
    const api = getBridge()?.gateway
    if (!api) return
    tracking++
    if (tracking === 1) {
      const generation = ++gatewayGeneration
      let receivedEvent = false
      stopGatewayTracking = api.onChanged(snapshot => {
        receivedEvent = true
        if (generation === gatewayGeneration) gatewayStore.setState({ snapshot })
      })
      void api.snapshot().then(snapshot => {
        // An earlier read must not overwrite a newer gateway event or a remounted subscription.
        if (generation === gatewayGeneration && !receivedEvent) gatewayStore.setState({ snapshot })
      }).catch(error => console.warn('[models] gateway snapshot failed', error))
    }
    return () => {
      if (--tracking !== 0) return
      ++gatewayGeneration
      stopGatewayTracking?.()
      stopGatewayTracking = undefined
      gatewayStore.setState({ snapshot: null })
    }
  }, [])
  return useStore(gatewayStore, state => state.snapshot)
}

export interface CatalogInput {
  settings: AppSettings
  resources: readonly ResourceRecord[]
  credentials: Readonly<Record<CredentialProvider, boolean>>
  snapshot: ModelGatewaySnapshot | null
  /**
   * Display names keyed by binding, from the installed catalog. A cloud interface named by its
   * provider reads better than a bare id, and the same labels already exist in the model pages.
   */
  names?: Readonly<Record<string, string>>
}

const readyService = (snapshot: ModelGatewaySnapshot | null, kind: GatewayCapability) =>
  snapshot?.state === 'running' && snapshot.services[kind].state === 'ready' ? snapshot.services[kind] : undefined

/**
 * What a consumer may select right now: the local model the gateway has loaded for that capability,
 * plus every cloud interface the user already configured enough to call.
 *
 * An installed local model that is not loaded deliberately stays out of the list. Starting it means
 * allocating memory the user did not ask for, so the gateway page owns that choice and the business
 * pages report it instead of triggering it.
 */
export function buildAvailableModels({ settings, resources, credentials, snapshot, names = {} }: CatalogInput): AvailableModels {
  const empty: AvailableModels = { asr: [], mt: [], tts: [], llm: [] }
  const displayName = (binding: string, fallback: string) => names[binding] || fallback || binding
  const loaded = (kind: GatewayCapability): AvailableModel | undefined => {
    const service = readyService(snapshot, kind)
    if (!service) return undefined
    const binding = normalizeModelBinding(kind, service.model)
    if (!binding || !bindingIsLocal(binding) || !isModelEnabled(settings, kind, binding)) return undefined
    const record = bindingIsLocal(binding) ? resources.find(item => item.resourceId === binding.slice(9)) : undefined
    if (!record?.installed) return undefined
    const capability = configurationOf(record)
    return { binding, name: displayName(binding, service.name || record?.name || ''), kind, origin: 'gateway', free: true,
      ...(record ? { sourceLanguages: record.kind === 'recognitionModel' ? recognitionLanguages(record) : capability?.sourceLanguages } : {}),
      ...(capability ? { targetLanguages: capability.targetLanguages } : {}),
      images: record ? imageTranslationIds.has(record.resourceId) : false }
  }
  const asrLoaded = loaded('asr')
  const clouds = cloudModelsOf(settings, credentials).filter(model => model.ready)
  const cloudAsr = clouds.filter(model => model.kind === 'recognitionModel').map(model => {
    const binding = `cloud:${model.id}`
    return {
      binding, name: displayName(binding, recognitionLabel({ ...DEFAULT_SETTINGS.recognition, ...settings.recognition, provider: model.id as 'aliyun' | 'minimax' })),
      kind: 'asr' as const, origin: 'cloud' as const, free: false,
      sourceLanguages: remoteSourceLanguages({ ...DEFAULT_SETTINGS.recognition, ...settings.recognition, provider: model.id as 'aliyun' | 'minimax' }),
    }
  })
  const asrOptions = [...(asrLoaded ? [asrLoaded] : []), ...cloudAsr]
  const effectiveAsr = resolveModelBinding('asr', sceneModelBinding(settings, 'asr'), asrOptions)
  const nativeTranslation = !effectiveAsr.unavailable && (effectiveAsr.binding === 'cloud:aliyun'
    ? supportsRecognitionNativeTranslation({ ...settings.recognition, provider: 'aliyun' })
    : effectiveAsr.binding.startsWith('resource:') && readyService(snapshot, 'asr')?.nativeTranslation === true)
  const cloudMt = clouds.filter(model => model.kind === 'translationModel').filter(model => model.id !== 'recognition' || nativeTranslation).map(model => {
    const profile = model.profile
    const binding = profile ? `mt-custom:${profile.id}` : `cloud:${model.id}`
    const languages = model.id === 'recognition' ? ALIYUN_LANGUAGES : model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : profile ? profile.languages : [...LANGUAGE_CODES]
    return { binding, name: displayName(binding, profile?.name ?? ''),
      kind: 'mt' as const, origin: 'cloud' as const, free: model.free, images: model.id === 'index-translate',
      sourceLanguages: ['auto', ...LANGUAGE_CODES] as readonly string[], targetLanguages: languages as readonly string[] }
  })
  const llmClouds = clouds.filter(model => model.profile).map(model => {
    const profile = model.profile!
    return { binding: `custom:${profile.id}`, name: displayName(`custom:${profile.id}`, profile.name), kind: 'llm' as const, origin: 'cloud' as const, free: false,
      sourceLanguages: profile.sourceLanguages, targetLanguages: profile.languages }
  })
  const merge = (kind: GatewayCapability, ...lists: AvailableModel[][]): AvailableModel[] => {
    const seen = new Set<string>()
    return lists.flat().filter(model => model.kind === kind && !seen.has(model.binding) && !!seen.add(model.binding))
  }
  return {
    asr: merge('asr', asrLoaded ? [asrLoaded] : [], cloudAsr),
    mt: merge('mt', (loaded('mt') ? [loaded('mt')!] : []), cloudMt),
    tts: merge('tts', loaded('tts') ? [loaded('tts')!] : []),
    llm: merge('llm', loaded('llm') ? [loaded('llm')!] : [], llmClouds),
  }
}

export function useAvailableModels(): AvailableModels {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const snapshot = useGatewaySnapshot()
  const names = useMemo(() => {
    const localNames = installedPlaygroundModels(resources, settings, credentials, t).map(model => [model.id, model.name] as const)
    const cloudNames: Array<readonly [string, string]> = []
    cloudModelsOf(settings, credentials).forEach(model => {
      const providerName = model.profile?.name ?? (model.id === 'aliyun' ? t('modelsSettingsUi.aliyunAsr')
        : model.id === 'minimax' ? t('settings.providerMiniMax')
        : model.id === 'microsoft' ? t('settings.providerMicrosoft')
        : model.id === 'mymemory' ? t('settings.providerMyMemory')
        : model.id === 'google' ? t('settings.providerGoogle')
        : model.id === 'index-translate' ? t('settings.providerIndexTranslate')
        : model.id === 'recognition' ? t('settings.providerRecognitionTranslation')
        : '')
      if (!providerName) return
      if (model.profile) cloudNames.push([`mt-custom:${model.profile.id}`, providerName], [`custom:${model.profile.id}`, providerName])
      else cloudNames.push([`cloud:${model.id}`, providerName])
    })
    return Object.fromEntries([...localNames, ...cloudNames])
  }, [resources, settings, credentials, t])
  if (snapshot?.availableModels) {
    const catalog = snapshot.availableModels
    const forKind = (kind: GatewayCapability) => catalog[kind]
      .filter(model => bindingIsLocal(model.binding)
        && isModelEnabled(settings, kind, model.binding)
        && resources.some(resource => resource.resourceId === model.binding.slice(9) && resource.installed)
        && normalizeModelBinding(kind, readyService(snapshot, kind)?.model) === model.binding)
      .map(model => ({ ...model, name: names[model.binding] || model.name }))
    const cloud = buildAvailableModels({ settings, resources, credentials, snapshot, names })
    const combine = (kind: GatewayCapability) => {
      const models = [...forKind(kind), ...cloud[kind].filter(model => model.origin === 'cloud')]
      const seen = new Set<string>()
      return models.filter(model => !seen.has(model.binding) && !!seen.add(model.binding))
    }
    return { asr: combine('asr'), mt: combine('mt'), tts: combine('tts'), llm: combine('llm') }
  }
  return buildAvailableModels({ settings, resources, credentials, snapshot, names })
}

export interface ModelResolution {
  binding: string
  /** The option the stale selection was replaced with, or null when it still stands. */
  replaced: AvailableModel | null
  /** Nothing can serve this capability, so the consumer has to say so rather than start. */
  unavailable: boolean
}

/** Keep a valid explicit choice; otherwise only a loaded local model may replace it. */
export function resolveModelBinding(kind: GatewayCapability, saved: string, options: readonly AvailableModel[]): ModelResolution {
  const wanted = normalizeModelBinding(kind, saved)
  const hit = options.find(model => model.kind === kind && model.binding === wanted)
  if (hit) return { binding: hit.binding, replaced: null, unavailable: false }
  const loaded = options.find(model => model.kind === kind && model.origin === 'gateway')
  if (loaded) return { binding: loaded.binding, replaced: loaded, unavailable: false }
  return { binding: wanted, replaced: null, unavailable: true }
}

/** The saved selection for a capability, in binding form. */
export function savedBindingOf(kind: GatewayCapability, settings: AppSettings): string {
  return sceneModelBinding(settings, kind)
}

/**
 * Persist a business selection.
 *
 * The gateway's own bindings are written by the model gateway page only; a consumer choosing a model
 * here changes its session default, never what the gateway has loaded.
 */
export function modelBindingPatch(kind: GatewayCapability, binding: string, settings: AppSettings): AppSettingsPatch {
  const scenePatch = sceneModelPatch(settings, kind, binding)
  const enablePatch = modelEnablePatch(settings, kind, binding, true)
  const currentPolicy = modelPolicyOf(settings)
  return {
    ...legacyModelBindingPatch(kind, binding, settings),
    modelPolicy: {
      enabled: { ...currentPolicy.enabled, ...scenePatch.modelPolicy?.enabled, ...enablePatch.modelPolicy?.enabled },
      defaults: { ...currentPolicy.defaults, ...scenePatch.modelPolicy?.defaults, ...enablePatch.modelPolicy?.defaults },
      selections: { ...currentPolicy.selections, ...scenePatch.modelPolicy?.selections, ...enablePatch.modelPolicy?.selections },
    },
  }
}

function legacyModelBindingPatch(kind: GatewayCapability, binding: string, settings: AppSettings): AppSettingsPatch {
  const normalized = normalizeModelBinding(kind, binding)
  if (!normalized) return {}
  if (kind === 'llm') return sceneModelPatch(settings, kind, normalized)
  if (kind === 'tts') return { synthesis: { modelId: normalized.slice(9), voice: '' } }
  if (kind === 'asr') {
    return bindingIsLocal(normalized)
      ? { recognition: { provider: 'local', modelId: normalized.slice(9) as RecognitionModelId } }
      : { recognition: { provider: normalized.slice(6) as 'aliyun' | 'minimax' } }
  }
  if (bindingIsLocal(normalized)) {
    const model = normalized.slice(9)
    return { translation: { provider: 'local', localModelId: model,
      targetLanguage: settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? 'zh' : settings.translation.targetLanguage } }
  }
  if (normalized.startsWith('mt-custom:')) {
    const profile = customModelsOf(settings.translation).find(item => item.id === normalized.slice(10))
    return profile ? { translation: customModelPatch(settings.translation, profile) } : {}
  }
  return { translation: { provider: normalized.slice(6) as TranslationProvider,
    targetLanguage: settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? 'zh' : settings.translation.targetLanguage } }
}

/** Point a gateway capability at a model; only the model gateway page calls this. */
export function gatewayBindingPatch(kind: GatewayCapability, binding: string): AppSettingsPatch {
  const normalized = normalizeModelBinding(kind, binding)
  if (!normalized) return {}
  if (kind === 'llm') return { modelGateway: { llmModel: normalized } }
  if (kind === 'asr') return { modelGateway: { asrModel: normalized } }
  if (kind === 'tts') return { modelGateway: { ttsModel: normalized } }
  return { modelGateway: { mtModel: normalized } }
}

/**
 * Write a business selection.
 *
 * Selecting a translation model while the target is switched off re-enables it, so the translation
 * track becomes visible again; a selection that only changes the provider keeps the display state
 * the user last set.
 */
export async function selectModelBinding(kind: GatewayCapability, binding: string, settings: AppSettings): Promise<void> {
  const current = stores.settings.getState().settings ?? settings
  const patch = modelBindingPatch(kind, binding, current)
  if (!Object.keys(patch).length) return
  const target = patch.translation?.targetLanguage
  if (target && target !== NO_TRANSLATION_LANGUAGE && current.translation.targetLanguage === NO_TRANSLATION_LANGUAGE) {
    patch.overlay = { showTranslation: true }
  }
  await updateSettings(patch)
}

export interface ModelSelection {
  /** The binding to render, after any automatic replacement. */
  binding: string
  /** Nothing can serve this capability; the caller has to say so instead of starting. */
  unavailable: boolean
  select(binding: string): void
}

/**
 * A consumer's model selection with the stale case handled.
 *
 * The gateway can load a different local model than the one a page last used, and a cloud profile
 * can lose its key. Rather than starting a session that fails, the selection moves to what is
 * actually callable and `onSwitch` reports the replacement once, so the page can name both models in
 * its own copy instead of letting the user discover the change in a failure toast.
 *
 * `off` marks a capability the user switched off, such as a caption session that shows source text
 * only. Then there is nothing to repair: replacing it would re-enable translation on its own.
 */
export function useModelSelection(kind: GatewayCapability, options: readonly AvailableModel[],
  settings: AppSettings, onSwitch?: (replaced: AvailableModel) => void, off = false): ModelSelection {
  const { t } = useI18n()
  const gatewaySnapshot = useGatewaySnapshot()
  const resources = useStore(stores.models, state => state.resources)
  const active = useStore(sessionStore, state => !['idle', 'error'].includes(state.status))
  const browserActive = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionServiceBusy || state.captionService === 'loading')
  const locked = active || browserActive
  const reported = useRef('')
  const hadAvailable = useRef(false)
  const saved = savedBindingOf(kind, settings)
  const resolution = off ? { binding: '', replaced: null, unavailable: false } : resolveModelBinding(kind, saved || defaultModelBinding(settings, kind), options)
  const replaced = resolution.replaced
  useEffect(() => {
    if (locked || off) return
    if (!resolution.unavailable) { hadAvailable.current = true; return }
    if (!hadAvailable.current || gatewaySnapshot?.state !== 'running' || gatewaySnapshot.services?.[kind]?.state !== 'failed') return
    hadAvailable.current = false
    const label = kind === 'asr' ? t('session.recognitionModel') : kind === 'mt' ? t('session.translationModel') : t(`gateway.${kind}`)
    notifyGatewayModelUnavailable(t('gateway.modelNone', { name: label }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
  }, [resolution.unavailable, locked, off, kind, t, gatewaySnapshot])
  // Do not leak a stale saved binding into the UI when nothing can serve it.
  const binding = locked ? saved : resolution.unavailable ? '' : resolution.binding
  useEffect(() => {
    if (locked || !replaced || replaced.binding === saved) return
    if (replaced.origin === 'gateway'
        && resources.some(resource => resource.resourceId === replaced.binding.slice(9) && resource.installed)) return
    const signature = `${saved}:${replaced.binding}`
    if (reported.current === signature) return
    reported.current = signature
    void selectModelBinding(kind, replaced.binding, settings).then(() => onSwitch?.(replaced)).catch(error => {
      reported.current = ''
      notifyError(t('errors.settingsSaveFailed'), { cause: error })
    })
  }, [binding, replaced?.binding, replaced?.origin, saved, locked, resources])
  return { binding, unavailable: resolution.unavailable,
    select: next => {
      if (locked) return
      if (!options.some(model => model.binding === next)) {
        notifyWarning(t('modelsSettingsUi.selectionUnavailable'), {
          description: t('modelsSettingsUi.selectionUnavailableDescription'),
          action: { label: t('gateway.title'), onPress: () => {
            const bridge = getBridge()
            if (bridge?.app.openMainPage) void bridge.app.openMainPage('#/model-gateway').catch(error => notifyError(t('errors.unknownFailure'), { cause: error }))
            else window.location.hash = '#/model-gateway'
          } },
        })
        return
      }
      void selectModelBinding(kind, next, settings).catch(error => notifyError(t('errors.settingsSaveFailed'), { cause: error }))
    } }
}
