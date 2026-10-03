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
 *   2. `translationOptions` 按 provider 给三种不同形状；`hymt2` / `m2m100` 是本地模型，
 *      **没有 options**，必须整个字段缺席。给本地 provider 塞一个 `{}` 就够引擎判成「配置非法」。
 *   3. `translationProvider` / `translationModelId` / `allowIntermediateTranslation`
 *      一律取自设置。**新 UI 那版把 provider 写死成 `hymt2`、把量化档写死成
 *      `hy-mt2-1.8b-q3-k-m`，并且从不设 `translationOptions`** ——
 *      于是配了 Microsoft / OpenAI / Ollama / m2m100 的用户每开一场会话都被强按到
 *      本地 Hy-MT2 上：云端 key 根本不传，本地权重用户又可能压根没装（预检也拦不住，
 *      因为预检算出来的 `translationModelId` 和真正发出去的是同一个写死值，看起来"已安装"）。
 *   4. `recognitionModelId` / `recognitionMode` 同样取自设置（见 `SessionSetupDialog`）。
 *
 * 旧文件里还有三个标签助手（`shortLanguageLabel` / `translationProviderLabel` /
 * `translationModelDetail`）和 `resolveAudioSource`，都**没有搬**：新 UI 用
 * `LANGUAGE_LABELS` 显示语言真名、用 `OverlayPage` 自己的服务商名表、
 * 声源则由选择器直接给出已解析好的 `AudioSource`（`audioSourceFrom`），
 * 不需要再拿 id 回头查一次 `listDevices()`。搬过来只会是没人调的死代码。
 */

import type { SessionConfig } from '@/bridge'
import type { TranslationSettings } from '@/bridge'

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
  // 见文件头第 1 条。
  if (!options.enabled) return { targetLanguages: [] }

  const targetLanguages = [options.targetLanguage ?? translation.targetLanguage]

  return {
    targetLanguages,
    allowIntermediateTranslation: translation.translateIntermediate,
    // 见文件头第 3 条：全部取自设置，不写死。
    translationProvider: translation.provider,
    // 只在 provider=hymt2 下有意义；引擎会忽略其它 provider 下的这个值。
    translationModelId: translation.hymt2ModelId,
    // 见文件头第 2 条：本地 provider 必须是 `undefined`，不是 `{}`。
    translationOptions: translation.provider === 'microsoft'
      ? { endpoint: translation.microsoftEndpoint, region: translation.microsoftRegion }
      : translation.provider === 'openai'
        ? { endpoint: translation.openaiEndpoint, model: translation.openaiModel }
        : translation.provider === 'ollama'
          ? { endpoint: translation.ollamaEndpoint, model: translation.ollamaModel }
          : undefined,
  }
}
