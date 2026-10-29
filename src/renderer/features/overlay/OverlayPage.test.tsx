import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { OverlayPage } from './OverlayPage'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
vi.mock('../settings/SettingsPage', async importOriginal => ({
  ...await importOriginal<typeof import('../settings/SettingsPage')>(),
  SettingSelect: ({ value, ariaLabel, options, onChange, isDisabled }: {
    value: string; ariaLabel: string; options: { value: string; label: string; isDisabled?: boolean }[]
    onChange(value: string): void; isDisabled?: boolean
  }) => <select aria-label={ariaLabel} value={value} disabled={isDisabled} onChange={event => onChange(event.target.value)}>
    {options.map(option => <option key={option.value} value={option.value} disabled={option.isDisabled}>{option.label}</option>)}
  </select>,
}))

const initialSettings = stores.settings.getState()
const initialModels = stores.models.getState()
const profile = { id: 'saved', name: 'Saved cloud translator', endpoint: 'https://example.com/v1', model: 'translator', apiFormat: 'chat-completions' as const, contextWindow: 32768, maxOutputTokens: 1024, languages: ['zh', 'en'] }
beforeEach(() => {
  stores.settings.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), uiLanguage: 'zh-CN',
    modelPolicy: { enabled: { 'mt:mt-custom:saved': true, 'mt:cloud:microsoft': true, 'asr:cloud:aliyun': true }, defaults: {}, selections: {} },
    recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace' },
    translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } } })
  stores.models.setState({ ...initialModels, credentials: { ...initialModels.credentials, microsoft: true, 'aliyun-asr': true } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); stores.settings.setState(initialSettings); stores.models.setState(initialModels) })

it('lists enabled configured cloud translators and recognition services before they are selected', () => {
  render(<OverlayPage />)
  const translation = within(screen.getByRole('combobox', { name: '翻译模型' }))
  expect(translation.getByRole('option', { name: 'Saved cloud translator' })).toBeEnabled()
  expect(translation.getByRole('option', { name: /Microsoft/ })).toBeEnabled()
  expect(within(screen.getByRole('combobox', { name: '识别模型' })).getByRole('option', { name: /阿里云/ })).toBeEnabled()
})
it('selects a saved cloud profile with its connection and restores disabled translation', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, translation: { ...settings.translation, targetLanguage: 'none' } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  render(<OverlayPage />)
  fireEvent.change(screen.getByRole('combobox', { name: '翻译模型' }), { target: { value: 'mt-custom:saved' } })
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    translation: expect.objectContaining({ provider: 'cloud', customModelId: 'saved', cloudEndpoint: profile.endpoint, targetLanguage: 'zh' }),
    overlay: { showTranslation: true },
  }))
})


it('hides configured cloud services after they are disabled', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, modelPolicy: { enabled: {}, defaults: {}, selections: {} } } })
  render(<OverlayPage />)
  expect(within(screen.getByRole('combobox', { name: '翻译模型' })).queryByRole('option', { name: 'Saved cloud translator' })).toBeNull()
  expect(within(screen.getByRole('combobox', { name: '识别模型' })).getByRole('option', { name: '暂无可用模型' })).toBeDisabled()
})
