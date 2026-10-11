import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../../shared/settings'
import { settingsStore } from '@/store/settingsStore'
import { AudioTab } from './AudioTab'
import { TranslationTab } from './TranslationTab'

afterEach(() => { cleanup(); settingsStore.setState({ settings: DEFAULT_SETTINGS }) })

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

it('shows MyMemory endpoint and optional email without a key or intermediate switch', () => {
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'mymemory' as const, mymemoryEmail: 'test@example.com', translateIntermediate: true } }
  settingsStore.setState({ settings })
  render(<TranslationTab settings={settings} />)
  expect(screen.getByDisplayValue('https://api.mymemory.translated.net/get')).toBeInTheDocument()
  expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument()
  expect(screen.getByText(/每句确认后通过 REST 翻译/)).toBeInTheDocument()
  expect(screen.queryByLabelText('API 密钥')).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})

it('keeps the local model choice inside the translation service card', () => {
  render(<TranslationTab settings={DEFAULT_SETTINGS} />)
  expect(screen.getByRole('group', { name: '翻译服务' })).toBeInTheDocument()
  expect(screen.getByText('模型')).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-group')).toHaveLength(1)
})
