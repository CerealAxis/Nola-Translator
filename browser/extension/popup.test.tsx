import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Popup } from './popup'
import { DEFAULT_PREFERENCES, savePreferences } from './preferences'
import { browserText } from './i18n'
import type { createPopupStore } from './popupStore'
import { BROWSER_PROTOCOL_VERSION } from '../../src/shared/browser'
let settings = { ...DEFAULT_PREFERENCES }
const connect = vi.fn()
const sendMessage = vi.fn()
vi.mock('./preferences', async original => ({ ...await original<typeof import('./preferences')>(), savePreferences: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./settings-fields', async original => ({ ...await original<typeof import('./settings-fields')>(), usePreferences: () => [settings, 'en', browserText('en')] }))
vi.mock('./providers', async original => { const actual = await original<typeof import('./providers')>(); return { ...actual, loadProviders: vi.fn().mockResolvedValue(actual.DEFAULT_PROVIDERS), requestProviderAccess: vi.fn().mockResolvedValue(true) } })
beforeEach(() => {
  vi.clearAllMocks(); settings = { ...DEFAULT_PREFERENCES }
  connect.mockReset().mockImplementation(() => { throw new Error('Host unavailable') })
  vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } }, runtime: { connect, sendMessage, getManifest: () => ({ version: '2.0.0' }), openOptionsPage: vi.fn().mockResolvedValue(undefined) } })
})
function store(error?: string, video = false) { const state = { tabId: 7, enabled: true, pending: false, origin: 'https://example.com', url: 'https://example.com/article', video, error, pageError: error }; return { getSnapshot: () => state, subscribe: () => () => {}, enable: vi.fn(), send: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof createPopupStore> }
it('keeps translation controls usable without an initial native-connection error', async () => {
  render(<Popup store={store()} />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Source language' })).toBeInTheDocument()
  expect(screen.getByText('v2.0.0')).toBeInTheDocument()
  expect(connect).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
  const user = userEvent.setup(); await user.click(screen.getByRole('switch', { name: 'Disable on this website' }))
  expect(savePreferences).toHaveBeenCalledWith({ siteBlacklist: ['https://example.com'] })
})
it('shows a failed translation once instead of hiding the provider error', async () => {
  render(<Popup store={store('providerRateLimit')} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent(browserText('en')('providerRateLimit'))
})

it('defaults to bilingual view and saves either display mode through the switch', async () => {
  const value = store()
  const view = render(<Popup store={value} />)
  const toggle = screen.getByRole('switch', { name: 'Bilingual view' })
  expect(toggle).toBeChecked()
  await userEvent.click(toggle)
  expect(savePreferences).toHaveBeenLastCalledWith({ pageDisplay: 'translation' })
  settings = { ...settings, pageDisplay: 'translation' }
  view.rerender(<Popup store={value} />)
  expect(toggle).not.toBeChecked()
  await userEvent.click(toggle)
  expect(savePreferences).toHaveBeenLastCalledWith({ pageDisplay: 'bilingual' })
})
it('disables page and video actions on a website excluded by a domain rule', async () => {
  settings = { ...DEFAULT_PREFERENCES, asrProvider: 'desktop', siteBlacklist: ['example.com'] }
  render(<Popup store={store(undefined, true)} />)
  await act(async () => { await Promise.resolve() })
  const t = browserText('en')
  for (const key of ['translatePage', 'translateSubtitles', 'live'] as const) expect(screen.getByRole('button', { name: t(key) })).toBeDisabled()
})
it('keeps an external provider usable when the desktop connection is unavailable', async () => {
  settings = { ...DEFAULT_PREFERENCES, pageProvider: 'google' }
  render(<Popup store={store()} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: browserText('en')('translatePage') })).toBeEnabled()
})

it('opens a fresh desktop connection and updates the popup status on reconnect', async () => {
  settings = { ...settings, pageProvider: 'desktop' }
  let receive: (message: unknown) => void
  const value = store()
  render(<Popup store={value} />)
  const button = await screen.findByRole('button', { name: 'Reconnect' })
  await waitFor(() => expect(button).toBeEnabled())
  expect(button).not.toHaveTextContent('Reconnect')
  expect(screen.getByRole('status')).toHaveTextContent('Nola is disconnected')
  expect(screen.getByRole('alert')).toHaveTextContent('Open Nola')
  connect.mockReturnValueOnce({
    onMessage: { addListener: (listener: typeof receive) => { receive = listener } },
    onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn(),
    postMessage: ({ id }: { id: string }) => receive({ type: 'result', id, value: { protocolVersion: BROWSER_PROTOCOL_VERSION } }),
  })
  await userEvent.click(button)
  expect(screen.getByRole('status')).toHaveTextContent('Nola is connected')
  expect(connect).toHaveBeenCalledTimes(2)
  expect(value.send).toHaveBeenCalledWith('refreshDesktopConnection')
  expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
})

it('opens the provider assignments and saves only the chosen feature', async () => {
  const user = userEvent.setup(); render(<Popup store={store()} />)
  await user.click(screen.getByRole('button', { name: 'API connections' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'Web translation' }))
  await user.click(screen.getByRole('option', { name: 'Microsoft Translator' }))
  expect(savePreferences).toHaveBeenCalledWith({ pageProvider: 'microsoft-translate' })
})
it('retains languages and provider configuration on a restricted page', async () => {
  const value = store(); const state = { enabled: false, pending: false }
  value.getSnapshot = () => state
  render(<Popup store={value} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('combobox', { name: 'Source language' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'API connections' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Enable on this website' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent(browserText('en')('restrictedPage'))
})
it('swaps explicit languages together and leaves automatic detection out of the target', async () => {
  const user = userEvent.setup(); const rendered = render(<Popup store={store()} />)
  expect(screen.getByRole('button', { name: browserText('en')('swapLanguages') })).toBeDisabled()
  settings = { ...settings, sourceLanguage: 'en', pageLanguage: 'zh' }
  rendered.rerender(<Popup store={store()} />)
  await user.click(screen.getByRole('button', { name: browserText('en')('swapLanguages') }))
  expect(savePreferences).toHaveBeenCalledWith({ sourceLanguage: 'zh', pageLanguage: 'en' })
})
it('keeps the popup height stable and dismisses More with Escape', async () => {
  const user = userEvent.setup(); render(<Popup store={store()} />)
  await user.click(screen.getByRole('button', { name: 'More' }))
  expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false'))
})
it('reports a failed preference save instead of swallowing it', async () => {
  const user = userEvent.setup(); render(<Popup store={store()} />)
  vi.mocked(savePreferences).mockRejectedValueOnce(new Error('write failed'))
  await user.click(screen.getByRole('switch', { name: 'Disable on this website' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(browserText('en')('internalError'))
})
it('disables video actions until website access has been enabled', async () => {
  settings = { ...DEFAULT_PREFERENCES, asrProvider: 'desktop' }
  const value = store(undefined, true); const state = { enabled: false, pending: false, video: true, origin: 'https://example.com', url: 'https://example.com/article' }; value.getSnapshot = () => state
  render(<Popup store={value} />)
  expect(screen.getByRole('button', { name: browserText('en')('translateSubtitles') })).toBeDisabled()
  expect(screen.getByRole('button', { name: browserText('en')('live') })).toBeDisabled()
})

it('keeps live capture off with the default subtitle provider', async () => {
  render(<Popup store={store(undefined, true)} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('button', { name: browserText('en')('translateSubtitles') })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: browserText('en')('live') })).not.toBeInTheDocument()
})

it('does not show the removed area translation action', () => {
  render(<Popup store={store()} />)
  expect(screen.queryByRole('button', { name: 'Translate area' })).not.toBeInTheDocument()
})
