/**
 * 翻译失败**必须渲染出来，不能吞掉**。
 *
 * 旧前端的浮窗与工作台只画 `state === 'complete'` 的译文，于是「断网 / key 过期 /
 * 模型没就绪」和「还在翻译」长得一模一样 —— 两种情况都是一片空白，用户什么也做不了。
 * 这里把引擎的报错码翻成界面文案，浮窗（`OverlayRoot`）与工作台字幕流（`CaptionStage`）
 * 都会调用它。
 *
 * 词典在 `i18n/shell-ui.ts` 的 `shellUi.error.*`，这里是错误码到词典键的映射表。
 * **两条路径都要走**：词典命中时显示词典文案，没命中时退回 `TRANSLATION_ERROR_LABELS`
 * 这个中文兜底词表，再不济就把错误码原样显示 —— 空白是最差的一种失败。
 */

import type { CaptionSegment, Translation } from '@/bridge'
import { TRANSLATION_ERROR_LABELS } from '@/bridge'
import type { TranslationKey } from '@/i18n'

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

/** 引擎错误码 → 词典键。词典缺键时会走 `TRANSLATION_ERROR_LABELS` 兜底。 */
const ERROR_KEYS: Record<string, TranslationKey> = {
  URLError: 'shellUi.error.URLError',
  HTTPError: 'shellUi.error.HTTPError',
  TimeoutError: 'shellUi.error.TimeoutError',
  translationTimeout: 'shellUi.error.translationTimeout',
  resourceUnavailable: 'shellUi.error.resourceUnavailable',
  llamaServerUnavailable: 'shellUi.error.llamaServerUnavailable',
  unsupportedLanguagePair: 'shellUi.error.unsupportedLanguagePair',
  translationUnavailable: 'shellUi.error.translationUnavailable',
  RuntimeError: 'shellUi.error.RuntimeError',
  ValueError: 'shellUi.error.ValueError',
  ConnectionError: 'shellUi.error.ConnectionError',
}

export function failedTranslations(caption?: CaptionSegment | null): Translation[] {
  return (caption?.translations ?? []).filter((item) => item.state === 'failed')
}

/** 一条失败译文的完整文案，形如「翻译失败 · 网络不可达」。 */
export function translationErrorLabel(t: Translate, translation: Translation): string {
  const code = translation.errorCode ?? ''
  const key = ERROR_KEYS[code]
  const reason = key
    ? t(key)
    : code
      ? (TRANSLATION_ERROR_LABELS[code] ?? code)
      : t('shellUi.unknownReason')
  return t('shellUi.translationFailed', { reason })
}

/**
 * 一个句段里所有失败译文的原因，逗号连接。
 *
 * 多个目标语言时可能有几条同时失败，全列出来比只报第一条有用：
 * 用户看到「网络不可达」就知道不是配置问题，看到「翻译模型未安装」就知道要去装模型。
 */
export function translationErrorSummary(t: Translate, caption?: CaptionSegment | null): string {
  const failed = failedTranslations(caption)
  if (failed.length === 0) return ''
  return failed.map((item) => translationErrorLabel(t, item)).join('；')
}
