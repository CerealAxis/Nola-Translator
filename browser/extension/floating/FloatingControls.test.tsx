import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { FloatingControls, floatingDock } from './FloatingControls'
import { DEFAULT_PREFERENCES } from '../preferences'
import { browserText } from '../i18n'
const t = browserText('en')
beforeEach(() => {
  for (const name of ['setPointerCapture', 'releasePointerCapture']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
})
function callbacks() { return { onTranslate: vi.fn(), onRestore: vi.fn(), onPosition: vi.fn(), onLock: vi.fn(), onHide: vi.fn() } }
it('opens an actionable error when direct translation fails', async () => {
  const view = render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en', floatingClickAction: 'translate' }} active={false} {...callbacks()} />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  view.rerender(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en', floatingClickAction: 'translate' }} active error="providerPermission" {...callbacks()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(t('providerPermission'))
  expect(screen.getByRole('button', { name: t('settings') })).toBeInTheDocument()
})
it('expands quick actions on hover and offers only site/global hiding', async () => {
  const actions = callbacks(); const user = userEvent.setup()
  const view = render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} active {...actions} />)
  await user.hover(view.container.querySelector('.nola-floating-trigger')!)
  expect(view.container.firstChild).toHaveAttribute('data-expanded', 'true')
  await user.click(view.container.querySelector('.nola-floating-tool')!); expect(actions.onRestore).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: t('pinFloating') })); expect(actions.onLock).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: t('close') }))
  await user.click(screen.getByRole('button', { name: t('floatingHideSite') })); expect(actions.onHide).toHaveBeenCalledWith('site')
  expect(screen.queryByRole('button', { name: t('floatingHidePage') })).not.toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: t('floatingHideAll') })).not.toBeInTheDocument()
})
it('translates directly by default and clamps saved dock coordinates', async () => {
  const actions = callbacks(); const user = userEvent.setup()
  const view = render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} active={false} {...actions} />)
  await user.click(view.container.querySelector('.nola-floating-trigger')!)
  expect(actions.onTranslate).toHaveBeenCalledOnce()
  expect(floatingDock(10, -20, 1000, 800)).toEqual({ floatingSide: 'left', floatingPosition: 0 })
  expect(floatingDock(900, 1000, 1000, 800)).toEqual({ floatingSide: 'right', floatingPosition: 1 })
})
it('pins visibility while retaining drag placement', () => {
  const actions = callbacks()
  const view = render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en', floatingLocked: true }} active={false} {...actions} />)
  expect(view.container.firstChild).toHaveAttribute('data-pinned', 'true')
  const button = view.container.querySelector('.nola-floating-trigger')!
  fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 200, clientY: 200 })
  fireEvent.pointerUp(button, { pointerId: 1, clientX: 200, clientY: 200 })
  expect(actions.onPosition).toHaveBeenLastCalledWith(floatingDock(200, 200, innerWidth, innerHeight), true)
})
it('uses the native sidebar action and exposes a recoverable Firefox restriction', async () => {
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false }), getURL: (value: string) => value } })
  const user = userEvent.setup()
  render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en', floatingClickAction: 'panel' }} active={false} {...callbacks()} />)
  await user.click(screen.getByRole('button', { name: t('floatingOpenPanel') }))
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'openTranslationPanel' })
  expect(await screen.findByRole('alert')).toHaveTextContent(t('openPanelFromToolbar'))
})

it('previews a drag, persists only on release and suppresses its click', () => {
  const actions = callbacks()
  render(<FloatingControls preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} active={false} {...actions} />)
  const button = document.querySelector('.nola-floating-trigger')!
  fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 900, clientY: 500 })
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 200 })
  expect(actions.onPosition).toHaveBeenLastCalledWith({ floatingSide: 'left', floatingPosition: 200 / innerHeight }, false)
  fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 200 })
  expect(actions.onPosition).toHaveBeenLastCalledWith({ floatingSide: 'left', floatingPosition: 200 / innerHeight }, true)
  fireEvent.click(button)
  expect(actions.onTranslate).not.toHaveBeenCalled()
})
