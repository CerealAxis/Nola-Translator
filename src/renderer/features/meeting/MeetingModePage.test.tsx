import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { NolaBridge } from '@/bridge'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { DEFAULT_MEETING_MODE, type MeetingModeSnapshot } from '../../../shared/meeting-mode'
import * as store from '@/store'
import { MeetingModePage } from './MeetingModePage'
import type { SettingSelectProps } from '../settings/SettingsPage'
import type { AvailableModels } from '@/available-models'

const models = vi.hoisted(() => ({ catalog: { asr: [], mt: [], tts: [], llm: [], ocr: [] } as AvailableModels }))
vi.mock('@/available-models', async importOriginal => ({ ...await importOriginal<typeof import('@/available-models')>(), useAvailableModels: () => models.catalog, useGatewaySnapshot: () => ({ state: 'running' }) }))

vi.mock('../settings/SettingsPage', () => ({ SettingSelect: ({ id, value, options, onChange, ariaLabel, isDisabled }: SettingSelectProps) =>
  <select id={id} value={value} disabled={isDisabled} aria-label={ariaLabel} onChange={event => onChange(event.target.value)}>
    {options.map(option => <option key={option.value} value={option.value} disabled={option.isDisabled}>{option.label}</option>)}
  </select> }))

const mode = { ...DEFAULT_MEETING_MODE, microphoneId: 'mic', headphonesId: 'ears', uplinkOutputId: 'up', downlinkInputId: 'down' }
const devices = [
  { deviceId: 'mic', kind: 'microphone', name: 'Studio mic', isDefault: true },
  { deviceId: 'ears', kind: 'systemOutput', name: 'Headphones', isDefault: true },
  { deviceId: 'up', kind: 'systemOutput', name: 'CABLE-A Input (VB-Audio Cable A)', isDefault: false },
  { deviceId: 'up-capture', kind: 'microphone', name: 'CABLE-A Output (VB-Audio Cable A)', isDefault: false },
  { deviceId: 'down-render', kind: 'systemOutput', name: 'CABLE-B Input (VB-Audio Cable B)', isDefault: false },
  { deviceId: 'down', kind: 'microphone', name: 'CABLE-B Output (VB-Audio Cable B)', isDefault: false },
] as const
const initialSettings = store.stores.settings.getState()
const initialModels = store.stores.models.getState()
const start = vi.fn()
let changed: (snapshot: MeetingModeSnapshot) => void
beforeEach(() => {
  models.catalog = {
    asr: [{ binding: 'resource:asr', name: 'ASR', kind: 'asr', origin: 'gateway', free: true, sourceLanguages: ['auto', 'zh', 'en', 'ja'] }],
    mt: [{ binding: 'resource:mt', name: 'MT', kind: 'mt', origin: 'gateway', free: true, sourceLanguages: ['auto', 'zh', 'en', 'ja'], targetLanguages: ['zh', 'en', 'ja'] }],
    tts: [{ binding: 'resource:tts', name: 'TTS', kind: 'tts', origin: 'gateway', free: true, targetLanguages: ['zh', 'en', 'ja'] }],
    ocr: [], llm: [],
  }
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: mode } })
  store.stores.models.setState({ devices: [...devices] })
  vi.spyOn(store.actions.models, 'probeAudioDevices').mockResolvedValue([...devices])
  vi.spyOn(store.actions.settings, 'updateSettings').mockResolvedValue()
  start.mockReset().mockResolvedValue({ state: 'running', passthroughActive: false })
  vi.spyOn(store, 'getBridge').mockReturnValue({ meetingMode: {
    snapshot: async () => ({ state: 'idle', passthroughActive: false }),
    onChanged: (callback: typeof changed) => { changed = callback; return () => undefined },
    start,
    stop: async () => ({ state: 'idle', passthroughActive: false }),
  } } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); store.stores.settings.setState(initialSettings); store.stores.models.setState(initialModels) })
