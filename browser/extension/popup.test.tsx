import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Popup } from './popup'
import { DEFAULT_PREFERENCES, savePreferences } from './preferences'
import { browserText } from './i18n'
import type { createPopupStore } from './popupStore'
let settings = { ...DEFAULT_PREFERENCES }
vi.mock('./preferences', async original => ({ ...await original<typeof import('./preferences')>(), savePreferences: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./settings-fields', async original => ({ ...await original<typeof import('./settings-fields')>(), usePreferences: () => [settings, 'en', browserText('en')], ConnectionStatus: () => <p>Nola diagnostic status</p> }))
vi.mock('./providers', async original => { const actual = await original<typeof import('./providers')>(); return { ...actual, loadProviders: vi.fn().mockResolvedValue(actual.DEFAULT_PROVIDERS), requestProviderAccess: vi.fn().mockResolvedValue(true) } })
beforeEach(() => { vi.clearAllMocks(); settings = { ...DEFAULT_PREFERENCES }; vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } }, runtime: { getManifest: () => ({ version: '2.0.0' }), openOptionsPage: vi.fn() } }) })
function store(error?: string, video = false) { const state = { enabled: true, pending: false, origin: 'https://example.com', url: 'https://example.com/article', video, error, pageError: error }; return { getSnapshot: () => state, subscribe: () => () => {}, enable: vi.fn(), send: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof createPopupStore> }
it('keeps translation controls usable without an initial native-connection error', async () => {
  render(<Popup store={store()} />)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Nola diagnostic status')).not.toBeInTheDocument(); expect(screen.getByRole('combobox', { name: 'Source language' })).toBeInTheDocument()
  expect(screen.getByText('v2.0.0')).toBeInTheDocument()
  const user = userEvent.setup(); await user.click(screen.getByRole('switch', { name: 'Disable on this website' }))
  expect(savePreferences).toHaveBeenCalledWith({ siteBlacklist: ['https://example.com'] })
})
it('shows a failed translation once instead of hiding the provider error', async () => {
  render(<Popup store={store('browserConnectionUnavailable')} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Open Nola')
})
it('disables page and video actions on a website excluded by a domain rule', async () => {
  settings = { ...DEFAULT_PREFERENCES, siteBlacklist: ['example.com'] }
  render(<Popup store={store(undefined, true)} />)
  await act(async () => { await Promise.resolve() })
  const t = browserText('en')
  for (const key of ['translatePage', 'translateSubtitles', 'live'] as const) expect(screen.getByRole('button', { name: t(key) })).toBeDisabled()
})
it('shows no native diagnostics when an external provider is selected', async () => {
  settings = { ...DEFAULT_PREFERENCES, pageProvider: 'google' }
  render(<Popup store={store()} />)
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByText('Nola diagnostic status')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
