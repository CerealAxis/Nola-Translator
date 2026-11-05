import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detachSettingsStore, settingsStore } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { ComputeTab } from './tabs/ComputeTab'
import { RuntimeComponents } from './tabs/RuntimeComponents'
import { GeneralTab } from './tabs/GeneralTab'
import { SettingsPage } from './SettingsPage'
import { MoreTab } from './tabs/MoreTab'
import { EngineDiagnostics, ResetSettingsGroup } from './tabs/AdvancedTab'

import { parseRoute, SETTINGS_TABS } from '@/routes'
import { StorageTab } from './tabs/StorageTab'
import { AudioTab } from './tabs/AudioTab'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); detachSettingsStore(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('reuses device results when the compute tab is opened again', () => {
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true, computeSnapshot: { devices: [], notes: [], torchVersion: '', activePlan: null } })
  const runtime = vi.spyOn(settingsActions, 'loadRuntimeComponents')
  const compute = vi.spyOn(settingsActions, 'refreshComputeDevices').mockResolvedValue()
  const first = render(<ComputeTab settings={DEFAULT_SETTINGS} />)
  first.unmount()
  render(<ComputeTab settings={DEFAULT_SETTINGS} />)
  expect(runtime).not.toHaveBeenCalled()
  expect(compute).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '刷新设备' })).toBeInTheDocument()
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

it('separates engine diagnostics, data reset and help content', async () => {
  vi.spyOn(settingsActions, 'readDiagnostics').mockResolvedValue({ version: '1.0.7' })
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  const advanced = render(<EngineDiagnostics />)
  expect(screen.queryByRole('button', { name: '恢复出厂设置' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复制诊断信息' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('version')).toBeInTheDocument())
  advanced.unmount()
  const reset = render(<ResetSettingsGroup />)
  expect(screen.getByRole('button', { name: '恢复出厂设置' })).toBeInTheDocument()
  reset.unmount()

  render(<MoreTab />)
  expect(screen.queryByRole('button', { name: '恢复出厂设置' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 主页' })).toHaveAttribute('href', 'https://github.com/CerealAxis')
  expect(screen.getByRole('link', { name: '赞助' })).toHaveAttribute('href', 'https://nola.xaviermc.top/zh-CN/contributing/sponsor')
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


it('lists the eight user settings in the approved order and removes retired routes', () => {
  expect(SETTINGS_TABS.filter(tab => tab !== 'developer')).toEqual([
    'general', 'audio', 'appearance', 'browser', 'shortcuts', 'engine', 'storage', 'help',
  ])
  for (const tab of ['translation', 'compute', 'performance', 'advanced', 'more']) {
    expect(parseRoute(`#/settings/${tab}`).tab).toBe('general')
  }
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  window.history.replaceState(null, '', '#/settings/general')
  render(<SettingsPage />)
  const tabs = screen.getAllByRole('tab').filter(tab => tab.closest('.settings-nav'))
  expect(tabs.slice(0, 8).map(tab => tab.textContent)).toEqual([
    '常规', '音频与翻译', '悬浮字幕', '浏览器插件', '快捷键', '引擎与性能', '数据与存储', '帮助与关于',
  ])
})

it('keeps translation with audio and moves recording retention to data settings', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const audio = render(<AudioTab settings={DEFAULT_SETTINGS} />)
  expect(screen.getByRole('switch', { name: '翻译未定稿字幕' })).toBeInTheDocument()
  expect(screen.queryByRole('switch', { name: '保存录音' })).not.toBeInTheDocument()
  audio.unmount()
  render(<StorageTab settings={DEFAULT_SETTINGS} />)
  const retention = screen.getByRole('switch', { name: '保存录音' })
  fireEvent.click(retention)
  await waitFor(() => expect(update).toHaveBeenCalledWith({ recording: { keepAudio: false } }))
  expect(screen.getByRole('button', { name: '恢复出厂设置' })).toBeInTheDocument()
})
