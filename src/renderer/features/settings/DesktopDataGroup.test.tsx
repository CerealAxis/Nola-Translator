import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import { DesktopDataGroup } from './DesktopDataGroup'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
function setup() {
  const api = { snapshot: vi.fn().mockResolvedValue({ root: 'D:/Data', usage: { logs: 100 } }), backup: vi.fn().mockResolvedValue(false), restore: vi.fn().mockResolvedValue(false) }
  vi.spyOn(store, 'getBridge').mockReturnValue({ desktopData: api } as unknown as NonNullable<ReturnType<typeof store.getBridge>>)
  render(<DesktopDataGroup />)
  return { api, user: userEvent.setup() }
}

it('requires a password only when exporting keys and preserves choices if the picker is cancelled', async () => {
  const { api, user } = setup()
  await user.click(screen.getByRole('button', { name: '创建备份' }))
  await user.click(screen.getByRole('switch', { name: '包含 API 密钥' }))
  const button = screen.getByRole('button', { name: '备份并重启' })
  expect(button).toBeDisabled()
  await user.type(screen.getByLabelText('备份密码（至少 12 个字符）'), 'correct-password')
  await user.click(button)
  await waitFor(() => expect(api.backup).toHaveBeenCalledWith({ audio: true, models: false, password: 'correct-password' }))
  await waitFor(() => expect(button).toBeEnabled())
  expect(screen.getByLabelText('备份密码（至少 12 个字符）')).toHaveValue('correct-password')
})

it('shows the specific restore failure inside the active dialog', async () => {
  const { api, user } = setup()
  api.restore.mockRejectedValue(new Error("Error invoking remote method 'desktop-data:restore': Error: DATA_PASSWORD_INVALID"))
  await user.click(screen.getByRole('button', { name: '恢复备份' }))
  await user.type(screen.getByLabelText('恢复密码'), 'wrong-password')
  await user.click(screen.getByRole('button', { name: '恢复并重启' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('密码错误，无法解密备份中的密钥。')
  expect(screen.getByLabelText('恢复密码')).toHaveValue('wrong-password')
})
