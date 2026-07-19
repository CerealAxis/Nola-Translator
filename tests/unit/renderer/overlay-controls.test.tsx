import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineEvent } from '../../../src/shared/contracts'

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

it('keeps recent caption segments on separate readable lines', async () => {
  const api = window.fluentCaptions!
  let listener: ((event: EngineEvent) => void) | undefined
  const onEngineEvent = vi.spyOn(api, 'onEngineEvent').mockImplementation((next) => {
    listener = next
    return () => undefined
  })

  render(<CaptionOverlay />)
  await waitFor(() => expect(listener).toBeDefined())

  const caption = (segmentId: string, sourceText: string): EngineEvent => ({
    protocolVersion: 1,
    type: 'caption',
    requestId: `caption-${segmentId}`,
    sessionId: 'session-live',
    segment: {
      segmentId,
      revision: 1,
      startedAtMs: 0,
      sourceText,
      isFinal: true,
      translations: [],
    },
  })
  act(() => {
    listener?.(caption('one', 'First sentence.'))
    listener?.(caption('two', 'Second sentence.'))
  })

  expect(document.querySelector('.overlay-source')).toHaveTextContent('First sentence. Second sentence.')
  expect(document.querySelector('.overlay-source')?.textContent).toContain('\n')
  onEngineEvent.mockRestore()
})

it('removes all overlay chrome when the background opacity is zero', async () => {
  const api = window.fluentCaptions!
  const settings = {
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, backgroundOpacity: 0 },
  }
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(settings)

  const { container } = render(<CaptionOverlay />)

  await waitFor(() => {
    expect(container.querySelector('.standalone-overlay')).toHaveAttribute('data-transparent-background', 'true')
  })
  getSettings.mockRestore()
})
