import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import * as store from '@/store'
import * as toast from '@/components/ui/toast'
import type { NolaBridge } from '@/bridge'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { SessionSetupDialog, type SetupDraft } from './SessionSetupDialog'
import type { AvailableModels } from '@/available-models'

const state = vi.hoisted(() => ({ catalog: { asr: [], mt: [], tts: [], llm: [] } as AvailableModels }))
vi.mock('@/available-models', async importOriginal => ({ ...await importOriginal<typeof import('@/available-models')>(), useAvailableModels: () => state.catalog }))
vi.mock('../settings/SettingsPage', () => ({
  SettingSwitch: ({ ariaLabel, isSelected, onChange }: { ariaLabel: string; isSelected: boolean; onChange(value: boolean): void }) =>
    <button role="switch" aria-label={ariaLabel} aria-checked={isSelected} onClick={() => onChange(!isSelected)} />,
}))
const initialSettings = stores.settings.getState()
const initialModels = stores.models.getState()
const draft: SetupDraft = { title: '', keepAudio: false }
beforeEach(() => {
  state.catalog = { asr: [{ binding: 'resource:new', name: 'Loaded recognition', kind: 'asr', origin: 'gateway', free: true, sourceLanguages: ['auto', 'en'] }], mt: [], tts: [], llm: [] }
  stores.settings.setState({ settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: 'zh-CN',
    recognition: { ...DEFAULT_SETTINGS.recognition, modelId: 'sense-voice-small', sourceLanguage: 'en' },
    translation: { ...DEFAULT_SETTINGS.translation, targetLanguage: 'none' },
  } })
  stores.models.setState({ resources: [] })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); stores.settings.setState(initialSettings); stores.models.setState(initialModels) })
const renderDialog = () => {
  const onSubmit = vi.fn()
  const onDraftChange = vi.fn()
  render(<SessionSetupDialog isOpen onOpenChange={vi.fn()} draft={draft} onDraftChange={onDraftChange} devices={[]} language="zh-CN" onSubmit={onSubmit} />)
  return { onSubmit, onDraftChange }
}

it('hides repeated configuration and submits the loaded local replacement', () => {
  const { onSubmit: submit, onDraftChange } = renderDialog()
  expect(screen.getAllByRole('textbox')).toEqual([screen.getByRole('textbox', { name: '名称' })])
  expect(screen.getAllByRole('switch')).toEqual([screen.getByRole('switch', { name: '保存录音' })])
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '会议' } })
  expect(onDraftChange).toHaveBeenLastCalledWith({ title: '会议', keepAudio: false })
  fireEvent.click(screen.getByRole('switch', { name: '保存录音' }))
  expect(onDraftChange).toHaveBeenLastCalledWith({ title: '', keepAudio: true })
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ recognitionBinding: 'resource:new', recognitionModelId: 'new', targetLanguages: [] }))
})

it('keeps a stale application selection scoped to that process for backend validation', () => {
  const deviceId = 'process:' + 'a'.repeat(32)
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, recognition: { ...settings.recognition, audioSource: deviceId } } })
  const { onSubmit: submit } = renderDialog()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ audioSource: { kind: 'processAudio', deviceId } }))
})

it('submits an explicitly selected enabled cloud translation binding and provider', () => {
  state.catalog.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, targetLanguages: ['zh', 'en'] }]
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, translation: { ...settings.translation, provider: 'mymemory', targetLanguage: 'zh' } } })
  const { onSubmit: submit } = renderDialog()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ translationBinding: 'cloud:mymemory', translationProvider: 'mymemory', targetLanguages: ['zh'] }))
})

it('submits speech settings only for the speech output mode', () => {
  state.catalog.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, targetLanguages: ['zh', 'en'] }]
  state.catalog.tts = [{ binding: 'resource:tts-model', name: 'Loaded speech model', kind: 'tts', origin: 'gateway', free: true }]
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: {
    ...settings,
    translation: { ...settings.translation, provider: 'mymemory', targetLanguage: 'zh' },
    realtime: { ...settings.realtime, outputMode: 'speech', speechOutputDeviceId: 'web-audio-device' },
    synthesis: { modelId: 'tts-model', voice: 'voice-a' },
  } })
  const { onSubmit: submit } = renderDialog()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    outputMode: 'speech', speechModelId: 'tts-model', speechVoice: 'voice-a',
    speechOutputDeviceId: 'web-audio-device', targetLanguages: ['zh'],
  }))
})

it('uses explicitly selected LiveTranslate speech without separate ASR, MT, or TTS models', () => {
  state.catalog = { asr: [], mt: [], tts: [], llm: [] }
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: {
    ...settings,
    recognition: { ...settings.recognition, provider: 'aliyun', aliyunWorkspaceId: 'workspace', aliyunModel: 'qwen3.8-livetranslate-flash-realtime' },
    translation: { ...settings.translation, targetLanguage: 'zh' },
    realtime: { ...settings.realtime, outputMode: 'speech', quickS2sModel: 'qwen3.5-livetranslate-flash-realtime', workspaceS2sModel: null,
      virtualInputDeviceId: 'recording-endpoint', speechOutputDeviceId: 'chromium-sink' },
  } })
  stores.models.setState({ credentials: { ...initialModels.credentials, 'aliyun-asr': true } })
  const { onSubmit: submit } = renderDialog()
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

it('blocks an inherited S2S mode when Alibaba Cloud is not configured', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: {
    ...settings,
    translation: { ...settings.translation, targetLanguage: 'zh' },
    realtime: { ...settings.realtime, defaultPipeline: 's2s' },
  } })
  const { onSubmit: submit } = renderDialog()
  expect(screen.getByText('请先配置一个可用的 S2S 模型。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})

it.each([
  ['stopped', '模型网关未启动', '请先前往模型网关启动服务，然后重试。'],
  ['starting', '模型网关', '正在启动'],
  ['running', '没有可用的 ASR 模型', '请配置可用的云端接口，或启用本地模型后在模型网关加载。'],
])('uses the current gateway state (%s) to report an unavailable local model', async (stateName, title, description) => {
  state.catalog.asr = []
  const snapshot = vi.fn().mockResolvedValue({ state: stateName })
  vi.spyOn(store, 'getBridge').mockReturnValue({ gateway: { snapshot } } as unknown as NolaBridge)
  const showToast = vi.spyOn(toast, 'showToast')
  const { onSubmit: submit } = renderDialog()

  expect(screen.queryByText('模型尚未配置，请前往模型管理完成配置。')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始' }))

  await waitFor(() => expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title, description })))
  expect(submit).not.toHaveBeenCalled()
})
