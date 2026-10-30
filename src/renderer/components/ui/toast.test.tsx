import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n'
import { closeToast, showToast, toastTimeoutFor, ToastProvider } from './toast'

const ids: string[] = []
afterEach(() => {
  cleanup()
  ids.splice(0).forEach(closeToast)
  vi.restoreAllMocks()
})

it('renders a simple toast as description only', () => {
  render(<I18nProvider readSettings={false}><ToastProvider /></I18nProvider>)
  let id = ''
  act(() => { id = showToast({ type: 'error', description: '请检查网络后重试。' }) })
  ids.push(id)

  const viewport = screen.getByRole('region', { name: 'Notifications' })
  expect(within(viewport).getByText('请检查网络后重试。')).toBeVisible()
  expect(within(viewport).queryByText('重试')).not.toBeInTheDocument()
  const close = viewport.querySelector<HTMLButtonElement>('.nola-toast-close')
  expect(close).toHaveAttribute('data-variant', 'link')
  expect(close?.className).not.toContain('bg-surface-tertiary')
  expect(close?.className).not.toContain('hover:bg-')
})

it('renders an action toast with a title, description, and one action', () => {
  const onClick = vi.fn()
  render(<I18nProvider readSettings={false}><ToastProvider /></I18nProvider>)
  let id = ''
  act(() => { id = showToast({ type: 'error', title: '下载失败', description: '请检查网络后重试。', actionProps: { children: '重试下载', onClick } }) })
  ids.push(id)

  const viewport = screen.getByRole('region', { name: 'Notifications' })
  fireEvent.click(within(viewport).getByText('重试下载').closest('button')!)
  expect(within(viewport).getByText('下载失败')).toBeVisible()
  expect(within(viewport).getByText('请检查网络后重试。')).toBeVisible()
  expect(onClick).toHaveBeenCalledOnce()
})

it.each([
  ['success', undefined, 4000],
  ['info', undefined, 6000],
  ['warning', undefined, 8000],
  ['error', undefined, 10000],
  ['loading', undefined, 8000],
  ['error', 0, 10000],
  ['error', -1, 10000],
  ['error', Number.NaN, 10000],
  ['error', Number.POSITIVE_INFINITY, 10000],
  ['error', 20000, 12000],
  ['error', 5000, 5000],
] as const)('uses a finite bounded timeout for %s (%s)', (type, duration, expected) => {
  expect(toastTimeoutFor({ type, description: 'test', ...(duration === undefined ? {} : { duration }) })).toBe(expected)
})

