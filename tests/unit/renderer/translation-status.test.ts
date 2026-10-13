import { describe, expect, it } from 'vitest'

import type { CaptionSegment, Translation } from '../../../src/shared/contracts'
import { failedTranslations } from '../../../src/renderer/translation-status'
import { translate } from '../../../src/renderer/i18n'
import { SUPPORT_ERROR_CODES } from '../../../src/shared/error-catalog'

const t = (key: string, values?: Record<string, string | number>) => translate(key, 'zh-CN', values)

/** The canonical code for `errors.translateFailed`, which MT-007/014/015/016/017 all share. */
const TRANSLATION_FAILURE_CODE = 'MT-007'

const make = (overrides: Partial<Translation> = {}): Translation => ({
  targetLanguage: 'en',
  state: 'failed',
  provider: 'm2m100',
  ...overrides,
})

describe('译文失败提示', () => {
  it('支持错误码确实在目录表里', () => {
    expect(SUPPORT_ERROR_CODES).toContain(TRANSLATION_FAILURE_CODE)
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
