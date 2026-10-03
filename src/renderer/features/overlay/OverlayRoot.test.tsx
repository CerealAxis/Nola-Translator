import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { OverlayRoot } from './OverlayRoot'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  store.sessionStore.setState({ status: 'running', sessionId: 'session-1', segments: [], interim: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); store.sessionStore.setState({ status: 'idle', sessionId: null }) })

function setup(close: () => Promise<void>) {
  vi.spyOn(store, 'getBridge').mockReturnValue({ overlay: { close } } as unknown as NolaBridge)
  const stop = vi.spyOn(store.actions.session, 'stopSession').mockResolvedValue(undefined)
  render(<OverlayRoot />)
  fireEvent.click(screen.getByRole('button', { name: '关闭悬浮窗' }))
  return { stop, confirm: screen.getByRole('button', { name: '关闭并停止' }) }
}

it('uses one main-process close request and disables dragging while confirmation is open', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  const { stop, confirm } = setup(close)
  expect(document.querySelector('.nola-caption-card')).toHaveAttribute('data-confirm-open', 'true')
  fireEvent.click(confirm)
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(stop).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('keeps a pending confirmation visible and prevents repeated close requests', async () => {
  let finish!: () => void
  const close = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const { confirm } = setup(close)
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(close).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => { finish() })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('reports a failed close and allows retrying instead of silently dismissing confirmation', async () => {
  const close = vi.fn().mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValueOnce(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { confirm } = setup(close)
  fireEvent.click(confirm)
  expect(await screen.findByRole('alert')).toHaveTextContent('关闭失败')
  fireEvent.click(screen.getByRole('button', { name: '关闭并停止' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(close).toHaveBeenCalledTimes(2)
})
