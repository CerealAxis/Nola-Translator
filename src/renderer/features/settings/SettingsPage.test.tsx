import userEvent from '@testing-library/user-event'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detachSettingsStore, settingsStore } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { CRISP_RUNTIME_VERSIONS, DEFAULT_ONNX_RUNTIME_ID, ONNX_RUNTIME_VERSIONS } from '../../../shared/compute'
import { ComputeTab } from './tabs/ComputeTab'
import { RuntimeComponents } from './tabs/RuntimeComponents'
import { GeneralTab } from './tabs/GeneralTab'
import { SettingsPage } from './SettingsPage'
import { MoreTab } from './tabs/MoreTab'
import { EngineDiagnostics, ResetSettingsGroup } from './tabs/AdvancedTab'

import { parseRoute, SETTINGS_TABS } from '@/routes'
import { StorageTab } from './tabs/StorageTab'
import { AudioTab } from './tabs/AudioTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { OverlayCaptionPreview } from '@/features/overlay/OverlayCaptionPreview'
import * as fontLoader from '@/theme/interface-font'
import * as notifications from '@/components/primitives/notify'
import * as store from '@/store'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); detachSettingsStore(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses the same caption preview scrim in settings and quick interpretation', () => {
  for (const overlay of [DEFAULT_SETTINGS.overlay, { ...DEFAULT_SETTINGS.overlay, colorScheme: 'light' as const, backgroundColor: '#eeeeee', backgroundOpacity: 0.5 }]) {
    const page = render(<><AppearanceTab settings={{ ...DEFAULT_SETTINGS, overlay }} /><OverlayCaptionPreview config={overlay} /></>)
    const previews = page.container.querySelectorAll<HTMLElement>('.nola-caption-preview')
    expect(previews[0].style.getPropertyValue('--preview-scrim-color')).toBeTruthy()
    expect(previews[0].style.getPropertyValue('--preview-scrim-color')).toBe(previews[1].style.getPropertyValue('--preview-scrim-color'))
    page.unmount()
  }
})

it('shows proxy scope switches only when a proxy address is configured', () => {
  const labels = ['将代理应用到 Pip', '将代理应用到模型下载', '将代理应用到组件下载']
  const { rerender } = render(<GeneralTab settings={DEFAULT_SETTINGS} />)

  for (const label of labels) expect(screen.queryByRole('switch', { name: label })).not.toBeInTheDocument()

  rerender(<GeneralTab settings={{ ...DEFAULT_SETTINGS, network: {
    ...DEFAULT_SETTINGS.network, proxyUrl: 'http://127.0.0.1:7890', proxyForPip: true,
  } }} />)
  for (const label of labels) expect(screen.getByRole('switch', { name: label })).toBeEnabled()
  expect(screen.getByRole('switch', { name: labels[0] })).toBeChecked()

  rerender(<GeneralTab settings={{ ...DEFAULT_SETTINGS, network: { ...DEFAULT_SETTINGS.network, proxyUrl: '  ' } }} />)
  for (const label of labels) expect(screen.queryByRole('switch', { name: label })).not.toBeInTheDocument()
})

it('reuses device results when the compute tab is opened again', () => {
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true, computeSnapshot: { devices: [], notes: [], torchVersion: '', activePlan: null } })
  const runtime = vi.spyOn(settingsActions, 'loadRuntimeComponents')
  const compute = vi.spyOn(settingsActions, 'refreshComputeDevices').mockResolvedValue()
  const first = render(<ComputeTab settings={DEFAULT_SETTINGS} />)
  first.unmount()
  render(<ComputeTab settings={DEFAULT_SETTINGS} />)
  expect(runtime).not.toHaveBeenCalled()
  expect(compute).not.toHaveBeenCalled()
  const buttons = screen.getAllByRole('button', { name: '重新检查' })
  expect(buttons.map(button => button.closest('.settings-group__heading')?.querySelector('h2')?.textContent))
    .toEqual([screen.getByRole('heading', { name: /计算/ }).textContent, '运行组件'])
  for (const button of buttons) expect(button.querySelector('svg')).toBeNull()
  expect(screen.queryByRole('heading', { name: '环境修复' })).not.toBeInTheDocument()
})

it('scrolls the main settings viewport to the inference engine section', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  window.history.replaceState(null, '', '#/settings/engine?component=engine')
  const main = document.createElement('main')
  main.className = 'nola-main'
  Object.assign(main, { scrollTop: 120, scrollTo: vi.fn() })
  document.body.append(main)
  const mainRect = new DOMRect(0, 80, 1000, 800)
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(mainRect)
  render(<RuntimeComponents />, { container: main })

  const section = document.getElementById('runtime-engines-section')
  expect(section).not.toBeNull()
  vi.spyOn(section!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 620, 900, 300))
  frames.forEach(frame => frame(0))

  expect(main.scrollTo).toHaveBeenCalledWith({ top: 660, behavior: 'smooth' })
})

