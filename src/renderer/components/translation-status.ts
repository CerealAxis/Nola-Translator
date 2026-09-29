import type { CaptionSegment, Translation } from '../../shared/contracts'
import type { TranslationValues } from '../i18n'

type Translate = (message: string, values?: TranslationValues) => string

/** Failure reasons reported by the engine — mostly `type(error).__name__`, a few fixed semantic codes. */
const ERROR_LABELS: Record<string, string> = {
  URLError: '网络不可达',
  HTTPError: '接口返回错误',
  TimeoutError: '请求超时',
  translationTimeout: '翻译超时',
  resourceUnavailable: '翻译模型未安装',
  llamaServerUnavailable: '本地翻译服务未就绪',
  unsupportedLanguagePair: '不支持该语言组合',
  translationUnavailable: '翻译暂不可用',
  RuntimeError: '翻译服务返回异常',
  ValueError: '翻译参数无效',
  ConnectionError: '网络连接失败',
}

export function failedTranslations(caption?: CaptionSegment | null): Translation[] {
  return (caption?.translations ?? []).filter((item) => item.state === 'failed')
}

/**
 * A failed translation has to be rendered, not swallowed.
 *
 * The overlay and preview only ever drew `complete`, so "network down / key
 * expired / model not ready" looked exactly like "still translating" — blank in
 * both cases, leaving the user nothing to act on.
 */
export function translationErrorLabel(t: Translate, translation: Translation): string {
  const code = translation.errorCode ?? ''
  const reason = ERROR_LABELS[code] ?? code
  return t('翻译失败 · {reason}', { reason: reason ? t(reason) : t('未知原因') })
}
