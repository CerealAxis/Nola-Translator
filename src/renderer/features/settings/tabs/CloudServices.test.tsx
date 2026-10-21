import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../../shared/settings'
import { settingsStore } from '@/store/settingsStore'
import { AudioTab } from './AudioTab'
import { TranslationTab } from './TranslationTab'
import { I18nProvider, translate } from '@/i18n'
import * as settingsActions from '@/store/settingsStore'

afterEach(() => { cleanup(); vi.restoreAllMocks(); settingsStore.setState({ settings: DEFAULT_SETTINGS }) })

it.each(['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko'] as const)('shows localized VAD timing fields in %s', language => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
  const settings = { ...DEFAULT_SETTINGS, uiLanguage: language, recognition: { ...DEFAULT_SETTINGS.recognition, max_segment_ms: 15000, silence_end_ms: 1200 } }
  settingsStore.setState({ settings })
  render(<I18nProvider><AudioTab settings={settings} /></I18nProvider>)
  expect(screen.getByRole('slider', { name: translate('settings.maxSegmentMs', language) })).toHaveValue('15000')
  expect(screen.getByRole('slider', { name: translate('settings.silenceEndMs', language) })).toHaveValue('1200')
})

it('saves edited VAD timing through the settings action', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  settingsStore.setState({ settings: DEFAULT_SETTINGS })
  render(<AudioTab settings={DEFAULT_SETTINGS} />)
  const input = screen.getByRole('slider', { name: '最长分段时长（毫秒）' })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '10500' } })
  fireEvent.blur(input)
  await waitFor(() => expect(update).toHaveBeenCalledWith({ recognition: { max_segment_ms: 10500 } }))
})

it('uses server VAD for Aliyun and exposes local VAD timing for MiniMax', () => {
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' as const } }
  settingsStore.setState({ settings })
  const view = render(<AudioTab settings={settings} />)
  expect(screen.queryByRole('slider', { name: '最长分段时长（毫秒）' })).not.toBeInTheDocument()
  view.rerender(<AudioTab settings={{ ...settings, recognition: { ...settings.recognition, provider: 'minimax' } }} />)
  expect(within(screen.getByRole('group', { name: '语音分段' })).getAllByRole('slider')).toHaveLength(2)
})

it('bounds the sliders and restores only speech segmentation defaults', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, max_segment_ms: 15000, silence_end_ms: 1200 } }
  settingsStore.setState({ settings })
  render(<AudioTab settings={settings} />)
  const group = within(screen.getByRole('group', { name: '语音分段' }))
  const maximum = group.getByRole('slider', { name: '最长分段时长（毫秒）' })
  const silence = group.getByRole('slider', { name: '静音结束时长（毫秒）' })
  expect(maximum).toHaveAttribute('min', '3000')
  expect(maximum).toHaveAttribute('max', '30000')
  expect(maximum).toHaveAttribute('step', '500')
  expect(silence).toHaveAttribute('min', '300')
  expect(silence).toHaveAttribute('max', '2000')
  expect(silence).toHaveAttribute('step', '100')
  fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith({ recognition: { max_segment_ms: 10000, silence_end_ms: 800 } }))
})

it('shows regional workspace and a dedicated key field for Aliyun recognition', () => {
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' as const, aliyunWorkspaceId: 'workspace-123' } }
  settingsStore.setState({ settings })
  render(<AudioTab settings={settings} />)
  expect(screen.getByDisplayValue('workspace-123')).toBeInTheDocument()
  expect(screen.getByLabelText('API 密钥')).toHaveAttribute('type', 'password')
  expect(screen.getByRole('button', { name: '识别模型 — Info' })).toBeInTheDocument()
  expect(screen.queryByText(/3.8 自动识别源语言/)).not.toBeInTheDocument()
  expect(screen.queryByText('SenseVoiceSmall')).not.toBeInTheDocument()
})

it('shows MyMemory endpoint and moves its explanation into a tooltip', () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'mymemory' as const, mymemoryEmail: 'test@example.com', translateIntermediate: true } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByDisplayValue('https://api.mymemory.translated.net/get')).toBeInTheDocument()
  expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'MyMemory 免费翻译 — Info' })).toBeInTheDocument()
  expect(screen.queryByText(/每句确认后通过 REST 翻译/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('API 密钥')).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})

it('shows Google Translate endpoint and a dedicated key field', () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'google' as const } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByText('https://translation.googleapis.com/language/translate/v2')).toBeInTheDocument()
  expect(screen.getByLabelText('API 密钥')).toHaveAttribute('type', 'password')
  expect(screen.getByRole('switch')).toBeInTheDocument()
})

it('keeps the local model choice inside the translation service card', () => {
  render(<TranslationTab settings={DEFAULT_SETTINGS} />)
  const translationService = screen.getByRole('group', { name: '翻译服务' })
  expect(within(translationService).getByText('模型')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: '备用翻译' })).toBeInTheDocument()
})

it('shows the fixed public Index-Translate model with streaming and no key field', () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'index-translate' as const } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByText('Index-Translate-35B-A3B')).toBeInTheDocument()
  expect(screen.getByText('https://index-translate.bilibili.com/v1')).toBeInTheDocument()
  expect(screen.queryByText(/原文会发送给哔哩哔哩/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('API 密钥')).not.toBeInTheDocument()
  expect(screen.getByRole('switch')).toBeInTheDocument()
})