const ready = async () => {
  await act(async () => { render(<MeetingModePage />) })
  const refresh = screen.getByText('刷新设备', { selector: 'button' })
  expect(refresh).toHaveRole('button')
  expect(refresh).toHaveAccessibleName('刷新设备')
  expect(refresh).toBeEnabled()
}

it('keeps start disabled until the current meeting state is known and offers stop after a read failure', async () => {
  const api = store.getBridge()!.meetingMode!
  let reject!: (error: Error) => void
  vi.spyOn(api, 'snapshot').mockReturnValue(new Promise((_, fail) => { reject = fail }))
  render(<MeetingModePage />)
  expect(screen.getByRole('button', { name: '开始会议口译' })).toBeDisabled()
  await act(async () => { reject(new Error('network unavailable')) })
  expect(await screen.findByRole('alert')).toHaveTextContent('无法确认会议口译状态')
  expect(screen.getByRole('button', { name: '停止会议口译' })).toBeEnabled()
  expect(start).not.toHaveBeenCalled()
})

it('rejects a saved meeting source unsupported by its custom translator', async () => {
  models.catalog.mt = [{ binding: 'mt-custom:limited', name: 'Limited', kind: 'mt', origin: 'cloud', free: false, sourceLanguages: ['en'], targetLanguages: ['zh'] }]
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings,
    modelPolicy: { enabled: {}, defaults: {}, ...settings.modelPolicy, selections: { ...settings.modelPolicy?.selections, mt: 'mt-custom:limited' } },
    meetingMode: { ...mode, pipeline: 'cascade', uplinkEnabled: true, downlinkEnabled: false, localLanguage: 'ja', remoteLanguage: 'zh' },
  } })
  await ready()
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  expect(start).not.toHaveBeenCalled()
})

it('limits bidirectional choices to the selected recognition, translation and speech models', async () => {
  models.catalog.asr[0].sourceLanguages = ['auto', 'zh', 'en', 'ja', 'fr']
  models.catalog.mt[0].targetLanguages = ['zh', 'en', 'ja', 'de']
  models.catalog.tts[0].targetLanguages = ['zh', 'en']
  await ready()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '我的语言' }))
  expect(within(await screen.findByRole('listbox')).getAllByRole('option').map(option => option.textContent)).toEqual(['简体中文', '英语 (English)'])
  expect(screen.queryByRole('option', { name: '自动检测' })).not.toBeInTheDocument()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.getByRole('combobox', { name: '我的语言' })).toHaveAttribute('aria-expanded', 'false'))
  fireEvent.click(screen.getByRole('switch', { name: '对方说给我' }))
  await user.click(screen.getByRole('combobox', { name: '我的语言' }))
  expect(await screen.findByRole('option', { name: '日语 (日本語)' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '法语 (français)' })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '德语 (Deutsch)' })).not.toBeInTheDocument()
})

it('renders a display-only scene with independent input and output activity', async () => {
  await ready()
  const stage = document.querySelector('[data-slot="meeting-stage"]')!
  expect(stage.querySelector('button, input, select, [role="button"]')).toBeNull()
  expect(stage.textContent).not.toContain('等待说话')
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await screen.findByText('停止会议口译')
  const lane = { inputPeak: 0.3, inputAgeMs: 50, sourceText: 'Hello there', translatedText: '你好', playback: 'finished' as const }
  act(() => changed({ state: 'running', passthroughActive: false, telemetry: { uplink: lane, downlink: { ...lane, inputAgeMs: 2000, playback: 'playing' } } }))
  expect(screen.getByTestId('meeting-wire-uplink-input')).toHaveAttribute('data-state', 'active')
  expect(screen.getByTestId('meeting-wire-uplink-output')).toHaveAttribute('data-state', 'connected')
  expect(screen.getByTestId('meeting-wire-downlink-input')).toHaveAttribute('data-state', 'idle')
  expect(screen.getByTestId('meeting-wire-downlink-output')).toHaveAttribute('data-state', 'active')
  act(() => changed({ state: 'unknown', passthroughActive: false, telemetry: { uplink: lane } }))
  for (const wire of stage.querySelectorAll('[data-testid^="meeting-wire"]')) expect(wire).toHaveAttribute('data-state', 'idle')
})

