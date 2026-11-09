import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, savePreferences } from './preferences'
import { browserText } from './i18n'
import { Options } from './options'
import { testProvider, translate } from './provider-client'
import { createProvider, DEFAULT_PROVIDERS, requestProviderAccess, saveProviders } from './providers'
import { LiveServiceField } from './settings-fields'
import { extensionGlossary, restoreExtensionConfiguration } from './glossary-store'
import { applyGlossaryMutation } from '../../src/shared/glossary-mutation'
import type { GlossaryDocument } from '../../src/shared/glossary'

let settings = { ...DEFAULT_PREFERENCES }
let glossaryDocument: GlossaryDocument | undefined

vi.mock('./preferences', async original => ({ ...await original<typeof import('./preferences')>(), savePreferences: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./settings-fields', async original => ({ ...await original<typeof import('./settings-fields')>(), usePreferences: () => [settings, 'en', browserText('en')], ConnectionStatus: () => null }))
vi.mock('./provider-client', () => ({ translate: vi.fn().mockResolvedValue('Translated text'), synthesize: vi.fn(), testProvider: vi.fn().mockResolvedValue('OK'), clearTranslationCache: vi.fn().mockResolvedValue(undefined), providerRequest: vi.fn().mockResolvedValue({ desktopConcurrency: 10 }) }))
vi.mock('./providers', async original => { const actual = await original<typeof import('./providers')>(); return { ...actual, loadProviders: vi.fn().mockResolvedValue(actual.DEFAULT_PROVIDERS), saveProviders: vi.fn().mockResolvedValue(undefined), requestProviderAccess: vi.fn().mockResolvedValue(true) } })
vi.mock('./glossary-store', async original => {
  const actual = await original<typeof import('./glossary-store')>()
  return { ...actual, extensionGlossary: {
    snapshot: vi.fn(async () => glossaryDocument ??= actual.migrateLegacyGlossary(settings.glossary, 'Terminology')),
    command: vi.fn(async request => { glossaryDocument = applyGlossaryMutation(glossaryDocument!, request); return glossaryDocument }),
    onChanged: vi.fn(() => () => {}),
  }, restoreExtensionConfiguration: vi.fn(async () => {}) }
})
beforeEach(() => { vi.clearAllMocks(); glossaryDocument = undefined; settings = { ...DEFAULT_PREFERENCES }; window.history.replaceState(null, '', '#general'); window.scrollTo = vi.fn(); vi.mocked(requestProviderAccess).mockReset().mockResolvedValue(true); vi.mocked(translate).mockReset().mockResolvedValue('Translated text'); vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } }) })
describe('extension settings', () => {
  it('keeps a failed glossary save visible inside its open editor', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Terminology' }))
    await user.click(await screen.findByRole('button', { name: 'New glossary library' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Names')
    vi.mocked(extensionGlossary.command).mockRejectedValueOnce(new Error('conflict'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(browserText('en')('suite.revisionConflict'))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Names')
  })
  it('chooses a live service without showing pipeline implementation terms', async () => {
    const user = userEvent.setup(); const cloud = { ...createProvider('alibaba'), id: 'cloud' }; const t = browserText('en')
    render(<LiveServiceField settings={settings} providers={[...DEFAULT_PROVIDERS, cloud]} t={t} />)
    await user.click(screen.getByRole('combobox', { name: t('liveService') }))
    expect(await screen.findAllByRole('option', { name: 'Nola Translator' })).toHaveLength(1)
    expect(screen.queryByText(/cascade|s2s/i)).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: `Alibaba Cloud · ${t('live')}` }))
    expect(requestProviderAccess).toHaveBeenCalledWith(cloud)
    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith({ pipeline: 's2s', s2sProvider: 'cloud' }))
  })
  it('returns to recognition when a regular live service is selected', async () => {
    const user = userEvent.setup(); const cloud = { ...createProvider('alibaba'), id: 'cloud' }; const t = browserText('en')
    render(<LiveServiceField settings={{ ...settings, pipeline: 's2s', s2sProvider: 'cloud' }} providers={[...DEFAULT_PROVIDERS, cloud]} t={t} />)
    await user.click(screen.getByRole('combobox', { name: t('liveService') }))
    await user.click(await screen.findByRole('option', { name: `Alibaba Cloud · ${t('asr')}` }))
    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith({ pipeline: 'cascade', asrProvider: 'cloud' }))
  })
  it('shows a denied live service permission and keeps its previous binding', async () => {
    const user = userEvent.setup(); const cloud = { ...createProvider('alibaba'), id: 'cloud' }; const t = browserText('en')
    render(<LiveServiceField settings={settings} providers={[...DEFAULT_PROVIDERS, cloud]} t={t} />)
    vi.mocked(requestProviderAccess).mockResolvedValueOnce(false)
    await user.click(screen.getByRole('combobox', { name: t('liveService') }))
    await user.click(await screen.findByRole('option', { name: `Alibaba Cloud · ${t('live')}` }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t('permissionFailed'))
    expect(savePreferences).not.toHaveBeenCalled()
  })
  it('adds the chosen provider and keeps its API key masked until requested', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: /^OpenAI$/ }))
    await waitFor(() => expect(saveProviders).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ preset: 'openai' })])))
    const key = await screen.findByLabelText('API key')
    expect(key).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('switch', { name: browserText('en')('showApiKey') }))
    expect(key).toHaveAttribute('type', 'text')
  })
  it('preserves unsaved drafts when switching providers', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: 'Google Translate' }))
    await user.clear(screen.getByRole('textbox', { name: 'Name' })); await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Draft Google')
    await user.click(screen.getByRole('button', { name: 'Microsoft Translator' }))
    await user.click(screen.getByRole('button', { name: 'Google Translate' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft Google')
  })
  it('saves the translation concurrency limit only on the selected channel card', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    expect(await screen.findByText('Managed by the desktop app')).toBeVisible()
    expect(await screen.findByText('10 ·')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Microsoft Translator' }))
    const limit = screen.getByRole('spinbutton', { name: 'Translation concurrency limit' })
    expect(limit).toHaveValue(8)
    await user.clear(limit); await user.type(limit, '6')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(saveProviders).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'microsoft-translate', translationConcurrency: 6 }),
    ])))
    await user.click(screen.getByRole('button', { name: 'Google Translate' }))
    expect(screen.getByRole('spinbutton', { name: 'Translation concurrency limit' })).toHaveValue(8)
    await user.click(screen.getByRole('button', { name: 'Microsoft Edge TTS' }))
    expect(screen.queryByRole('spinbutton', { name: 'Translation concurrency limit' })).toBeNull()
  })
  it('confirms provider removal and restores every affected binding first', async () => {
    const id = 'edge-tts'; settings = { ...settings, ttsProvider: id }
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: /Microsoft Edge TTS/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(saveProviders).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(saveProviders).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ id })])))
    expect(savePreferences).toHaveBeenCalledWith({ ttsProvider: 'desktop' })
    expect(vi.mocked(savePreferences).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(saveProviders).mock.invocationCallOrder[0])
  })
  it('keeps the connection when restoring its bindings fails', async () => {
    settings = { ...settings, ttsProvider: 'edge-tts' }
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'API connections' }))
    await user.click(await screen.findByRole('button', { name: /Microsoft Edge TTS/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    vi.mocked(savePreferences).mockRejectedValueOnce(new Error('write failed'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(saveProviders).not.toHaveBeenCalled()
  })
  it('records a shortcut from the keyboard and focuses search with Ctrl+K', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    await user.click(screen.getByRole('textbox', { name: browserText('en')('translatePage') }))
    await user.keyboard('{Control>}{Shift>}y{/Shift}{/Control}')
    expect(savePreferences).toHaveBeenCalledWith({ shortcutPage: 'Ctrl+Shift+Y' })
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('textbox', { name: 'Search settings' })).toHaveFocus()
  })
  it('rejects a shortcut already used by another action', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    const input = screen.getByRole('textbox', { name: browserText('en')('translateSelection') })
    await user.click(input); await user.keyboard('{Alt>}t{/Alt}')
    expect(savePreferences).not.toHaveBeenCalled()
    expect(input).toHaveValue(settings.shortcutSelection)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(browserText('en')('shortcutConflict'))).toBeVisible()
  })
  it('requires confirmation before removing a term or a site rule', async () => {
    settings = { ...settings, glossary: [{ source: 'API', target: '接口', sites: '' }], siteRules: [{ host: 'example.com', includeSelectors: '', excludeSelectors: '' }] }
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Terminology' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(await screen.findByRole('button', { name: 'Delete API' }))
    expect(savePreferences).not.toHaveBeenCalled()
    expect(extensionGlossary.command).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(extensionGlossary.command).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'deleteTerms' }) })))
    await user.click(screen.getByRole('button', { name: browserText('en')('web') }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(savePreferences).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith({ siteRules: [] }))
  })
  it('confirms resetting settings without a native browser dialog', async () => {
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: browserText('en')('backup') }))
    await user.click(screen.getByRole('button', { name: browserText('en')('resetSettings') }))
    expect(savePreferences).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: browserText('en')('resetSettings') }))
    await waitFor(() => expect(restoreExtensionConfiguration).toHaveBeenCalledWith(expect.objectContaining({ preferences: DEFAULT_PREFERENCES, glossary: expect.objectContaining({ enabled: true, libraries: [] }) }), 0))
  })
  it('cancels an in-flight result when its provider card is closed', async () => {
    let finish!: (value: string) => void
    vi.mocked(translate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const user = userEvent.setup(); render(<Options />)
    await user.click(screen.getByRole('button', { name: 'Translation center' }))
    await user.type(screen.getByRole('textbox', { name: 'Text to translate' }), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Translate text' }))
    await waitFor(() => expect(translate).toHaveBeenCalled())
    const signal = vi.mocked(translate).mock.calls[0][4]
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => finish('Late translation'))
    expect(screen.queryByText('Late translation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Translate text' })).toBeDisabled()
  })
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
    expect(await screen.findByRole('button', { name: 'New glossary library' })).toBeInTheDocument()
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
    await waitFor(() => expect(translate).toHaveBeenCalledWith('Hello', 'auto', 'zh', 'selection', expect.any(AbortSignal), 'desktop'))
    expect(await screen.findByText('Translated text')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terminology' }))
    await user.click(await screen.findByRole('button', { name: 'New glossary library' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Names')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(await screen.findByRole('button', { name: 'Add term' }))
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Source' }), 'API')
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Translation' }), '接口')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(extensionGlossary.command).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveTerm', entry: expect.objectContaining({ source: 'API', target: '接口' }) }) }))
  })
})
