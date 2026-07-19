import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

it('provides finish and hide controls while the overlay is adjustable', async () => {
  const api = window.fluentCaptions!
  const settings = {
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, mode: 'free' as const, locked: false },
  }
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(settings)
  const updateSettings = vi.spyOn(api, 'updateSettings').mockResolvedValue({
    ...settings,
    overlay: { ...settings.overlay, locked: true },
  })
  const hideOverlay = vi.spyOn(api, 'hideOverlay')

  render(<CaptionOverlay />)

  fireEvent.click(await screen.findByRole('button', { name: '隐藏浮层' }))
  await waitFor(() => expect(hideOverlay).toHaveBeenCalledOnce())

  fireEvent.click(screen.getByRole('button', { name: '完成调整' }))
  await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ overlay: { locked: true } }))

  getSettings.mockRestore()
  updateSettings.mockRestore()
  hideOverlay.mockRestore()
})
