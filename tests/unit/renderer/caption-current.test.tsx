import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CaptionPreview } from '../../../src/renderer/components/CaptionPreview'
import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { LiveCaptionsPage } from '../../../src/renderer/pages/LiveCaptionsPage'
import { AppearancePage } from '../../../src/renderer/pages/AppearancePage'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineEvent } from '../../../src/shared/contracts'

afterEach(() => vi.restoreAllMocks())

const captionEvent = (id: string, time: number, revision = 1, sessionId = 'session'): EngineEvent => ({
  protocolVersion: 1, requestId: id, type: 'caption', sessionId,
  segment: { segmentId: id, revision, startedAtMs: time, sourceText: `${id}-${revision}`, isFinal: true,
    translations: [{ targetLanguage: 'zh', text: `translation-${id}-${revision}`, state: 'complete', provider: 'test' }] },
})

it('both surfaces keep the current sentence when an old translation or revision arrives', async () => {
  const listeners: ((event: EngineEvent) => void)[] = []
  vi.spyOn(window.nolaTranslator!, 'onEngineEvent').mockImplementation((listener) => { listeners.push(listener); return () => undefined })
  const { container } = render(<><CaptionOverlay /><LiveCaptionsPage activeSessionId="session" onSessionStarted={() => undefined} onStopSession={async () => undefined} onOpenResources={() => undefined} /></>)
  await waitFor(() => expect(listeners).toHaveLength(2))
  act(() => {
    for (const event of [captionEvent('old', 10), captionEvent('current', 20, 3), captionEvent('old', 10, 9), captionEvent('current', 20, 2), captionEvent('foreign', 999, 1, 'previous-session')]) {
      listeners.forEach((listener) => listener(event))
    }
  })
  expect(container.querySelector('.overlay-track-source')).toHaveTextContent('current-3')
  expect(container.querySelector('.caption-source')).toHaveTextContent('current-3')
  expect(screen.queryByText('translation-old-9')).not.toBeInTheDocument()
  act(() => {
    listeners.forEach((listener) => listener({ protocolVersion: 1, requestId: '', type: 'sessionStarted', sessionId: 'new-session' }))
    listeners.forEach((listener) => listener(captionEvent('new', 0, 1, 'new-session')))
    listeners.forEach((listener) => listener(captionEvent('current', 20, 4)))
  })
  expect(container.querySelector('.overlay-track-source')).toHaveTextContent('new-1')
  expect(container.querySelector('.caption-source')).toHaveTextContent('new-1')
})

it('applies the selected font and renders a bilingual appearance example', async () => {
  const { container, unmount } = render(<CaptionPreview overlay={{ ...DEFAULT_SETTINGS.overlay, fontFamily: 'Microsoft YaHei UI' }} />)
  expect((container.querySelector('.caption-overlay') as HTMLElement).style.fontFamily).toBe('"Microsoft YaHei UI"')
  unmount()
  const appearance = render(<AppearancePage />)
  await waitFor(() => expect(appearance.container.querySelector('.caption-translation')).not.toBeNull())
})

it('persists visibility, follows settings broadcasts and reports failed saves', async () => {
  const api = window.nolaTranslator!
  let broadcast: Parameters<typeof api.onSettingsChanged>[0] | undefined
  vi.spyOn(api, 'onSettingsChanged').mockImplementation((listener) => { broadcast = listener; return () => undefined })
  const save = vi.spyOn(api, 'updateSettings').mockResolvedValue({ ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay, showSource: false } })
  const { container } = render(<LiveCaptionsPage activeSessionId={null} onSessionStarted={() => undefined} onStopSession={async () => undefined} onOpenResources={() => undefined} />)
  await screen.findByText('准备就绪')
  fireEvent.click(screen.getByLabelText('原文'))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ overlay: { showSource: false } }))
  await waitFor(() => expect(container.querySelector('.caption-source')).toBeNull())
  act(() => broadcast?.(DEFAULT_SETTINGS))
  expect(screen.getByLabelText('原文')).toBeChecked()
  save.mockRejectedValueOnce(new Error('disk full'))
  fireEvent.click(screen.getByLabelText('原文'))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('disk full'))
  expect(screen.getByLabelText('原文')).toBeChecked()
})