it('defaults ONNX Runtime to DirectML and installs the chosen CPU version', async () => {
  const install = vi.spyOn(store.actions.settings, 'installRuntimeComponent').mockResolvedValue()
  const user = userEvent.setup()
  render(<RuntimeComponents />)

  await user.click(screen.getByRole('tab', { name: /ONNX Runtime/ }))
  const backend = screen.getByRole('combobox', { name: '执行后端' })
  expect(backend).toHaveTextContent('DirectML')
  const versions = screen.getByRole('combobox', { name: 'ONNX Runtime' })
  expect(versions).toHaveTextContent(ONNX_RUNTIME_VERSIONS.find(item => item.id === DEFAULT_ONNX_RUNTIME_ID)!.version)
  await user.click(backend)
  await user.click(await screen.findByRole('option', { name: 'CPU' }))
  await user.click(versions)
  const cpu = ONNX_RUNTIME_VERSIONS.filter(version => version.backend === 'cpu' && !version.legacy)
  expect(screen.getAllByRole('option').map(option => option.textContent?.trim())).toEqual(cpu.map(version => version.version))
  await user.click(await screen.findByRole('option', { name: cpu[1].version }))
  await user.click(screen.getByRole('button', { name: '安装' }))
  expect(install).toHaveBeenCalledWith(cpu[1].id, false)
})

it('shows the installed ONNX Runtime separately from the providers that passed detection', () => {
  const missing = { path: '', status: 'missing' as const, backend: '', version: '', gpuAvailable: false, reason: '' }
  settingsStore.setState({ runtimes: {
    packages: [], recipes: [], hardware: { adapters: [], nvidiaDriver: null, notes: [] },
    recommendation: { engineId: null, llamaId: null, reasons: [] }, operation: null, lastError: null, directory: '',
    local: { engine: missing, llama: missing, onnx: {
      ...missing, status: 'ready', backend: 'directml', version: '1.24.4', bundled: true,
      executionProviders: ['CPUExecutionProvider'],
    } },
  } })

  render(<ComputeTab settings={DEFAULT_SETTINGS} />)

  const labels = screen.getAllByText('ONNX Runtime', { exact: true })
  const rows = labels.map(label => label.closest('.settings-row')?.textContent).filter(Boolean)
  expect(rows).toContain('ONNX RuntimeCPU')
  expect(rows).toContain('ONNX RuntimeONNX Runtime 1.24.4 (DirectML)')
})

it('filters CrispASR versions by backend and installs the matching CPU package', async () => {
  const install = vi.spyOn(store.actions.settings, 'installRuntimeComponent').mockResolvedValue()
  const user = userEvent.setup()
  render(<RuntimeComponents />)

  await user.click(screen.getByRole('tab', { name: /CrispASR/ }))
  const backend = screen.getByRole('combobox', { name: '执行后端' })
  await user.click(backend)
  await user.click(await screen.findByRole('option', { name: 'CPU' }))
  const versions = screen.getByRole('combobox', { name: '安装 CrispASR' })
  const cpu = CRISP_RUNTIME_VERSIONS.filter(version => version.backend === 'cpu')
  await waitFor(() => expect(backend).toHaveTextContent('CPU'))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  versions.focus()
  await user.keyboard('{Enter}')
  expect((await screen.findAllByRole('option')).map(option => option.textContent?.trim())).toEqual(cpu.map(version => version.version))
  await user.click(await screen.findByRole('option', { name: cpu[1].version }))
  await user.click(screen.getByRole('button', { name: '安装' }))
  expect(install).toHaveBeenCalledWith(cpu[1].id, false)
})

it('shows a retry action instead of a spinner when saved settings cannot be read', () => {
  settingsStore.setState({ settings: null, loading: false, loadError: 'settings read failed' })
  render(<SettingsPage />)
  expect(screen.queryByText('加载中')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
})

it('starts a forced version check from Help and About', () => {
  const check = vi.spyOn(settingsActions, 'checkForAppUpdate').mockResolvedValue({
    currentVersion: '1.0.3', latestVersion: '1.1.0', updateAvailable: true,
    releaseName: 'Release 1.1.0', releaseNotes: '',
    releaseUrl: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.1.0',
  })

  render(<MoreTab />)
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

  expect(check).toHaveBeenCalledWith(true)
})

it('saves the main-window close preference independently of service settings', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  render(<GeneralTab settings={DEFAULT_SETTINGS} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '关闭窗口' }))
  await user.click(await screen.findByRole('option', { name: '退出应用' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ closeBehavior: 'quit' }))
})

