import { describe, expect, it } from 'vitest'
import { browserText, errorKey } from './i18n'

describe('browser failure guidance', () => {
  const t = browserText('zh-CN')

  it('distinguishes a missing runtime from a missing model', () => {
    expect(t(errorKey('torchUnavailable'))).toContain('PyTorch')
    expect(t(errorKey('llamaUnavailable'))).toContain('llama.cpp')
  })

  it('gives the action for an ended session, disabled service, or stale extension', () => {
    expect(t(errorKey('browserSessionNotRunning'))).toContain('重新开启字幕')
    expect(t(errorKey('browserCaptionServiceDisabled'))).toContain('开启字幕服务')
    expect(t(errorKey('browserExtensionVersionMismatch'))).toContain('重装当前版本扩展')
  })

  it('keeps an unknown diagnostic code out of the user-facing message', () => {
    const message = t(errorKey('UNMAPPED_INTERNAL_CODE'))
    expect(message).toContain('诊断日志')
    expect(message).not.toContain('UNMAPPED_INTERNAL_CODE')
  })
})
