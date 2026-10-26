import { describe, expect, it } from 'vitest'

import { normalizeThrownError, stripIpcErrorMessage } from '../../../src/shared/ipc-error'

describe('normalizeThrownError', () => {
  it.each([
    ['INVALID_ARGUMENT', 'ARG-001'], ['MEETING_NAME_EMPTY', 'ARG-002'],
    ['MEETING_NOT_FOUND', 'ARG-003'], ['INVALID_CREDENTIAL', 'ARG-004'],
  ])('preserves validation cause %s across IPC', (code, supportCode) => {
    expect(normalizeThrownError(new Error(code))).toMatchObject({ code, supportCode, retryable: false })
  })
  it('preserves distinct runtime failures and support codes', () => {
    expect(normalizeThrownError(new Error('RUNTIME_TORCH: 尚未安装 PyTorch'))).toMatchObject({
      code: 'RUNTIME_TORCH', supportCode: 'RNT-001',
    })
    expect(normalizeThrownError(new Error('RUNTIME_LLAMA: 尚未安装 llama.cpp'))).toMatchObject({
      code: 'RUNTIME_LLAMA', supportCode: 'RNT-002',
    })
  })
})

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
