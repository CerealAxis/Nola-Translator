import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { SessionSetupDialog, type SetupDraft } from './SessionSetupDialog'
import type { AvailableModels } from '@/available-models'

const state = vi.hoisted(() => ({ catalog: { asr: [], mt: [], tts: [], llm: [] } as AvailableModels }))
vi.mock('@/available-models', async importOriginal => ({ ...await importOriginal<typeof import('@/available-models')>(), useAvailableModels: () => state.catalog }))
vi.mock('../settings/SettingsPage', () => ({
  SettingSelect: ({ value, ariaLabel, options, onChange }: { value: string; ariaLabel: string; options: { value: string; label: string; isDisabled?: boolean }[]; onChange(value: string): void }) => <select value={value} aria-label={ariaLabel} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value} disabled={option.isDisabled}>{option.label}</option>)}</select>,
  SettingSwitch: () => null,
}))
const initialSettings = stores.settings.getState()
const initialModels = stores.models.getState()
const draft: SetupDraft = { title: '', audioSource: 'defaultOutput', sourceLanguage: 'en', recognitionModelId: 'sense-voice-small', recognitionBinding: 'resource:old', translate: false, targetLanguage: 'zh', translationModelId: '', keepAudio: false }
beforeEach(() => {
  state.catalog = { asr: [{ binding: 'resource:new', name: 'Loaded recognition', kind: 'asr', origin: 'gateway', free: true, sourceLanguages: ['auto', 'en'] }], mt: [], tts: [], llm: [] }
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  stores.models.setState({ resources: [] })
})
afterEach(() => { cleanup(); stores.settings.setState(initialSettings); stores.models.setState(initialModels) })
const renderDialog = (value = draft) => {
  const onSubmit = vi.fn()
  render(<SessionSetupDialog isOpen onOpenChange={vi.fn()} draft={value} onDraftChange={vi.fn()} devices={[]} language="zh-CN" onSubmit={onSubmit} />)
  return onSubmit
}

it('offers only callable recognition choices and submits the loaded local replacement', () => {
  const submit = renderDialog()
  const recognition = within(screen.getByRole('combobox', { name: '识别模型' }))
  expect(recognition.getAllByRole('option')).toHaveLength(1)
  expect(recognition.getByRole('option', { name: 'Loaded recognition' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ recognitionBinding: 'resource:new', recognitionModelId: 'new', targetLanguages: [] }))
})

it('submits an explicitly selected enabled cloud translation binding and provider', () => {
  state.catalog.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, targetLanguages: ['zh', 'en'] }]
  const submit = renderDialog({ ...draft, translate: true, translationBinding: 'cloud:mymemory' })
  expect(within(screen.getByRole('combobox', { name: '翻译模型' })).getByRole('option', { name: 'MyMemory' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ translationBinding: 'cloud:mymemory', translationProvider: 'mymemory', targetLanguages: ['zh'] }))
})

it('blocks session start when the saved local model has no loaded replacement', () => {
  state.catalog.asr = []
  const submit = renderDialog()
  expect(within(screen.getByRole('combobox', { name: '识别模型' })).getByRole('option', { name: '暂无可用模型' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '开始' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})
