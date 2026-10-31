import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as notify from '@/components/primitives/notify'
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
  vi.spyOn(store, 'getBridge').mockReturnValue({
    overlay: { close },
    events: { onOverlayLockChanged: () => () => undefined },
  } as unknown as NolaBridge)
  const stop = vi.spyOn(store.actions.session, 'stopSession').mockResolvedValue(undefined)
  render(<OverlayRoot />)
  return { stop, closeButton: screen.getByRole('button', { name: '关闭悬浮窗' }) }
}

it('hides the overlay directly without stopping the active session', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  const { stop, closeButton } = setup(close)
  fireEvent.click(closeButton)
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(stop).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('prevents repeated close requests while hiding is pending', async () => {
  let finish!: () => void
  const close = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const { closeButton } = setup(close)
  fireEvent.click(closeButton)
  fireEvent.click(closeButton)
  expect(close).toHaveBeenCalledTimes(1)
  await act(async () => { finish() })
})

it('reports a failed hide and allows retrying', async () => {
  const close = vi.fn().mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValueOnce(undefined)
  const failureToast = vi.spyOn(notify, 'notifyError').mockImplementation(() => 'toast')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { closeButton } = setup(close)
  fireEvent.click(closeButton)
  await waitFor(() => expect(failureToast).toHaveBeenCalledWith('关闭失败，请重试。', expect.objectContaining({ cause: expect.objectContaining({ message: 'IPC unavailable' }) })))
  fireEvent.click(closeButton)
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2))
})
