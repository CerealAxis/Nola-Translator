import { describe, expect, it } from 'vitest'
import { browserText, errorKey } from './i18n'
import { browserEn, browserZh } from './locale-base'
import { browserJa, browserKo, browserZhHK, browserZhTW } from './locale-regions'
import { extensionCopy } from './extension-copy'

it('keeps the complete key set and nonempty UI copy in all six locales', () => {
  const keys = Object.keys(browserZh).sort()
  for (const dictionary of [browserEn, browserZhTW, browserZhHK, browserKo, browserJa]) expect(Object.keys(dictionary).sort()).toEqual(keys)
  for (const translations of Object.values(extensionCopy)) {
    expect(translations).toHaveLength(6)
    expect(translations.every(text => text.trim().length > 0)).toBe(true)
  }
})

describe('browser failure guidance', () => {
  const t = browserText('zh-CN')

  it('distinguishes a missing runtime from a missing model', () => {
    expect(t(errorKey('torchUnavailable'))).toContain('PyTorch')
    expect(t(errorKey('llamaUnavailable'))).toContain('llama.cpp')
  })

  it('gives the action for an ended session, disabled service, or stale extension', () => {
    expect(t(errorKey('browserSessionNotRunning'))).toContain('重新开启字幕')
    expect(t(errorKey('browserCaptionServiceDisabled'))).toContain('实时服务尚未就绪')
    expect(t(errorKey('browserExtensionVersionMismatch'))).toContain('重装当前版本扩展')
  })

  it('explains an Index-Translate service rejection in every locale', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja'] as const) {
      const message = browserText(locale)(errorKey('indexTranslateBrowserBlocked'))
      expect(message).toContain('412')
    }
  })

  it('keeps an unknown diagnostic code out of the user-facing message', () => {
    const message = t(errorKey('UNMAPPED_INTERNAL_CODE'))
    expect(message).toContain('检查相关服务设置')
    expect(message).not.toContain('UNMAPPED_INTERNAL_CODE')
  })
})