it('keeps meeting preferences on the page and links to centralized shortcuts', async () => {
  await ready()
  expect(screen.queryByRole('button', { name: '更多设置' })).not.toBeInTheDocument()
  expect(screen.queryByText('打开模型管理')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '快捷键设置' })).toHaveAttribute('href', '#/settings/shortcuts')
  expect(screen.getByRole('button', { name: '音频设备' })).toHaveAttribute('href', '#/settings/audio')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '字幕范围' })).toBeVisible()
  expect(screen.getByRole('switch', { name: '说话人标签' })).toBeVisible()
  expect(screen.getByRole('slider', { name: '原声音量' })).toBeVisible()
  expect(screen.queryByRole('combobox', { name: '按住说原声' })).not.toBeInTheDocument()
})

it('supports receive-only application audio without a cable or microphone', async () => {
  const receive = { ...mode, uplinkEnabled: false, downlinkSource: 'application' as const, applicationId: 'process:call', microphoneId: '', uplinkOutputId: '', downlinkInputId: '' }
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: receive } })
  store.stores.models.setState({ devices: [{ deviceId: 'ears', kind: 'systemOutput', name: 'Headphones', isDefault: true }, { deviceId: 'process:call', kind: 'processAudio', name: 'Meeting app', isDefault: false }] })
  await ready()
  expect(screen.getByRole('button', { name: '开始会议口译' })).toBeEnabled()
})

it('explains invalid routing when start is clicked instead of disabling the action', async () => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: { ...mode, uplinkEnabled: false, downlinkEnabled: false } } })
  await ready()
  const button = screen.getByRole('button', { name: '开始会议口译' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('请选择有效设备和不同语言，并至少开启一个方向。')
  expect(start).not.toHaveBeenCalled()
})

it('keeps start available without loaded gateway models and delegates model validation', async () => {
  models.catalog = { asr: [], mt: [], tts: [], ocr: [], llm: [] }
  await ready()
  const button = screen.getByRole('button', { name: '开始会议口译' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'auto' })))
})


it('uses the same processing names and changes the effective meeting mode', async () => {
  await ready()
  const processing = screen.getByRole('combobox', { name: '处理方式' })
  expect([...processing.querySelectorAll('option')].map(option => option.textContent)).toEqual(['跟随网关', '分步识别', '直接语音识别'])
  expect(screen.queryByText('口译流水线')).not.toBeInTheDocument()
  fireEvent.change(processing, { target: { value: 'cascade' } })
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'cascade' })))
})

it('selects application or device input in one field and passes the corresponding route', async () => {
  store.stores.models.setState({ devices: [...devices, { deviceId: 'process:call', kind: 'processAudio', name: 'Teams', isDefault: false }] })
  await ready()
  const input = screen.getAllByRole('combobox', { name: '输入声源' })[1]
  fireEvent.change(input, { target: { value: 'application:process:call' } })
  expect(input).toHaveValue('application:process:call')
  fireEvent.change(input, { target: { value: 'device:down' } })
  expect(input).toHaveValue('device:down')
  fireEvent.change(input, { target: { value: 'application:process:call' } })
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ downlinkSource: 'application', applicationId: 'process:call' })))
})

it('updates both language directions through the shared language pair and swap action', async () => {
  await ready()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '我的语言' }))
  await user.type(await screen.findByRole('combobox', { name: '搜索语言…' }), '日本語')
  await user.click(await screen.findByRole('option', { name: '日语 (日本語)' }))
  fireEvent.click(screen.getByRole('button', { name: '交换语言' }))
  expect(screen.getByRole('combobox', { name: '我的语言' })).toHaveTextContent('英语')
  expect(screen.getByRole('combobox', { name: '对方语言' })).toHaveTextContent('日语')
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ localLanguage: 'en', remoteLanguage: 'ja' })))
})
