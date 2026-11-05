import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, savePreferences } from './preferences'
import { browserText } from './i18n'
import { Options } from './options'
import { testProvider, translate } from './provider-client'
import { requestProviderAccess, saveProviders } from './providers'

vi.mock('./preferences', async original => ({ ...await original<typeof import('./preferences')>(), savePreferences: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./settings-fields', async original => ({ ...await original<typeof import('./settings-fields')>(), usePreferences: () => [DEFAULT_PREFERENCES, 'en', browserText('en')], ConnectionStatus: () => null }))
vi.mock('./provider-client', () => ({ translate: vi.fn().mockResolvedValue('Translated text'), testProvider: vi.fn().mockResolvedValue('OK'), clearTranslationCache: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./providers', async original => { const actual = await original<typeof import('./providers')>(); return { ...actual, loadProviders: vi.fn().mockResolvedValue(actual.DEFAULT_PROVIDERS), saveProviders: vi.fn().mockResolvedValue(undefined), requestProviderAccess: vi.fn().mockResolvedValue(true) } })
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn(); vi.mocked(requestProviderAccess).mockResolvedValue(true); vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } }) })
describe('extension settings', () => {
  it('tests the built-in Nola desktop connection without saving or asking for an API key', async () => {
    vi.mocked(testProvider).mockResolvedValueOnce('OK')
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))
    await waitFor(() => expect(testProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'desktop', preset: 'nola' })))
    expect(await screen.findByRole('status')).toHaveTextContent('OK')
    expect(screen.queryByRole('textbox', { name: 'API key' })).not.toBeInTheDocument()
    expect(saveProviders).not.toHaveBeenCalled()
  })
  it('does not display a previous provider test result after switching connections', async () => {
    let finish!: (result: string) => void
    vi.mocked(testProvider).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Google Translate' }))
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() => expect(testProvider).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Microsoft Translator' }))
    await act(async () => finish('OLD OK'))
    expect(screen.queryByText('OLD OK')).not.toBeInTheDocument()
  })
  it('preserves a dirty provider draft when another preference or provider revision changes', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Google Translate' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input); await user.type(input, 'Unsaved name')
    const changed = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0]
    await act(async () => { changed({ theme: { newValue: 'dark' }, providerRevision: { newValue: 'external' } }, 'local') })
    expect(input).toHaveValue('Unsaved name')
    expect(saveProviders).not.toHaveBeenCalled()
  })
  it('reports a denied provider test without saving the connection', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Google Translate' }))
    vi.mocked(testProvider).mockRejectedValueOnce(new Error('providerPermission'))
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(testProvider).toHaveBeenCalledWith(expect.objectContaining({ preset: 'google-translate' }))
    expect(screen.getByRole('status')).toHaveTextContent(browserText('en')('providerPermission'))
    expect(saveProviders).not.toHaveBeenCalled()
  })
  it('searches settings without hiding the matching controls', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'terminology')
    expect(screen.getByRole('textbox', { name: 'Source term' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Theme' })).not.toBeInTheDocument()
  })
  it('finds a setting by its control label, not only by the page title', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'font size')
    expect(screen.getAllByRole('slider', { name: 'Font size' })).toHaveLength(2)
    expect(screen.queryByRole('combobox', { name: 'Theme' })).not.toBeInTheDocument()
  })
  it('edits an API connection as a draft and saves only on explicit save', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Google Translate' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input); await user.type(input, 'My Google')
    expect(saveProviders).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveProviders).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'My Google' })])))
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() => expect(testProvider).toHaveBeenCalled())
  })
  it('translates text using the selected providers and records terminology', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Translation center' }))
    await user.type(screen.getByRole('textbox', { name: 'Text to translate' }), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Translate text' }))
    await waitFor(() => expect(translate).toHaveBeenCalledWith('Hello', 'auto', 'zh', 'selection', undefined, 'desktop'))
    expect(await screen.findByText('Translated text')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terminology' }))
    await user.type(screen.getByRole('textbox', { name: 'Source term' }), 'API')
    await user.type(screen.getByRole('textbox', { name: 'Translation' }), '接口')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(savePreferences).toHaveBeenCalledWith({ glossary: [{ source: 'API', target: '接口', sites: '' }] })
  })
})
