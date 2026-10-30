import { afterEach, expect, it, vi } from 'vitest'
import * as toast from '../ui/toast'
import { notifyError } from './notify'

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('keeps caption-window errors in the caption window', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const createToast = vi.spyOn(toast, 'createToast')

  notifyError('Audio device unavailable', { description: 'AUD-002' })

  expect(createToast).toHaveBeenCalledExactlyOnceWith('Audio device unavailable', expect.objectContaining({
    description: 'AUD-002',
    timeout: 12000,
  }))
})
