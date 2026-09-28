import { describe, expect, it } from 'vitest'

import { stripIpcErrorMessage } from '../../../src/shared/ipc-error'

describe('stripIpcErrorMessage', () => {
  it('剥掉 Electron 的通道包装和错误类前缀', () => {
    expect(
      stripIpcErrorMessage(
        "Error invoking remote method 'engine:start-session': StaleCredentialError: 已保存的 API 密钥无法解密"
      )
    ).toBe('已保存的 API 密钥无法解密')
  })

  it('剥掉普通 Error 包装', () => {
    expect(
      stripIpcErrorMessage(
        "Error invoking remote method 'engine:start-session': Error: Error while decrypting the ciphertext provided to safeStorage.decryptString."
      )
    ).toBe('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
  })

  it('剥掉不带错误类名的包装', () => {
    expect(stripIpcErrorMessage("Error invoking remote method 'app:update-settings': 资源操作参数无效")).toBe(
      '资源操作参数无效'
    )
  })

  it('非 IPC 错误原样返回', () => {
    expect(stripIpcErrorMessage('普通错误消息')).toBe('普通错误消息')
    expect(stripIpcErrorMessage('')).toBe('')
  })
})
