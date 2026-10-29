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

it('leaves recognition model choice to Model Gateway and keeps only the source language here', () => {
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' as const, aliyunWorkspaceId: 'workspace-123' } }
  settingsStore.setState({ settings })
  render(<AudioTab settings={settings} />)
  const group = within(screen.getByRole('group', { name: '识别' }))
  expect(group.getByText('原文语言')).toBeInTheDocument()
  // The provider picker, the recognition model and the Aliyun workspace fields all moved: the
  // connection is configured in model management and the loaded model is chosen in Model Gateway.
  expect(group.queryByRole('combobox', { name: '服务商' })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('workspace-123')).not.toBeInTheDocument()
  expect(group.getByText(/模型网关/)).toBeInTheDocument()
})

it('keeps translation behavior here and routes connection setup to Model Management', async () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'mymemory' as const, mymemoryEmail: 'test@example.com', translateIntermediate: true } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByRole('button', { name: '模型启用与默认模型' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '默认模型供新场景和工具调用使用；不会改变运行中的任务。' })).toBeInTheDocument()
  expect(screen.queryByDisplayValue('https://api.mymemory.translated.net/get')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('test@example.com')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('API 密钥')).not.toBeInTheDocument()
  await fireEvent.click(screen.getByRole('button', { name: '模型启用与默认模型' }))
  expect(window.location.hash).toBe('#/models')
})

it('keeps translation intermediate behavior available without connection fields', () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'google' as const, translateIntermediate: true } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByRole('switch', { name: '翻译未定稿字幕' })).toBeInTheDocument()
  expect(screen.queryByLabelText('API 密钥')).not.toBeInTheDocument()
  expect(screen.queryByText('https://translation.googleapis.com/language/translate/v2')).not.toBeInTheDocument()
})

it('routes ASR connection setup to Model Management while preserving recognition behavior controls', async () => {
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' as const, aliyunWorkspaceId: 'workspace-123' } }
  settingsStore.setState({ settings })
  render(<AudioTab settings={settings} />)
  expect(screen.getByRole('button', { name: '模型启用与默认模型' })).toBeInTheDocument()
  expect(screen.queryByDisplayValue('workspace-123')).not.toBeInTheDocument()
  expect(screen.getByText('原文语言')).toBeInTheDocument()
  await fireEvent.click(screen.getByRole('button', { name: '模型启用与默认模型' }))
  expect(window.location.hash).toBe('#/models')
})
