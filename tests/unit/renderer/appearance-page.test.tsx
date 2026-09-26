import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { AppearancePage } from '../../../src/renderer/pages/AppearancePage'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

it('allows setting the subtitle background to fully transparent', async () => {
  const api = window.fluentCaptions!
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS)
  const updateSettings = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, ...(patch.overlay ?? {}) },
  }))

  const { container } = render(<AppearancePage />)
  const opacity = await waitFor(() => {
    const control = container.querySelector('input[type="range"][min="0"]')
    expect(control).not.toBeNull()
    return control as HTMLInputElement
  })

  fireEvent.change(opacity, { target: { value: '0' } })
  await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ overlay: { backgroundOpacity: 0 } }))
  await waitFor(() => {
    expect(container.querySelector('.caption-overlay')).toHaveAttribute('data-transparent-background', 'true')
  })

  getSettings.mockRestore()
  updateSettings.mockRestore()
})

it('applies a subtitle color scheme without changing the application theme', async () => {
  const api = window.fluentCaptions!
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS)
  const updateSettings = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, ...(patch.overlay ?? {}) },
  }))

  render(<AppearancePage />)
  fireEvent.change(await screen.findByLabelText('字幕主题'), { target: { value: 'light' } })

  await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
    overlay: {
      colorScheme: 'light', backgroundColor: '#F3F3F3', sourceColor: '#1B1B1B', translationColor: '#005FB8',
    },
  }))
  expect(updateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ theme: expect.anything() }))

  getSettings.mockRestore()
  updateSettings.mockRestore()
})
