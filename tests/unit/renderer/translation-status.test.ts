import { describe, expect, it } from 'vitest'

import type { CaptionSegment, Translation } from '../../../src/shared/contracts'
import { failedTranslations, translationErrorLabel, translationErrorSummary } from '../../../src/renderer/translation-status'
import { translate } from '../../../src/renderer/i18n'

// 被测对象从 `src/renderer/components/translation-status.ts` 搬到了
// `src/renderer/translation-status.ts`（旧 UI 整体删除时那一份跟着删了，逻辑逐字搬过来）。
const t = (key: string, values?: Record<string, string | number>) => translate(key, 'zh-CN', values)

const make = (overrides: Partial<Translation> = {}): Translation => ({
  targetLanguage: 'en',
  state: 'failed',
  provider: 'm2m100',
  ...overrides,
})

describe('译文失败提示', () => {
  it('把引擎上报的错误码翻成能看懂的中文', () => {
    expect(translationErrorLabel(t, make({ errorCode: 'URLError' }))).toBe('翻译失败 · 网络不可达')
    expect(translationErrorLabel(t, make({ errorCode: 'translationTimeout' }))).toBe('翻译失败 · 翻译超时')
    expect(translationErrorLabel(t, make({ errorCode: 'llamaServerUnavailable' }))).toBe('翻译失败 · 本地翻译服务未就绪')
  })

  it('未登记的错误码原样透出，缺失错误码时给出占位', () => {
    expect(translationErrorLabel(t, make({ errorCode: 'SomethingOdd' }))).toBe('翻译失败 · SomethingOdd')
    expect(translationErrorLabel(t, make({ errorCode: undefined }))).toBe('翻译失败 · 未知原因')
  })

  it('只挑出失败的译文，pending 与 complete 不算', () => {
    const caption = {
      segmentId: 's1', revision: 1, startedAtMs: 0, isFinal: false,
      sourceText: '你好',
      translations: [
        make({ targetLanguage: 'en', state: 'complete', text: 'hello' }),
        make({ targetLanguage: 'ja', state: 'pending' }),
        make({ targetLanguage: 'ko', state: 'failed', errorCode: 'URLError' }),
      ],
    } as CaptionSegment

    const failed = failedTranslations(caption)

    expect(failed).toHaveLength(1)
    expect(failed[0].targetLanguage).toBe('ko')
    expect(failedTranslations(null)).toEqual([])
    expect(failedTranslations(undefined)).toEqual([])
  })

  it('汇总多条失败原因，全部失败时才非空', () => {
    // 多个目标语言可以同时失败，全列出来比只报第一条有用：
    // 看到「网络不可达」就知道不是配置问题，看到「翻译模型未安装」就知道要去装模型。
    const twoFailures = {
      segmentId: 's2', revision: 1, startedAtMs: 0, isFinal: true,
      sourceText: '你好',
      translations: [
        make({ targetLanguage: 'en', errorCode: 'URLError' }),
        make({ targetLanguage: 'ja', errorCode: 'resourceUnavailable' }),
      ],
    } as CaptionSegment
    expect(translationErrorSummary(t, twoFailures)).toBe('翻译失败 · 网络不可达；翻译失败 · 翻译模型未安装')

    const ok = {
      segmentId: 's3', revision: 1, startedAtMs: 0, isFinal: true,
      sourceText: '你好',
      translations: [make({ targetLanguage: 'en', state: 'complete', text: 'hello' })],
    } as CaptionSegment
    expect(translationErrorSummary(t, ok)).toBe('')
  })
})
