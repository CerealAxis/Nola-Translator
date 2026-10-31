import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as storeApi from '@/store'
import { stores } from '@/store'
import type { NolaBridge } from '@/bridge'
import * as settingsActions from '@/store/settingsStore'
import * as notify from '@/components/primitives/notify'
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


it('keeps configured cloud services available without local model enablement', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, modelPolicy: { enabled: {}, defaults: {}, selections: {} } } })
  render(<OverlayPage />)
  expect(within(screen.getByRole('combobox', { name: '翻译模型' })).getByRole('option', { name: 'Saved cloud translator' })).toBeEnabled()
  expect(within(screen.getByRole('combobox', { name: '识别模型' })).getByRole('option', { name: /阿里云/ })).toBeEnabled()
})

it('shows an app toast when the model gateway is stopped', async () => {
  const gateway = {
    snapshot: vi.fn().mockResolvedValue({ state: 'stopped' }),
    onChanged: vi.fn(() => () => undefined),
  }
  vi.spyOn(storeApi, 'getBridge').mockReturnValue({ gateway,
    overlay: { getVisibility: vi.fn().mockResolvedValue(false) },
    events: { onOverlayVisibilityChanged: vi.fn(() => () => undefined) },
    app: { notifyMainError: vi.fn() },
  } as unknown as NolaBridge)
  const showOverlay = vi.spyOn(settingsActions, 'showOverlay').mockResolvedValue(true)
  const notice = vi.spyOn(notify, 'notifyGatewayModelUnavailable')

  render(<OverlayPage />)
  fireEvent.click(screen.getByRole('button', { name: '打开悬浮字幕' }))

  await waitFor(() => expect(notice).toHaveBeenCalledWith('没有可用的ASR模型', expect.any(String), '模型网关'))
  expect(showOverlay).not.toHaveBeenCalled()
})

it('uses the floating-caption action as a toggle and closes without checking models', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  const gateway = { snapshot: vi.fn().mockResolvedValue({ state: 'stopped' }), onChanged: vi.fn(() => () => undefined) }
  vi.spyOn(storeApi, 'getBridge').mockReturnValue({
    gateway,
    overlay: { getVisibility: vi.fn().mockResolvedValue(true), close },
    events: { onOverlayVisibilityChanged: vi.fn(() => () => undefined) },
    app: { notifyMainError: vi.fn() },
  } as unknown as NolaBridge)

  render(<OverlayPage />)
  const toggle = await screen.findByRole('button', { name: '关闭悬浮窗' })
  const gatewayReads = gateway.snapshot.mock.calls.length
  fireEvent.click(toggle)

  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(gateway.snapshot).toHaveBeenCalledTimes(gatewayReads)
})
