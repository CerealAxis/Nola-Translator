import type { CaptionSegment, Translation } from '../../shared/contracts'
import type { TranslationValues } from '../i18n'

type Translate = (message: string, values?: TranslationValues) => string

/** 引擎上报的失败原因（多为 `type(error).__name__`，少数是固定语义码）。 */
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
 * 译文失败必须显示出来。
 *
 * 浮层与预览原本只渲染 `complete`，于是「网络不通 / 密钥失效 / 模型没就绪」
 * 与「还在翻译」在界面上完全一样——都是一片空白，用户无从判断该查什么。
 */
export function translationErrorLabel(t: Translate, translation: Translation): string {
  const code = translation.errorCode ?? ''
  const reason = ERROR_LABELS[code] ?? code
  return t('翻译失败 · {reason}', { reason: reason ? t(reason) : t('未知原因') })
}
