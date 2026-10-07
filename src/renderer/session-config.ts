/**
 * 一场会话的**翻译配置**怎么从设置里取 —— 整个应用里唯一一处做这件事的地方。
 *
 * 旧前端的 `src/renderer/session.ts` 有一个 `buildSessionConfig(settings, audioSource)`，
 * 它把整份 `AppSettings` 翻成 `SessionConfig`。搬进新 UI 时**没有原样搬那个函数**，
 * 因为新 UI 的结构不一样：`SessionSetupDialog` 本身就是配置编辑器（用户在这场里
 * 选声源、语言、要不要翻译），它构造 `SessionConfig`，不存在第二个构造点。
 *
 * 但旧 `buildSessionConfig` 里那几条密集规则**必须活下来**，因为新 UI 自己写的那份是错的：
 *
 *   1. 关掉译文时 `targetLanguages` 必须是**空数组**，不能是单元素。
 *      传单元素会让引擎照样起翻译管线：装 Hy-MT2 要加载几个 GB 的权重，
 *      而界面上把译文关着。「不显示译文」是显示偏好，「不翻译」是配置 —— 这里必须分清。
 *   2. `translationOptions` 按 provider 给不同形状；`local` 是本地模型，**没有 options**，
 *      必须整个字段缺席。给本地 provider 塞一个 `{}` 就够引擎判成「配置非法」。
 *      （这里的 provider 已经从五个塌成 `local` / `cloud` / `microsoft` 三个：云端那档还要
 *      多带 `apiFormat` 与两个 token 预算，因为引擎得知道这个 endpoint 收哪种请求体。）
 *   3. `translationProvider` / `allowIntermediateTranslation` 一律取自设置。
 *      `translationModelId` 是唯一的例外：会话弹窗可以带一个**用户当场选的**本地模型覆盖它
 *      （`options.modelId`），**缺席或空白**（空串、纯空格）就沿用设置里的 `localModelId`。
 *      这一条必须认"空白"而不只是认 `undefined`：弹窗那侧的字段是必填 `string`，见第 3 条下面
 *      `modelOverride` 处的注释 —— `''` 走到协议层的闭集上会直接让这一场开不起来。
 *      **新 UI 原来那版把 provider 写死成 `hymt2`、把量化档写死成
 *      `hy-mt2-1.8b-q3-k-m`，并且从不设 `translationOptions`** ——
 *      于是配了 Microsoft / OpenAI / Ollama / m2m100（合并前的旧 provider id）的用户每开一场会话
 *      都被强按到本地 Hy-MT2 上：云端 key 根本不传，本地权重用户又可能压根没装（预检也拦不住，
 *      因为预检算出来的 `translationModelId` 和真正发出去的是同一个写死值，看起来"已安装"）。
 *      区别在于：那是**代码替用户做的选择**，这里是用户自己点的 —— 两者不能相提并论。
 *   4. `recognitionModelId` / `recognitionMode` 同样取自设置（见 `SessionSetupDialog`）。
 *
 * 旧文件里还有三个标签助手（`shortLanguageLabel` / `translationProviderLabel` /
 * `translationModelDetail`）和 `resolveAudioSource`，都**没有搬**：新 UI 用
 * `LANGUAGE_LABELS` 显示语言真名、用 `OverlayPage` 自己的服务商名表、
 * 声源则由选择器直接给出已解析好的 `AudioSource`（`audioSourceFrom`），
 * 不需要再拿 id 回头查一次 `listDevices()`。搬过来只会是没人调的死代码。
 */

import { NO_TRANSLATION_LANGUAGE, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ResourceRecord, SessionConfig } from '@/bridge'
import { isModelReady, translationLanguages } from '../shared/model-capabilities'
import { normalizeLanguage } from '../shared/languages'
import { supportsSelectedEngine } from '../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'
import type { TranslationSettings } from '@/bridge'

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
  'targetLanguages' | 'allowIntermediateTranslation' | 'translationProvider' | 'translationModelId' | 'translationOptions'
>

export interface TranslationFieldOptions {
  /** 界面上把译文关掉了。此时 `targetLanguages` 是空数组，其余字段整个缺席。 */
  enabled: boolean
  /**
   * 本次会话要翻成的语言。省略时用 `translation.targetLanguage`（设置里的值）。
   * 会话设置弹窗有自己的语言选择器，所以它会传进来。
   */
  targetLanguage?: string
  /**
   * 本次会话临时换用的**本地**模型 id。**缺席或空白时**用 `translation.localModelId`。
   *
   * 空白要算"没有覆盖"，不是"覆盖成空串"：`SetupDraft.translationModelId` 是必填 `string`，
   * 设置 store 还没加载出来时弹窗那边只能填空串（见下面 `modelOverride` 的注释）。
   *
   * 只有 `provider === 'local'` 时才会被读（见下面的三元）：云端与 Microsoft 没有
   * "本地模型 id"这个概念，所以弹窗在服务商不是本地时也不会给出这个选择器。
   * 这是用户当场做的显式选择，与"写死一个默认值"是两回事 —— 下面第 3 条禁的是后者。
   */
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

  /*
   * "没有覆盖"要同时认 `undefined` 与**空白**。`SessionSetupDialog` 那侧的
   * `SetupDraft.translationModelId` 是必填 `string`，而 `WorkspacePage.openSetup` 在设置 store
   * 还没加载完（`settings` 仍是 `null`）时只能填 `settings?.translation.localModelId ?? ''`。
   * 那个 `''` 原样发出去会卡在协议边界上：`sessionConfigSchema` 的 `translationModelId` 是
   * 四个字面量 id 加 `hub:` 前缀的**闭集**，`''` 不在里面，`startSession` 的 handler 直接抛错，
   * 这一场根本开不起来 —— 而且预检查不出毛病（预检只在"字段缺失"时回落，字段在场）。
   * `trim()` 之后判真，纯空格也一并挡掉；用 trim 后的值而不是原串，顺带把误粘的空格摘掉。
   * 口径与 `store/sessionStore.ts` 的预检回落（`config.translationModelId?.trim() || …`）一致。
   */
  const modelOverride = options.modelId?.trim() || undefined

  return {
    targetLanguages,
    allowIntermediateTranslation: translation.translateIntermediate,
    // 见文件头第 3 条：全部取自设置，不写死。
    translationProvider: translation.provider,
    /*
     * 只有本地模型有"模型 id"这个概念：它决定引擎加载哪份权重。云端与 Microsoft 的模型名
     * 走 `translationOptions.model`（云端还带上线路协议与两个 token 预算），那边的模型由
     * 服务商托管，本机不需要它，所以这个字段整个缺席。取值与"缺席/空白"的区别见上面的
     * `modelOverride`。
     */
    translationModelId: translation.provider === 'local' ? modelOverride ?? translation.localModelId : undefined,
    // 见文件头第 2 条：本地 provider 必须是 `undefined`，不是 `{}`。
    translationOptions: translation.provider === 'cloud'
      ? {
          endpoint: translation.cloudEndpoint,
          model: translation.cloudModel,
          apiFormat: translation.cloudApiFormat,
          contextWindow: translation.cloudContextWindow,
          maxOutputTokens: translation.cloudMaxOutputTokens,
        }
      : translation.provider === 'microsoft'
        ? { endpoint: translation.microsoftEndpoint, region: translation.microsoftRegion }
        : undefined,
  }
}