it('saves density and restores appearance defaults without resetting subtitle settings', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  render(<GeneralTab settings={DEFAULT_SETTINGS} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '界面密度' }))
  await user.click(await screen.findByRole('option', { name: '宽松' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ appearance: { density: 'comfortable' } }))
  const restore = screen.getByRole('button', { name: '恢复默认' })
  expect(restore.closest('.settings-group__heading')).toContainElement(screen.getByRole('heading', { name: '外观' }))
  await user.click(restore)
  expect(update).toHaveBeenLastCalledWith({ appearance: DEFAULT_SETTINGS.appearance })
})

it('keeps the saved font when the selected font cannot load', async () => {
  vi.spyOn(fontLoader, 'loadInterfaceFont').mockRejectedValue(new Error('unavailable'))
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const notify = vi.spyOn(notifications, 'notifyError').mockReturnValue('font-error')
  render(<GeneralTab settings={DEFAULT_SETTINGS} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '界面字体' }))
  await user.click(await screen.findByRole('option', { name: 'Noto Sans SC' }))
  await waitFor(() => expect(notify).toHaveBeenCalled())
  expect(update).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox', { name: '界面字体' })).toHaveTextContent('系统默认字体')
})

it('shows the engine summary and keeps diagnostic copying in Help and About', () => {
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  const advanced = render(<EngineDiagnostics />)
  expect(screen.queryByRole('button', { name: '恢复出厂设置' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复制诊断信息' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '引擎' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '诊断明细' })).not.toBeInTheDocument()
  advanced.unmount()
  const reset = render(<ResetSettingsGroup />)
  expect(screen.getByRole('button', { name: '恢复出厂设置' })).toBeInTheDocument()
  reset.unmount()

  render(<MoreTab />)
  expect(screen.queryByRole('button', { name: '恢复出厂设置' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 主页' })).toHaveAttribute('href', 'https://github.com/CerealAxis')
  expect(screen.getByRole('link', { name: '赞助' })).toHaveAttribute('href', 'https://nolax.org/zh-CN/contributing/sponsor')
  expect(document.querySelector('a[href="https://github.com/sponsors/CerealAxis"]')).toBeNull()
  expect(screen.getByRole('link', { name: 'shadcn/ui 官网' })).toHaveAttribute('href', 'https://ui.shadcn.com/')
  expect(screen.getByRole('group', { name: '虚位以待' })).toBeInTheDocument()
  expect(screen.getByText('701699932')).toBeInTheDocument()
})

it('confirms copying diagnostics only after the store action succeeds', async () => {
  const copy = vi.spyOn(settingsActions, 'copyDiagnostics').mockResolvedValue()
  render(<MoreTab />)
  fireEvent.click(screen.getByRole('button', { name: '复制诊断信息' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument())
  expect(copy).toHaveBeenCalledOnce()
})


it('lists text processing as one settings category and removes retired routes', () => {
  expect(SETTINGS_TABS.filter(tab => tab !== 'developer')).toEqual([
    'general', 'audio', 'appearance', 'browser', 'shortcuts', 'engine', 'storage', 'text-processing', 'help',
  ])
  for (const tab of ['translation', 'compute', 'performance', 'advanced', 'more']) {
    expect(parseRoute(`#/settings/${tab}`).tab).toBe('general')
  }
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  window.history.replaceState(null, '', '#/settings/general')
  render(<SettingsPage />)
  expect(screen.getByRole('heading', { level: 1, name: '常规' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: '外观' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

it('keeps translation with audio and moves recording retention to data settings', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const audio = render(<AudioTab settings={DEFAULT_SETTINGS} />)
  expect(screen.getByRole('button', { name: '恢复默认' }).closest('.settings-group__heading'))
    .toContainElement(screen.getByRole('heading', { name: '语音分段' }))
  expect(screen.getByRole('switch', { name: '翻译未定稿字幕' })).toBeInTheDocument()
  expect(screen.queryByRole('switch', { name: '保存录音' })).not.toBeInTheDocument()
  audio.unmount()
  render(<StorageTab settings={DEFAULT_SETTINGS} />)
  const retention = screen.getByRole('switch', { name: '保存录音' })
  fireEvent.click(retention)
  await waitFor(() => expect(update).toHaveBeenCalledWith({ recording: { keepAudio: false } }))
  expect(screen.getByRole('button', { name: '恢复出厂设置' })).toBeInTheDocument()
})

it('rechecks the virtual sound card driver from the version row', async () => {
  const bridge = createIpcBridge()
  const version = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce('3.3.1.7').mockResolvedValueOnce('3.3.1.8')
  vi.spyOn(store, 'getBridge').mockReturnValue({ ...bridge, app: { ...bridge.app, getVirtualCableDriverVersion: version } })
  render(<AudioTab settings={DEFAULT_SETTINGS} />)
  const currentVersion = await screen.findByText('3.3.1.7')
  const check = screen.getByRole('button', { name: '重新检查' })
  expect(check.closest('.settings-row')).toContainElement(currentVersion)
  expect(check.textContent).toBe('')
  expect(check.querySelector('svg')).not.toBeNull()
  fireEvent.click(check)
  expect(await screen.findByText('3.3.1.8')).toBeVisible()
  expect(version).toHaveBeenCalledTimes(2)
})

it('places the shortcut reset in the page heading', () => {
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  window.history.replaceState(null, '', '#/settings/shortcuts')
  render(<SettingsPage />)
  const heading = screen.getByRole('heading', { name: '快捷键', level: 1 })
  expect(heading.closest('header')).toContainElement(screen.getByRole('button', { name: '全部恢复默认' }))
})

it('shows audio levels in separate rows and stops live input preview on request or navigation', async () => {
  const notify = vi.spyOn(notifications, 'notifyInfo').mockReturnValue('preview')
  const bridge = createIpcBridge()
  let signal!: AbortSignal
  let updateLevel!: (level: number) => void
  const preview = vi.spyOn(bridge.engine, 'previewAudioInput').mockImplementation((_source, onLevel, abort) => {
    signal = abort
    updateLevel = onLevel
    return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
  })
  vi.spyOn(store, 'getBridge').mockReturnValue(bridge)
  const view = render(<AudioTab settings={{ ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, audioSource: 'wasapi:microphone:mic' } }} />)
  const input = screen.getByRole('meter', { name: '输入等级' })
  const output = screen.getByRole('meter', { name: '输出等级' })
  const test = screen.getByRole('button', { name: '测试输入' })
  expect(test).toHaveTextContent(/^测试$/)
  expect(screen.getByRole('button', { name: '测试扬声器' })).toHaveTextContent(/^测试$/)
  expect(input.closest('.settings-row')).not.toBe(test.closest('.settings-row'))
  expect(output.closest('.settings-row')).not.toBe(screen.getByRole('button', { name: '测试扬声器' }).closest('.settings-row'))
  fireEvent.click(test)
  expect(notify).toHaveBeenCalledWith('请对着麦克风说话')
  expect(preview).toHaveBeenCalledWith({ kind: 'microphone', deviceId: 'wasapi:microphone:mic' }, expect.any(Function), expect.anything())
  act(() => updateLevel(37))
  expect(input).toHaveAttribute('aria-valuenow', '37')
  const stop = screen.getByRole('button', { name: '停止' })
  expect(stop).toHaveTextContent(/^停止$/)
  expect(stop).toHaveAttribute('data-variant', 'danger')
  expect(stop.className).toContain('bg-destructive/')
  await act(async () => { fireEvent.click(stop) })
  expect(signal.aborted).toBe(true)
  expect(input).toHaveAttribute('aria-valuenow', '0')
  view.rerender(<AudioTab settings={DEFAULT_SETTINGS} />)
  fireEvent.click(screen.getByRole('button', { name: '测试输入' }))
  expect(notify).toHaveBeenLastCalledWith('请播放声音')
  await act(async () => view.unmount())
  expect(signal.aborted).toBe(true)
})

it('loops the selected speaker test tone until the user stops it', async () => {
  const notify = vi.spyOn(notifications, 'notifyInfo').mockReturnValue('preview')
  const tone = { loop: false, start: vi.fn(), connect: vi.fn(node => node) }
  const close = vi.fn(async () => undefined)
  vi.stubGlobal('AudioContext', class {
    sampleRate = 8000
    destination = {}
    resume = async () => undefined
    close = close
    createBuffer = () => ({ getChannelData: () => new Float32Array(16000) })
    createBufferSource = () => tone
    createAnalyser = () => ({ fftSize: 32, connect: vi.fn(), getFloatTimeDomainData: (samples: Float32Array) => { samples[0] = 0.12 } })
  })
  render(<AudioTab settings={DEFAULT_SETTINGS} />)
  fireEvent.click(screen.getByRole('button', { name: '测试扬声器' }))
  await waitFor(() => expect(tone.start).toHaveBeenCalledOnce())
  expect(tone.loop).toBe(true)
  expect(close).not.toHaveBeenCalled()
  expect(notify).toHaveBeenCalledWith('请播放声音')
  expect(screen.getByRole('meter', { name: '输出等级' })).toHaveAttribute('aria-valuenow', '12')
  const stop = screen.getByRole('button', { name: '停止' })
  expect(stop).toHaveTextContent(/^停止$/)
  expect(stop).toHaveAttribute('data-variant', 'danger')
  expect(stop.className).toContain('bg-destructive/')
  fireEvent.click(stop)
  await waitFor(() => expect(screen.getByRole('meter', { name: '输出等级' })).toHaveAttribute('aria-valuenow', '0'))
  expect(close).toHaveBeenCalled()
})
