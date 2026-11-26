import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { computeSettingsSchema, DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'

import { DEFAULT_SETTINGS, RECOGNITION_MODEL_IDS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, TRANSLATION_PROVIDERS, type AppSettings, type AppSettingsPatch } from '../shared/settings'
import { findGithubProxyNode, GITHUB_PROXY_AUTO, GITHUB_PROXY_OFF } from '../shared/github-proxies'
import { findPypiMirrorNode, findPytorchWheelMirrorNode, PYPI_MIRROR_AUTO, PYPI_MIRROR_OFF, PYTORCH_WHEEL_MIRROR_AUTO, PYTORCH_WHEEL_MIRROR_OFF } from '../shared/pypi-mirrors'
import { ALIYUN_RECOGNITION_MODELS, MINIMAX_RECOGNITION_MODELS, RECOGNITION_PROVIDERS } from '../shared/settings'
import { remoteSourceLanguages, supportsRecognitionNativeTranslation } from '../shared/cloud-config'
import { desktopTypographyShape, settingsPatchSchema } from './settings-schema'
import { customModelSchema, synchronizeCustomModel } from '../shared/custom-models'
import { LANGUAGE_CODES } from '../shared/languages'
import { mergeModelPolicy, modelPolicyOf, modelPolicySchema } from '../shared/model-policy'
import { meetingModeSettingsSchema } from '../shared/meeting-mode'
import { migrateTtsSettings, persistedTtsSettings } from '../shared/tts/settings-migration'

// Store-internal patches may also touch fields the IPC schema exposes only through their own channels.
export type StorePatch = AppSettingsPatch & { modelStoragePath?: string; version?: 3; browserConnection?: { enabled: boolean } }

class SettingsVersionError extends Error {}

function realtimeSettings(value: unknown): NonNullable<AppSettings['realtime']> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const { s2sModel, virtualInputDeviceId, ...other } = source
  return {
    ...other,
    latencyDetection: source.latencyDetection === true,
    outputMode: ['source', 'translation', 'speech'].includes(source.outputMode as string) ? source.outputMode as 'source' | 'translation' | 'speech' : 'translation',
    speechOutputDeviceId: typeof source.speechOutputDeviceId === 'string' && source.speechOutputDeviceId.length <= 512 ? source.speechOutputDeviceId : '',
    virtualInputDeviceId: typeof virtualInputDeviceId === 'string' && virtualInputDeviceId.length <= 512 ? virtualInputDeviceId : '',
    ...(s2sModel === null || s2sModel === 'qwen3.5-livetranslate-flash-realtime' || s2sModel === 'qwen3.8-livetranslate-flash-realtime'
      ? { s2sModel }
      : {}),
  }
}

/** Must be a dropdown entry; anything else falls back to auto-detect. */
function sanitizeSourceLanguage(value: unknown): string {
  return typeof value === 'string' && (SOURCE_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.recognition.sourceLanguage
}

/** Any non-empty id up to 256 characters is accepted; the installed local models are not a fixed set. */
function sanitizeLocalModelId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : DEFAULT_SETTINGS.translation.localModelId
}

/**
 * A closed two-value union, so an unknown value cannot survive: the extension branches on it to
 * decide between a tab capture and a desktop capture. Falls back the same way on both the load and
 * the write path, so a hand-edited file cannot leave the dropdown showing a source that no longer exists.
 */
function sanitizeVideoCaptionAudioSource(value: unknown): 'tab' | 'system' {
  return value === 'system' ? 'system' : 'tab'
}

/** A device id is a display-device string from `listDevices()`; anything else means "no device chosen". */
function sanitizeVideoCaptionDeviceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value !== 'defaultOutput' ? value : undefined
}

