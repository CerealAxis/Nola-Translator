import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import * as notify from '@/components/primitives/notify'
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
const draft: SetupDraft = { title: '', audioSource: 'defaultOutput', sourceLanguage: 'en', recognitionModelId: 'sense-voice-small', recognitionBinding: 'resource:old', outputMode: 'source', speakerDetection: true, speechModelId: '', speechVoice: '', speechOutputDeviceId: '', targetLanguage: 'zh', translationModelId: '', keepAudio: false }
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

it('hides repeated configuration and submits the loaded local replacement', () => {
  const submit = renderDialog()
  expect(screen.getByRole('combobox', { name: '音频来源' })).toBeInTheDocument()
  expect(screen.queryByText('识别模型')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ recognitionBinding: 'resource:new', recognitionModelId: 'new', targetLanguages: [] }))
})

it('keeps a stale application selection scoped to that process for backend validation', () => {
  const deviceId = 'process:' + 'a'.repeat(32)
  const submit = renderDialog({ ...draft, audioSource: deviceId })
  expect(screen.getByRole('option', { name: '应用已退出或选择已过期，请重新选择' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ audioSource: { kind: 'processAudio', deviceId } }))
})

it('submits an explicitly selected enabled cloud translation binding and provider', () => {
  state.catalog.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, targetLanguages: ['zh', 'en'] }]
  const submit = renderDialog({ ...draft, outputMode: 'translation', translationBinding: 'cloud:mymemory' })
  expect(screen.getByRole('combobox', { name: '音频来源' })).toBeInTheDocument()
  expect(screen.queryByText('翻译模型')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ translationBinding: 'cloud:mymemory', translationProvider: 'mymemory', targetLanguages: ['zh'] }))
})

it('submits speech settings only for the speech output mode', () => {
  state.catalog.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, targetLanguages: ['zh', 'en'] }]
  state.catalog.tts = [{ binding: 'resource:tts-model', name: 'Loaded speech model', kind: 'tts', origin: 'gateway', free: true }]
  const submit = renderDialog({ ...draft, outputMode: 'speech', translationBinding: 'cloud:mymemory', speechModelId: 'tts-model', speechVoice: 'voice-a', speechOutputDeviceId: 'web-audio-device' })
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    outputMode: 'speech', speakerDetection: true, speechModelId: 'tts-model', speechVoice: 'voice-a',
    speechOutputDeviceId: 'web-audio-device', targetLanguages: ['zh'],
  }))
})

it('uses explicitly selected LiveTranslate speech without separate ASR, MT, or TTS models', () => {
  state.catalog = { asr: [], mt: [], tts: [], llm: [] }
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', recognition: {
    ...DEFAULT_SETTINGS.recognition, provider: 'aliyun', aliyunWorkspaceId: 'workspace', aliyunModel: 'qwen3.8-livetranslate-flash-realtime',
  } } })
  stores.models.setState({ credentials: { ...initialModels.credentials, 'aliyun-asr': true } })
  const submit = renderDialog({ ...draft, outputMode: 'speech', s2sModel: 'qwen3.5-livetranslate-flash-realtime',
    virtualInputDeviceId: 'recording-endpoint', speechOutputDeviceId: 'chromium-sink' })
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    outputMode: 'speech', targetLanguages: ['zh'], sourceLanguage: 'en',
    recognitionOptions: expect.objectContaining({ model: 'qwen3.5-livetranslate-flash-realtime' }),
    audioSource: { kind: 'virtualInput', deviceId: 'recording-endpoint' }, speechOutputDeviceId: 'chromium-sink',
  }))
  expect(submit.mock.calls[0][0]).not.toHaveProperty('recognitionBinding')
  expect(submit.mock.calls[0][0]).not.toHaveProperty('speechModelId')
  expect(submit.mock.calls[0][0]).not.toHaveProperty('translationBinding')
})

it('blocks direct speech and an inherited S2S mode when Alibaba Cloud is not configured', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, realtime: { ...settings.realtime, defaultPipeline: 's2s' } } })
  const warning = vi.spyOn(notify, 'notifyWarning').mockReturnValue('warning')
  const submit = renderDialog({ ...draft, outputMode: 'translation' })
  const mode = screen.getByRole('combobox', { name: '处理方式' })
  fireEvent.change(mode, { target: { value: 's2s' } })
  expect(warning).toHaveBeenCalledWith('请先配置一个可用的 S2S 模型。')
  expect(mode).toHaveValue('default')
  expect(screen.getByRole('button', { name: '开始' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
  warning.mockRestore()
})

it('blocks session start when the saved local model has no loaded replacement', () => {
  state.catalog.asr = []
  const submit = renderDialog()
  expect(screen.getByRole('button', { name: '开始' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})
