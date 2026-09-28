import { describe, expect, it } from 'vitest'

import type { CaptionSegment, Translation } from '../../../src/shared/contracts'
import { failedTranslations, translationErrorLabel } from '../../../src/renderer/components/translation-status'
import { translate } from '../../../src/renderer/i18n'

const t = (message: string, values?: Record<string, string | number>) => translate(message, 'zh-CN', values)

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
})