/** Old installations default to local recognition; malformed connection fields never survive reload. */
function sanitizeCloudSettings(settings: AppSettings): void {
  const models = settings.translation.customModels
  if (models !== undefined) settings.translation.customModels = Array.isArray(models)
    ? [...new Map(models.flatMap(stored => {
      const parsed = customModelSchema.safeParse(stored)
      if (!parsed.success) return []
      const model = { ...parsed.data, languages: [...LANGUAGE_CODES], sourceLanguages: [...SOURCE_LANGUAGE_OPTIONS] }
      return [[model.id, model] as const]
    })).values()].slice(0, 100)
    : []
  if (settings.translation.customModelId && !settings.translation.customModels?.some(model => model.id === settings.translation.customModelId)) settings.translation.customModelId = ''
  if (settings.translation.cloudLanguages !== undefined) {
    settings.translation.cloudLanguages = [...LANGUAGE_CODES]
  }
  if (settings.translation.cloudSourceLanguages !== undefined) {
    settings.translation.cloudSourceLanguages = [...SOURCE_LANGUAGE_OPTIONS]
  }
  settings.translation = synchronizeCustomModel(settings.translation)
  const recognition = settings.recognition
  recognition.provider = RECOGNITION_PROVIDERS.includes(recognition.provider ?? 'local') ? recognition.provider ?? 'local' : 'local'
  for (const [key, fallback, min, max] of [['max_segment_ms', 10000, 3000, 30000], ['silence_end_ms', 800, 300, 2000]] as const) {
    const value = recognition[key]
    recognition[key] = typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
  }
  recognition.aliyunRegion = recognition.aliyunRegion === 'ap-southeast-1' ? 'ap-southeast-1' : 'cn-beijing'
  recognition.aliyunModel = ALIYUN_RECOGNITION_MODELS.includes(recognition.aliyunModel ?? ALIYUN_RECOGNITION_MODELS[0]) ? recognition.aliyunModel ?? ALIYUN_RECOGNITION_MODELS[0] : ALIYUN_RECOGNITION_MODELS[0]
  const bounded = (value: unknown, fallback: string, max: number) => typeof value === 'string' && value.length <= max ? value : fallback
  recognition.aliyunWorkspaceId = bounded(recognition.aliyunWorkspaceId, '', 128)
  recognition.minimaxEndpoint = bounded(recognition.minimaxEndpoint, DEFAULT_SETTINGS.recognition.minimaxEndpoint ?? '', 2048)
  recognition.minimaxModel = MINIMAX_RECOGNITION_MODELS.includes(recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]) ? recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0] : MINIMAX_RECOGNITION_MODELS[0]
  settings.translation.mymemoryEndpoint = bounded(settings.translation.mymemoryEndpoint, DEFAULT_SETTINGS.translation.mymemoryEndpoint ?? '', 2048)
  settings.translation.mymemoryEmail = bounded(settings.translation.mymemoryEmail, '', 320)
  // A provider whose remote connection was just selected cannot hold a source language its
  // language table does not carry, so the saved choice falls back to detection rather than
  // reaching the engine as an unsupported code.
  if (recognition.provider !== 'local' && !remoteSourceLanguages(recognition).includes(recognition.sourceLanguage)) recognition.sourceLanguage = 'auto'
  // `translation.provider: 'recognition'` reuses one provider's socket; for the others it would
  // leave the target language untranslated, so it falls back rather than silently producing
  // source-only captions.
  if (!supportsRecognitionNativeTranslation(recognition) && settings.translation.provider === 'recognition') settings.translation.provider = 'mymemory'
  settings.translation.fallback ??= structuredClone(DEFAULT_SETTINGS.translation.fallback)
  const fallback = settings.translation.fallback
  if (!['disabled', 'local', 'cloud', 'microsoft', 'mymemory', 'google', 'index-translate'].includes(fallback.provider)) fallback.provider = 'disabled'
  // Fixed services own one connection slot; compatible cloud endpoints can each select a model.
  if (fallback.provider !== 'disabled' && fallback.provider !== 'cloud' && fallback.provider === settings.translation.provider) fallback.provider = 'disabled'
  fallback.mymemoryEndpoint = bounded(fallback.mymemoryEndpoint, DEFAULT_SETTINGS.translation.fallback.mymemoryEndpoint, 2048)
  fallback.mymemoryEmail = bounded(fallback.mymemoryEmail, '', 320)
  fallback.microsoftEndpoint = bounded(fallback.microsoftEndpoint, DEFAULT_SETTINGS.translation.fallback.microsoftEndpoint, 2048)
  fallback.microsoftRegion = bounded(fallback.microsoftRegion, '', 128)
  fallback.cloudEndpoint = bounded(fallback.cloudEndpoint, DEFAULT_SETTINGS.translation.fallback.cloudEndpoint, 2048)
  fallback.cloudModel = bounded(fallback.cloudModel, DEFAULT_SETTINGS.translation.fallback.cloudModel, 256)
}

