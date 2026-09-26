import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineEvent } from '../../../src/shared/contracts'

it('keeps the adjustable overlay free of status and action controls', async () => {
  const api = window.fluentCaptions!
  const settings = {
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, mode: 'free' as const, locked: false },
  }
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(settings)
  const { container } = render(<CaptionOverlay />)

  await waitFor(() => expect(container.querySelector('.overlay-window')).toHaveAttribute('data-adjusting', 'true'))
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByText('等待字幕会话')).not.toBeInTheDocument()
  expect(container.querySelector('.standalone-overlay')).toHaveAttribute('data-locked', 'false')

  getSettings.mockRestore()
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

  const sources = [...document.querySelectorAll('.overlay-source')].map((item) => item.textContent)
  expect(sources).toEqual(['First sentence.', 'Second sentence.'])
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

it('uses separate typography settings for translated captions', async () => {
  const api = window.fluentCaptions!
  const settings = {
    ...DEFAULT_SETTINGS,
    overlay: {
      ...DEFAULT_SETTINGS.overlay,
      maxLines: 2,
      translationMaxLines: 5,
      translationFontSize: 31,
      translationLineHeight: 1.75,
    },
  }
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue(settings)
  const { container } = render(<CaptionOverlay />)

  await waitFor(() => {
    const overlay = container.querySelector('.standalone-overlay') as HTMLElement
    expect(overlay.style.getPropertyValue('--overlay-max-lines')).toBe('2')
    expect(overlay.style.getPropertyValue('--overlay-translation-max-lines')).toBe('5')
    expect(overlay.style.getPropertyValue('--overlay-translation-font-size')).toBe('31px')
    expect(overlay.style.getPropertyValue('--overlay-translation-line-height')).toBe('1.75')
  })
  getSettings.mockRestore()
})

it('reuses the visible caption row when source rows are limited to one', async () => {
  const api = window.fluentCaptions!
  let listener: ((event: EngineEvent) => void) | undefined
  const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, maxLines: 1 },
  })
  const onEngineEvent = vi.spyOn(api, 'onEngineEvent').mockImplementation((next) => {
    listener = next
    return () => undefined
  })
  render(<CaptionOverlay />)
  await waitFor(() => expect(listener).toBeDefined())

  const caption = (segmentId: string, sourceText: string): EngineEvent => ({
    protocolVersion: 1, type: 'caption', requestId: segmentId, sessionId: 'session-live',
    segment: { segmentId, revision: 1, startedAtMs: 0, sourceText, isFinal: true, translations: [] },
  })
  act(() => {
    listener?.(caption('one', 'First sentence.'))
  })

  const firstRow = document.querySelector('.overlay-caption-row')
  expect(firstRow).not.toBeNull()

  act(() => {
    listener?.(caption('two', 'Second sentence.'))
  })

  expect(document.querySelector('.overlay-lines')).toHaveTextContent('Second sentence.')
  expect(document.querySelector('.overlay-lines')).not.toHaveTextContent('First sentence.')
  expect(document.querySelector('.overlay-caption-row')).toBe(firstRow)
  getSettings.mockRestore()
  onEngineEvent.mockRestore()
})
