import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NolaBridge } from '@/bridge'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { DEFAULT_MEETING_MODE, type MeetingAudioTestResult, type MeetingModeSnapshot } from '../../../shared/meeting-mode'
import * as store from '@/store'
import { MeetingModePage } from './MeetingModePage'
import type { SettingSelectProps } from '../settings/SettingsPage'

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
const testAudio = vi.fn()
const start = vi.fn()
let changed: (snapshot: MeetingModeSnapshot) => void
beforeEach(() => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: mode } })
  store.stores.models.setState({ devices: [...devices] })
  vi.spyOn(store.actions.models, 'probeAudioDevices').mockResolvedValue([...devices])
  vi.spyOn(store.actions.settings, 'updateSettings').mockResolvedValue()
  testAudio.mockReset()
  start.mockReset().mockResolvedValue({ state: 'running', passthroughActive: false })
  vi.spyOn(store, 'getBridge').mockReturnValue({ meetingMode: {
    snapshot: async () => ({ state: 'idle', passthroughActive: false }),
    onChanged: (callback: typeof changed) => { changed = callback; return () => undefined },
    testAudio,
    start,
    stop: async () => ({ state: 'idle', passthroughActive: false }),
  } } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); store.stores.settings.setState(initialSettings); store.stores.models.setState(initialModels) })
const ready = async (testDialog = true) => { render(<MeetingModePage />); await waitFor(() => expect(screen.getByRole('button', { name: '刷新设备' })).toBeEnabled()); if(testDialog) fireEvent.click(screen.getByTestId('meeting-audio-test')) }

it('tests the paired render endpoint and requires human confirmation for headphones', async () => {
  testAudio.mockImplementation(async request => ({ kind: request.kind, hasSignal: request.kind === 'cable', peak: 0.2, playbackSent: true }))
  await ready()
  fireEvent.click(screen.getAllByRole('button', { name: '测试线缆回环' })[1])
  await waitFor(() => expect(testAudio).toHaveBeenCalledWith({ kind: 'cable', deviceId: 'down-render', recordingDeviceId: 'down' }))
  await screen.findByText('已收到配对线缆的测试信号')
  fireEvent.click(screen.getByRole('button', { name: '播放测试音' }))
  await screen.findByText('测试音已发送，请确认是否听到。')
  expect(screen.queryByText('已确认听到')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '我听到了' }))
  expect(screen.getByText('已确认听到')).toBeInTheDocument()
  act(() => store.stores.models.setState({ devices: devices.filter(device => device.deviceId !== 'mic') }))
  expect(screen.queryByText('已确认听到')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '开始会议口译' }).every(button => button.hasAttribute('disabled'))).toBe(true)
})

it('shows a typed device failure and does not mark a silent microphone as passed', async () => {
  testAudio.mockResolvedValueOnce({ kind: 'microphone', hasSignal: false, peak: 0, playbackSent: true } satisfies MeetingAudioTestResult)
    .mockResolvedValueOnce({ kind: 'headphones', hasSignal: false, peak: 0, playbackSent: false, error: { key: 'meeting.audioOutputUnavailable' } } satisfies MeetingAudioTestResult)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: '录音并回放（2 秒）' }))
  await screen.findByText('未检测到声音。请检查静音、输入音量和麦克风权限后重试。')
  expect(testAudio).toHaveBeenCalledWith({ kind: 'microphone', deviceId: 'mic', playbackDeviceId: 'ears' })
  fireEvent.click(screen.getByRole('button', { name: '播放测试音' }))
  await screen.findByText('无法播放音频。请检查所选耳机或线缆的连接及占用状态。')
  expect(screen.queryByRole('button', { name: '我听到了' })).not.toBeInTheDocument()
})

it('renders a display-only scene with independent input and output activity', async () => {
  await ready(false)
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
  await ready(false)
  expect(screen.queryByRole('button', { name: '更多设置' })).not.toBeInTheDocument()
  expect(screen.queryByText('打开模型管理')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '快捷键设置' })).toHaveAttribute('href', '#/settings/shortcuts')
  expect(screen.getByRole('combobox', { name: '字幕范围' })).toBeVisible()
  expect(screen.getByRole('switch', { name: '说话人标签' })).toBeVisible()
  expect(screen.getByRole('slider', { name: '原声音量' })).toBeVisible()
  expect(screen.queryByRole('combobox', { name: '按住说原声' })).not.toBeInTheDocument()
})

it('ignores a test result from an outdated device selection', async () => {
  let finish!: (result: MeetingAudioTestResult) => void
  testAudio.mockReturnValue(new Promise<MeetingAudioTestResult>(resolve => { finish = resolve }))
  await ready()
  fireEvent.click(screen.getByRole('button', { name: '播放测试音' }))
  act(() => store.stores.models.setState({ devices: devices.filter(device => device.deviceId !== 'ears') }))
  await act(async () => finish({ kind: 'headphones', hasSignal: false, peak: 0, playbackSent: true }))
  expect(screen.queryByRole('button', { name: '我听到了' })).not.toBeInTheDocument()
})

it('supports receive-only application audio without a cable or microphone', async () => {
  const receive = { ...mode, uplinkEnabled: false, downlinkSource: 'application' as const, applicationId: 'process:call', microphoneId: '', uplinkOutputId: '', downlinkInputId: '' }
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: receive } })
  store.stores.models.setState({ devices: [{ deviceId: 'ears', kind: 'systemOutput', name: 'Headphones', isDefault: true }, { deviceId: 'process:call', kind: 'processAudio', name: 'Meeting app', isDefault: false }] })
  await ready(false)
  expect(screen.getByRole('button', { name: '开始会议口译' })).toBeEnabled()
  fireEvent.click(screen.getByTestId('meeting-audio-test'))
  expect(screen.queryByRole('button', { name: '测试线缆回环' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '录音并回放（2 秒）' })).not.toBeInTheDocument()
  expect(screen.getByText('先让会议应用播放声音，再运行检测。')).toBeVisible()
})

it('rejects disabling both directions', async () => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', meetingMode: { ...mode, uplinkEnabled: false, downlinkEnabled: false } } })
  await ready(false)
  expect(screen.getByRole('button', { name: '开始会议口译' })).toBeDisabled()
})


it('uses the same processing names and changes the effective meeting mode', async () => {
  await ready(false)
  const processing = screen.getByRole('combobox', { name: '处理方式' })
  expect([...processing.querySelectorAll('option')].map(option => option.textContent)).toEqual(['跟随网关', '分步识别', '直接语音识别'])
  expect(screen.queryByText('口译流水线')).not.toBeInTheDocument()
  fireEvent.change(processing, { target: { value: 'cascade' } })
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'cascade' })))
})

it('selects application or device input in one field and passes the corresponding route', async () => {
  store.stores.models.setState({ devices: [...devices, { deviceId: 'process:call', kind: 'processAudio', name: 'Teams', isDefault: false }] })
  await ready(false)
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
  await ready(false)
  fireEvent.click(screen.getByRole('button', { name: /^语言方向:/ }))
  fireEvent.change(await screen.findByRole('combobox', { name: '我的语言' }), { target: { value: 'ja' } })
  fireEvent.click(screen.getByRole('button', { name: '交换语言' }))
  expect(screen.getByRole('combobox', { name: '我的语言' })).toHaveValue('en')
  expect(screen.getByRole('combobox', { name: '对方语言' })).toHaveValue('ja')
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: '开始会议口译' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ localLanguage: 'en', remoteLanguage: 'ja' })))
})
