import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as storeApi from '@/store'
import { stores } from '@/store'
import type { NolaBridge } from '@/bridge'
import * as settingsActions from '@/store/settingsStore'
import * as toast from '@/components/ui/toast'
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
    realtime: { ...DEFAULT_SETTINGS.realtime, quickS2sModel: null },
    modelPolicy: { enabled: { 'mt:mt-custom:saved': true, 'mt:cloud:microsoft': true, 'asr:cloud:aliyun': true }, defaults: {}, selections: {} },
    recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace' },
    translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } } })
  stores.models.setState({ ...initialModels, credentials: { ...initialModels.credentials, microsoft: true, 'aliyun-asr': true } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); stores.settings.setState(initialSettings); stores.models.setState(initialModels) })

it('keeps latency detection off by default and saves the opt-in', () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  render(<OverlayPage />)
  const toggle = screen.getByRole('switch', { name: '延迟检测' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  expect(update).toHaveBeenCalledWith({ realtime: { latencyDetection: true } })
})

it('lists enabled configured cloud translators and recognition services before they are selected', () => {
  render(<OverlayPage />)
  const translation = within(screen.getByRole('combobox', { name: '翻译模型' }))
  expect(translation.getByRole('option', { name: 'Saved cloud translator' })).toBeEnabled()
  expect(translation.getByRole('option', { name: /Microsoft/ })).toBeEnabled()
  expect(within(screen.getByRole('combobox', { name: '识别模型' })).getByRole('option', { name: /阿里云/ })).toBeEnabled()
})

it('hides all model pickers when following the gateway', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, realtime: {
    ...settings.realtime, quickS2sModel: undefined, outputMode: 'speech',
  } } })
  render(<OverlayPage />)
  expect(screen.getByRole('combobox', { name: '处理方式' })).toHaveValue('default')
  expect(screen.queryByRole('combobox', { name: /识别模型|翻译模型|语音合成模型|S2S模型/ })).not.toBeInTheDocument()
})

it('separates the direct processing mode, S2S model and playback switch', () => {
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, realtime: {
    ...settings.realtime, outputMode: 'speech', quickS2sModel: 'qwen3.5-livetranslate-flash-realtime',
  } } })
  render(<OverlayPage />)
  const processing = screen.getByRole('combobox', { name: '处理方式' })
  expect(within(processing).getAllByRole('option').map(option => option.textContent)).toEqual(['跟随网关', '分步识别', '直接语音识别'])
  expect(screen.getByRole('combobox', { name: 'S2S 模型' })).toHaveTextContent('Qwen3.5 LiveTranslate')
  expect(screen.getByRole('switch', { name: '播报译音' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('combobox', { name: '输出设备' })).toBeEnabled()
  expect(screen.queryByRole('combobox', { name: '语音合成模型' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '输出模式' })).not.toBeInTheDocument()
})

it('toggles speech independently of model and device selection', async () => {
  const resourceId = 'tts-qwen3-tts-crisp-0.6b-base-q8-0'
  const settings = stores.settings.getState().settings!
  const policy = settings.modelPolicy!
  stores.settings.setState({ settings: { ...settings, modelPolicy: { ...policy, enabled: { ...policy.enabled, [`tts:resource:${resourceId}`]: true } } } })
  stores.models.setState({ resources: [{ resourceId, kind: 'ttsModel', provider: 'crisp-tts', name: 'Local speech', description: '', languages: [], installed: true, installedBytes: 1, state: 'idle', cancellable: false }] })
  vi.spyOn(storeApi, 'getBridge').mockReturnValue({
    overlay: { getVisibility: async () => false }, events: { onOverlayVisibilityChanged: () => () => undefined },
    gateway: { onChanged: () => () => undefined, snapshot: async () => ({ state: 'running', services: { asr: { state: 'stopped' }, mt: { state: 'stopped' }, tts: { state: 'stopped' }, llm: { state: 'stopped' } }, realtime: { models: [{ enabled: true, operations: ['synthesize'], model_id: resourceId }] } }) },
  } as unknown as NolaBridge)
  const mediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    enumerateDevices: async () => [{ kind: 'audiooutput', deviceId: 'speakers', label: 'Speakers' }],
  } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockImplementation(async patch => {
    const current = stores.settings.getState().settings!
    stores.settings.setState({ settings: { ...current, modelPolicy: patch.modelPolicy ? { ...policy, ...patch.modelPolicy } : current.modelPolicy,
      synthesis: { ...current.synthesis, ...patch.synthesis }, realtime: { ...current.realtime, ...patch.realtime } } })
  })
  try {
    render(<OverlayPage />)
    const playback = screen.getByRole('switch', { name: '播报译音' })
    expect(screen.queryByRole('combobox', { name: '输出设备' })).not.toBeInTheDocument()
    fireEvent.click(playback)
    expect(update).toHaveBeenLastCalledWith({ realtime: { outputMode: 'speech' } })
    const model = screen.getByRole('combobox', { name: '语音合成模型' })
    const output = screen.getByRole('combobox', { name: '输出设备' })
    const option = await within(model).findByRole('option', { name: 'Local speech' })
    fireEvent.change(model, { target: { value: (option as HTMLOptionElement).value } })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ synthesis: { modelId: resourceId, voice: '' } }))
    expect(output).toBeEnabled()
    fireEvent.change(output, { target: { value: 'speakers' } })
    expect(update).toHaveBeenLastCalledWith({ realtime: { speechOutputDeviceId: 'speakers' } })
    fireEvent.click(playback)
    expect(update).toHaveBeenLastCalledWith({ realtime: { outputMode: 'translation' } })
    expect(output).not.toBeInTheDocument()
    fireEvent.click(playback)
    expect(screen.getByRole('combobox', { name: '输出设备' })).toHaveValue('speakers')
  } finally {
    if (mediaDevices) Object.defineProperty(navigator, 'mediaDevices', mediaDevices)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
  }
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
  const notice = vi.spyOn(toast, 'showToast')

  render(<OverlayPage />)
  fireEvent.click(screen.getByRole('button', { name: '打开悬浮字幕' }))

  await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({ title: '模型网关未启动', description: '请先前往模型网关启动服务，然后重试。' })))
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
