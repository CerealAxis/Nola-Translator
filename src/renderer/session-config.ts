/** Session translation settings preserve disabled targets and explicit local model overrides. */

import { NO_TRANSLATION_LANGUAGE, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from '@/bridge'
import type { AppSettings, AppSettingsPatch, AudioDevice, ResourceRecord, SessionConfig } from '@/bridge'
import { isModelReady, translationLanguages } from '../shared/model-capabilities'
import { normalizeLanguage } from '../shared/languages'
import { supportsSelectedEngine } from '../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'
import type { TranslationSettings } from '@/bridge'
import { fallbackTranslationFieldsOf, supportsIntermediateTranslation, translationOptionsOf } from '../shared/cloud-config'

/** Auto detection has no reverse translation target, so swapping resolves it to English. */
export function swappedLanguagesOf(sourceLanguage: string, targetLanguage: string, sourceOptions: readonly string[] = SOURCE_LANGUAGE_OPTIONS, targetOptions: readonly string[] = TARGET_LANGUAGE_OPTIONS): { sourceLanguage: string; targetLanguage: string } | null {
  const nextTarget = sourceLanguage === 'auto' ? 'en' : sourceLanguage
  if (!sourceOptions.some(code => code === targetLanguage)
    || !targetOptions.some(code => code === nextTarget)) return null
  return { sourceLanguage: targetLanguage, targetLanguage: nextTarget }
}

/** Keep captions readable when disabling translation, and restore the translation track when re-enabling it. */
export function targetLanguagePatch(targetLanguage: string, previousTargetLanguage: string): AppSettingsPatch {
  return {
    translation: { targetLanguage },
    ...(targetLanguage === NO_TRANSLATION_LANGUAGE
      ? { overlay: { showSource: true, showTranslation: false } }
      : previousTargetLanguage === NO_TRANSLATION_LANGUAGE ? { overlay: { showTranslation: true } } : {}),
  }
}

/** Resolve the device the session will capture, including the current system default output. */
export function audioDeviceNameOf(source: SessionConfig['audioSource'], devices: readonly AudioDevice[], fallback: string): string {
  const device = source.kind === 'defaultOutput'
    ? devices.find(item => item.kind === 'systemOutput' && item.isDefault)
    : 'deviceId' in source ? devices.find(item => item.deviceId === source.deviceId) : undefined
  return device?.name ?? fallback
}

/** Selecting a model after disabling translation must also restore a usable target. */
export function translationModelPatch(settings: AppSettings, model: ResourceRecord): AppSettingsPatch | null {
  if (!isModelReady(model) || model.kind !== 'translationModel' || !supportsSelectedEngine(model, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, model.resourceId)) return null
  const targets = translationLanguages(model, settings.recognition.sourceLanguage)
    .filter(code => code !== NO_TRANSLATION_LANGUAGE && code !== normalizeLanguage(settings.recognition.sourceLanguage))
  const current = settings.translation.targetLanguage
  const targetLanguage = targets.includes(current) ? current : targets.includes('zh') ? 'zh' : targets[0]
  if (!targetLanguage) return null
  const patch = targetLanguagePatch(targetLanguage, current)
  return { ...patch, translation: { ...patch.translation, provider: 'local', localModelId: model.resourceId } }
}

/** `SessionConfig` 里由翻译设置决定的那几个字段。 */
export type TranslationFields = Pick<
  SessionConfig,
  'targetLanguages' | 'allowIntermediateTranslation' | 'translationProvider' | 'translationModelId' | 'translationOptions' | 'fallbackTranslationProvider' | 'fallbackTranslationOptions'
>

export interface TranslationFieldOptions {
  /** 界面上把译文关掉了。此时 `targetLanguages` 是空数组，其余字段整个缺席。 */
  enabled: boolean
  /** Target language for this session. Defaults to the saved target. */
  targetLanguage?: string
  /** Optional local model override. Blank values use the saved model. */
  modelId?: string
}

/**
 * 把翻译设置折成 `SessionConfig` 的翻译字段。
 *
 * `enabled: false` 时返回的对象**只有** `targetLanguages: []`，其余键缺席 ——
 * 不是 `undefined` 值，是根本没有这些键。给引擎一个 `translationProvider: undefined`
 * 与完全不给它，是两回事。
 */
export function translationFieldsOf(
  translation: TranslationSettings,
  options: TranslationFieldOptions,
): TranslationFields {
  const targetLanguage = options.targetLanguage ?? translation.targetLanguage
  // The sentinel is a user preference, never an engine language code.
  if (!options.enabled || targetLanguage === NO_TRANSLATION_LANGUAGE) return { targetLanguages: [] }

  const targetLanguages = [targetLanguage]

  // Match preflight and keep blank IDs out of the session protocol.
  const modelOverride = options.modelId?.trim() || undefined

  return {
    targetLanguages,
    allowIntermediateTranslation: supportsIntermediateTranslation(translation.provider) && translation.translateIntermediate,
    // 见文件头第 3 条：全部取自设置，不写死。
    translationProvider: translation.provider,
    /*
     * 只有本地模型有"模型 id"这个概念：它决定引擎加载哪份权重。云端与 Microsoft 的模型名
     * 走 `translationOptions.model`（云端还带上线路协议与两个 token 预算），那边的模型由
     * 服务商托管，本机不需要它，所以这个字段整个缺席。取值与"缺席/空白"的区别见上面的
     * `modelOverride`。
     */
    translationModelId: translation.provider === 'local' || translation.fallback.provider === 'local' ? modelOverride ?? translation.localModelId : undefined,
    // 见文件头第 2 条：本地 provider 必须是 `undefined`，不是 `{}`。
    translationOptions: translationOptionsOf(translation),
    ...fallbackTranslationFieldsOf(translation),
  }
}
