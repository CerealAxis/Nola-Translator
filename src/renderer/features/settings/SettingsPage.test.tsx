import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detachSettingsStore, settingsStore } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { ComputeTab } from './tabs/ComputeTab'
import { GeneralTab } from './tabs/GeneralTab'
import { SettingsPage } from './SettingsPage'
import { MoreTab } from './tabs/MoreTab'
import { AdvancedTab } from './tabs/AdvancedTab'

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

it('shows a retry action instead of a spinner when saved settings cannot be read', () => {
  settingsStore.setState({ settings: null, loading: false, error: 'settings read failed' })
  render(<SettingsPage />)
  expect(screen.queryByText('加载中')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
})

it('starts a forced version check from General settings', () => {
  const check = vi.spyOn(settingsActions, 'checkForAppUpdate').mockResolvedValue({
    currentVersion: '1.0.3', latestVersion: '1.1.0', updateAvailable: true,
    releaseName: 'Release 1.1.0', releaseNotes: '',
    releaseUrl: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.1.0',
  })

  render(<GeneralTab settings={DEFAULT_SETTINGS} />)
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

  expect(check).toHaveBeenCalledWith(true)
})

it('keeps reset in Advanced and moves licenses and feedback to More', async () => {
  vi.spyOn(settingsActions, 'readDiagnostics').mockResolvedValue({ version: '1.0.7' })
  settingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true })
  const advanced = render(<AdvancedTab settings={DEFAULT_SETTINGS} />)
  expect(screen.getByRole('button', { name: '恢复出厂设置' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复制诊断信息' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('version')).toBeInTheDocument())
  advanced.unmount()

  render(<MoreTab />)
  expect(screen.queryByRole('button', { name: '恢复出厂设置' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 主页' })).toHaveAttribute('href', 'https://github.com/CerealAxis')
  expect(screen.getByRole('link', { name: 'HeroUI 官网' })).toHaveAttribute('href', 'https://heroui.com/')
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
