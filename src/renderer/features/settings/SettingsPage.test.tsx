import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detachSettingsStore, settingsStore } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { ComputeTab } from './tabs/ComputeTab'
import { SettingsPage } from './SettingsPage'

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