function sanitizeTargetLanguage(value: unknown): string {
  return typeof value === 'string' && (TARGET_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value : DEFAULT_SETTINGS.translation.targetLanguage
}

function normalizeGithubAccelerate(raw: Partial<AppSettings['network']> | undefined) {
  const value = raw?.githubAccelerateUrl
  return { githubAccelerateUrl: raw?.useGithubAccelerate === false ? GITHUB_PROXY_OFF
    : typeof value === 'string' ? findGithubProxyNode(value.trim()) ?? GITHUB_PROXY_AUTO : GITHUB_PROXY_AUTO }
}

export class SettingsStore {
  private settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  private writeQueue: Promise<unknown> = Promise.resolve()
  private loadFailure?: unknown

  constructor(private readonly path: string) {}

  current(): AppSettings {
    return structuredClone(this.settings)
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<AppSettings> & {
        version?: unknown
        realtime?: unknown
        overlay?: Partial<AppSettings['overlay']> & {
          fontFamily?: unknown
        }
      }
      if (typeof raw.version === 'number' && raw.version > 3) throw new SettingsVersionError('Settings require a newer Nola version')
      const rawTranslation = { ...(raw.translation ?? {}) }
      const realtime = realtimeSettings(raw.realtime)
      const aliyunModel = raw.recognition?.aliyunModel
      const knownLiveTranslate = aliyunModel === 'qwen3.8-livetranslate-flash-realtime'
        || aliyunModel === 'qwen3.5-livetranslate-flash-realtime'
      if (raw.realtime?.s2sModel === undefined && raw.recognition?.provider === 'aliyun' &&
        (knownLiveTranslate || aliyunModel === undefined) && realtime.outputMode !== 'source' &&
        (realtime.outputMode === 'speech' || rawTranslation.provider === 'recognition')) {
        realtime.s2sModel = aliyunModel ?? 'qwen3.8-livetranslate-flash-realtime'
      }
      const rawOverlay = { ...(raw.overlay ?? {}) }
      delete rawOverlay.fontFamily
      this.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        version: 3,
        realtime,
        meetingMode: meetingModeSettingsSchema.safeParse(raw.meetingMode).data,
        onboardingSeen: raw.onboardingSeen === true,
        onboardingVersion: settingsPatchSchema.safeParse({ onboardingVersion: raw.onboardingVersion }).data?.onboardingVersion ?? 0,
        onboardingStep: settingsPatchSchema.safeParse({ onboardingStep: raw.onboardingStep }).data?.onboardingStep ?? 'W0',
        onboardingCompletedVersion: settingsPatchSchema.safeParse({ onboardingCompletedVersion: raw.onboardingCompletedVersion }).data?.onboardingCompletedVersion ?? 0,
        modelPolicy: raw.modelPolicy === undefined ? undefined : (modelPolicySchema.safeParse(raw.modelPolicy).data ?? { enabled: {}, defaults: {}, selections: {} }),
        modelWorkspace: settingsPatchSchema.safeParse({ modelWorkspace: raw.modelWorkspace }).data?.modelWorkspace,
        closeBehavior: raw.closeBehavior === 'quit' ? 'quit' : 'tray',
        synthesis: {
          ...DEFAULT_SETTINGS.synthesis,
          ...(settingsPatchSchema.safeParse({ synthesis: raw.synthesis }).data?.synthesis ?? {}),
        },
        modelGateway: {
          ...DEFAULT_SETTINGS.modelGateway,
          ...(settingsPatchSchema.safeParse({ modelGateway: raw.modelGateway }).data?.modelGateway ?? {}),
        },
        uiLanguage: typeof raw.uiLanguage === 'string' && ['auto', 'zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja', 'en'].includes(raw.uiLanguage)
          ? raw.uiLanguage as AppSettings['uiLanguage']
          : DEFAULT_SETTINGS.uiLanguage,
        modelStoragePath: typeof raw.modelStoragePath === 'string' && isAbsolute(raw.modelStoragePath) ? raw.modelStoragePath : '',
        network: {
          ...DEFAULT_SETTINGS.network,
          ...(raw.network ?? {}),
          pypiMirrorUrl: raw.network?.usePypiMirror === false && raw.network.pypiMirrorUrl !== PYPI_MIRROR_OFF
            ? PYPI_MIRROR_OFF
            : typeof raw.network?.pypiMirrorUrl === 'string'
              ? findPypiMirrorNode(raw.network.pypiMirrorUrl) ?? PYPI_MIRROR_AUTO
              : PYPI_MIRROR_AUTO,
          pytorchWheelMirrorUrl: raw.network?.usePypiMirror === false && raw.network.pypiMirrorUrl !== PYPI_MIRROR_OFF
            ? PYTORCH_WHEEL_MIRROR_OFF
            : typeof raw.network?.pytorchWheelMirrorUrl === 'string'
              ? findPytorchWheelMirrorNode(raw.network.pytorchWheelMirrorUrl) ?? PYTORCH_WHEEL_MIRROR_AUTO
              : PYTORCH_WHEEL_MIRROR_AUTO,
          ...normalizeGithubAccelerate(raw.network),
        },
        recognition: { ...DEFAULT_SETTINGS.recognition, ...(raw.recognition ?? {}) },
        recording: { ...DEFAULT_SETTINGS.recording, ...(raw.recording ?? {}) },
        appearance: {
          interfaceFont: desktopTypographyShape.interfaceFont.safeParse(raw.appearance?.interfaceFont).data ?? DEFAULT_SETTINGS.appearance.interfaceFont,
          density: desktopTypographyShape.density.safeParse(raw.appearance?.density).data ?? DEFAULT_SETTINGS.appearance.density,
          reduceMotion: typeof raw.appearance?.reduceMotion === 'boolean' ? raw.appearance.reduceMotion : DEFAULT_SETTINGS.appearance.reduceMotion,
        },
        browserConnection: {
          enabled: typeof raw.browserConnection?.enabled === 'boolean'
            ? raw.browserConnection.enabled
            : DEFAULT_SETTINGS.browserConnection.enabled,
        },
        compute: computeSettingsSchema.safeParse(raw.compute ?? {}).data ?? { ...DEFAULT_COMPUTE_SETTINGS },
        overlay: { ...DEFAULT_SETTINGS.overlay, ...rawOverlay },
        // Video-session capture remains run-scoped; browser caption appearance is a saved preference.
        videoCaptions: structuredClone(DEFAULT_SETTINGS.videoCaptions),
        browserCaptions: {
          ...DEFAULT_SETTINGS.browserCaptions,
          ...(settingsPatchSchema.safeParse({ browserCaptions: raw.browserCaptions }).data?.browserCaptions ?? {}),
        },
        translation: {
          ...DEFAULT_SETTINGS.translation,
          ...rawTranslation,
          fallback: { ...DEFAULT_SETTINGS.translation.fallback, ...(rawTranslation.fallback ?? {}) },
          translateIntermediate: typeof rawTranslation.translateIntermediate === 'boolean'
            ? rawTranslation.translateIntermediate
            : DEFAULT_SETTINGS.translation.translateIntermediate,
          intermediateTranslationIntervalMs: typeof rawTranslation.intermediateTranslationIntervalMs === 'number'
            ? Math.max(0, Math.min(2000, Math.round(rawTranslation.intermediateTranslationIntervalMs)))
            : DEFAULT_SETTINGS.translation.intermediateTranslationIntervalMs,
        },
      }
      if (!RECOGNITION_MODEL_IDS.some(id => id === this.settings.recognition.modelId) && !this.settings.recognition.modelId.startsWith('hub:')) {
        this.settings.recognition = { ...this.settings.recognition, modelId: 'qwen3-asr-1.7b-hf' }
      }
      this.settings.recognition = {
        ...this.settings.recognition,
        sourceLanguage: sanitizeSourceLanguage(this.settings.recognition.sourceLanguage),
      }
      this.settings.translation.targetLanguage = sanitizeTargetLanguage(
        this.settings.translation.targetLanguage,
      )
      if (!TRANSLATION_PROVIDERS.includes(this.settings.translation.provider)) {
        this.settings.translation.provider = 'local'
      }
      this.settings.translation.localModelId = sanitizeLocalModelId(
        this.settings.translation.localModelId,
      )
      sanitizeCloudSettings(this.settings)
      migrateTtsSettings(this.settings)
    } catch (error) {
      if (error instanceof SettingsVersionError || ((error as NodeJS.ErrnoException)?.code && (error as NodeJS.ErrnoException).code !== 'ENOENT')) {
        this.loadFailure = error
        throw error
      }
      this.settings = structuredClone(DEFAULT_SETTINGS)
    }
    this.loadFailure = undefined
    this.settings.modelPolicy = modelPolicyOf(this.settings)
    return structuredClone(this.settings)
  }

  async flush(): Promise<void> { await this.writeQueue }

  update(patch: StorePatch): Promise<AppSettings> {
    const copy = structuredClone(patch)
    const result = this.writeQueue.then(() => this.persist(copy))
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  private async persist(patch: StorePatch): Promise<AppSettings> {
    if (this.loadFailure) throw this.loadFailure
    const next: AppSettings = {
      ...this.settings,
      ...patch,
      modelPolicy: mergeModelPolicy(this.settings, patch.modelPolicy),
      version: 3,
      realtime: realtimeSettings({ ...this.settings.realtime, ...patch.realtime }),
      synthesis: { ...this.settings.synthesis, ...patch.synthesis },
      modelGateway: { ...this.settings.modelGateway, ...patch.modelGateway,
        ...(patch.modelGateway?.concurrency ? { concurrency: { ...this.settings.modelGateway.concurrency, ...patch.modelGateway.concurrency } } : {}) },
      recognition: { ...this.settings.recognition, ...(patch.recognition ?? {}) },
      recording: { ...this.settings.recording, ...(patch.recording ?? {}) },
      appearance: { ...this.settings.appearance, ...(patch.appearance ?? {}) },
      overlay: { ...this.settings.overlay, ...(patch.overlay ?? {}) },
      videoCaptions: { ...this.settings.videoCaptions, ...(patch.videoCaptions ?? {}) },
      browserCaptions: { ...this.settings.browserCaptions, ...(patch.browserCaptions ?? {}) },
      translation: {
        ...this.settings.translation, ...(patch.translation ?? {}),
        fallback: { ...this.settings.translation.fallback, ...(patch.translation?.fallback ?? {}) },
      },
      compute: { ...this.settings.compute, ...(patch.compute ?? {}) },
      network: { ...this.settings.network, ...(patch.network ?? {}) },
    }
    // Writes share the load-time allowlist so no write path can persist an invalid language code.
    next.translation = synchronizeCustomModel(next.translation, patch.translation)
    if (patch.synthesis?.voice !== undefined && patch.synthesis.voiceRef === undefined) next.synthesis.voiceRef = undefined
    migrateTtsSettings(next)
    next.recognition.sourceLanguage = sanitizeSourceLanguage(next.recognition.sourceLanguage)
    next.translation.targetLanguage = sanitizeTargetLanguage(next.translation.targetLanguage)
    next.translation.localModelId = sanitizeLocalModelId(next.translation.localModelId)
    sanitizeCloudSettings(next)
    next.videoCaptions.audioSource = sanitizeVideoCaptionAudioSource(next.videoCaptions.audioSource)
    next.videoCaptions.audioDeviceId = next.videoCaptions.audioSource === 'system'
      ? sanitizeVideoCaptionDeviceId(next.videoCaptions.audioDeviceId)
      : undefined
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    const { videoCaptions: _runScopedVideoCaptions, ...persisted } = persistedTtsSettings(next)
    await writeFile(temporary, JSON.stringify(persisted, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.settings = next
    return structuredClone(this.settings)
  }
}
