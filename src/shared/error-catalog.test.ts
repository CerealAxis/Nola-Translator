import { describe, expect, it } from 'vitest'
import { translate } from '../renderer/i18n'
import { SUPPORT_ERROR_CATALOG, SUPPORT_ERROR_CODES, supportErrorCodeForCause, supportErrorCodeForMessage } from './error-catalog'

describe('support error code mapping', () => {
  it('maps the resourceNotFound engine error to the missing-resource support code', () => {
    expect(supportErrorCodeForCause('resourceNotFound')).toBe('MDL-023')
  })

  it('maps the required translation source language to MT-020', () => {
    expect(supportErrorCodeForCause('TRANSLATIONSOURCELANGUAGEREQUIRED')).toBe('MT-020')
  })

  it('maps disk-full resource failures to STO-022', () => {
    expect(supportErrorCodeForCause('diskSpaceInsufficient')).toBe('STO-022')
  })

  it('has simplified Chinese copy for all supported diagnostic codes', () => {
    expect(SUPPORT_ERROR_CODES).toHaveLength(91)
    for (const code of SUPPORT_ERROR_CODES) {
      const messageKey = SUPPORT_ERROR_CATALOG[code].messageKey
      const message = translate(messageKey, 'zh-CN')
      expect(message, `${code} translation`).not.toBe(messageKey)
      expect(message.trim(), `${code} translation`).not.toBe('')
      expect(supportErrorCodeForMessage(messageKey)).toBe(code)
    }
  })
})
