import { afterEach, expect, it, vi } from 'vitest'
import type { NolaBridge } from '@/bridge'
import * as store from '@/store'
import * as toast from '../ui/toast'
import { notifyError } from './notify'

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('sends caption-window errors to the main app instead of covering the captions', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const notifyMainError = vi.fn()
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { notifyMainError } } as unknown as NolaBridge)
  const createToast = vi.spyOn(toast, 'createToast')

  notifyError('Audio device unavailable', { description: 'AUD-002' })

  expect(notifyMainError).toHaveBeenCalledExactlyOnceWith('Audio device unavailable', 'AUD-002')
  expect(createToast).not.toHaveBeenCalled()
})
