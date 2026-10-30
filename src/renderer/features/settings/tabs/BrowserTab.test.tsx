import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserIntegrationInfo } from '../../../../shared/browser'
import * as toast from '@/components/primitives/notify'
import { settingsStore } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { BrowserTab } from './BrowserTab'

const chrome: BrowserIntegrationInfo = { browser: 'chrome', available: true, extensionStatus: 'installed', connected: true, enabled: true }
const edge: BrowserIntegrationInfo = { browser: 'edge', available: true, extensionStatus: 'notInstalled', connected: false, enabled: true }

beforeEach(() => {
  settingsStore.setState({ browser: { enabled: true, registered: true, captionServiceActive: false, sessionActive: false, connections: 1, browsers: [chrome, edge] }, browserBusy: false, browserError: null })
  vi.spyOn(settingsActions, 'browserConnectionAction').mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  settingsStore.setState({ browser: null, browserBusy: false, browserError: null })
})

it('shows separate real browser icons and installation states with per-browser actions', () => {
  const { container } = render(<BrowserTab />)
  const chromeRow = screen.getByRole('listitem', { name: 'Google Chrome' })
  const edgeRow = screen.getByRole('listitem', { name: 'Microsoft Edge' })
  expect(within(chromeRow).getByRole('status')).toHaveTextContent('已安装')
  expect(within(edgeRow).getByRole('status')).toHaveTextContent('未安装')
  const images = container.querySelectorAll('img')
  expect(images).toHaveLength(3)
  expect(images[0].getAttribute('src')).toContain('chrome.png')
  expect(images[1].getAttribute('src')).toContain('edge.png')
  expect(images[2].getAttribute('src')).toContain('firefox.svg')
  for (const image of images) {
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('alt', '')
  }
  fireEvent.click(within(edgeRow).getByRole('button', { name: '下载 Microsoft Edge 扩展' }))
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('download', undefined, 'edge')
  fireEvent.click(within(chromeRow).getByRole('button', { name: '下载 Google Chrome 扩展' }))
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('download', undefined, 'chrome')
  fireEvent.click(within(chromeRow).getByRole('switch', { name: '允许 Google Chrome 连接' }))
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('browserEnable', false, 'chrome')
  expect(within(edgeRow).queryByRole('switch')).not.toBeInTheDocument()
  expect(screen.queryByText('打开扩展 ZIP 所在文件夹')).not.toBeInTheDocument()
})

it('keeps Manage inside settings and dispatches browser-specific detail actions', () => {
  render(<BrowserTab />)
  fireEvent.click(screen.getByRole('button', { name: '管理 Google Chrome 扩展' }))
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Google Chrome' })).toBeInTheDocument()
  expect(screen.getByText('已连接')).toBeInTheDocument()
  expect(settingsActions.browserConnectionAction).not.toHaveBeenCalledWith('manage', undefined, 'chrome')
  fireEvent.click(screen.getByRole('button', { name: '管理浏览器扩展' }))
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('manage', undefined, 'chrome')
  fireEvent.click(screen.getByRole('button', { name: '下载扩展' }))
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('download', undefined, 'chrome')
  expect(screen.queryByRole('button', { name: '重新安装' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '返回浏览器列表' }))
  expect(screen.getByRole('list', { name: '浏览器扩展' })).toBeInTheDocument()
})

it('does not infer installation for unknown or disabled extensions', () => {
  settingsStore.setState({ browser: { enabled: true, registered: true, captionServiceActive: false, sessionActive: false, connections: 2, browsers: [{ ...chrome, extensionStatus: 'unknown' }, { ...edge, extensionStatus: 'disabled', enabled: false }] } })
  render(<BrowserTab />)
  const chromeRow = screen.getByRole('listitem', { name: 'Google Chrome' })
  const edgeRow = screen.getByRole('listitem', { name: 'Microsoft Edge' })
  expect(within(chromeRow).getByRole('status')).toHaveTextContent('无法确认扩展状态')
  expect(within(chromeRow).getByRole('button', { name: '下载 Google Chrome 扩展' })).toBeEnabled()
  expect(within(chromeRow).queryByRole('button', { name: '管理 Google Chrome 扩展' })).not.toBeInTheDocument()
  expect(within(chromeRow).queryByRole('switch')).not.toBeInTheDocument()
  expect(within(edgeRow).getByRole('status')).toHaveTextContent('已停用')
  const toggle = within(edgeRow).getByRole('switch', { name: '允许 Microsoft Edge 连接' })
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('browserEnable', true, 'edge')
  expect(screen.queryByText('已安装')).not.toBeInTheDocument()
})

it('updates the detail connection state and disables mutations while an action is pending', () => {
  render(<BrowserTab />)
  fireEvent.click(screen.getByRole('button', { name: '管理 Google Chrome 扩展' }))
  act(() => settingsStore.setState({ browser: { enabled: true, registered: true, captionServiceActive: false, sessionActive: false, connections: 0, browsers: [{ ...chrome, connected: false }, edge] }, browserBusy: true }))
  expect(screen.getByText('等待连接')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下载扩展' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '管理浏览器扩展' })).toBeDisabled()
  expect(screen.getByRole('switch', { name: '允许 Google Chrome 连接' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '返回浏览器列表' })).toBeEnabled()
})

it('keeps browser extension installation independent from Nola connection permission', () => {
  settingsStore.setState({ browser: { enabled: true, registered: true, captionServiceActive: false, sessionActive: false, connections: 0, browsers: [{ ...chrome, enabled: false }, { ...edge, extensionStatus: 'disabled', enabled: true }] } })
  render(<BrowserTab />)
  const chromeRow = screen.getByRole('listitem', { name: 'Google Chrome' })
  const edgeRow = screen.getByRole('listitem', { name: 'Microsoft Edge' })
  expect(within(chromeRow).getByRole('status')).toHaveTextContent('已安装')
  expect(within(chromeRow).getByRole('switch', { name: '允许 Google Chrome 连接' })).not.toBeChecked()
  expect(within(edgeRow).getByRole('status')).toHaveTextContent('已停用')
  const toggle = within(edgeRow).getByRole('switch', { name: '允许 Microsoft Edge 连接' })
  expect(toggle).toBeChecked()
  fireEvent.click(toggle)
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('browserEnable', false, 'edge')
  expect(within(edgeRow).getByRole('status')).toHaveTextContent('已停用')
})

it('shows detecting only before the first status result', () => {
  settingsStore.setState({ browser: null })
  render(<BrowserTab />)
  expect(within(screen.getByRole('list')).getAllByRole('status')).toHaveLength(3)
  expect(screen.getAllByText('正在检测')).toHaveLength(3)
  act(() => settingsStore.setState({ browser: { enabled: true, registered: true, captionServiceActive: false, sessionActive: false, connections: 0, browsers: [{ ...chrome, extensionStatus: 'unknown' }, { ...edge, extensionStatus: 'unknown' }] } }))
  expect(screen.queryByText('正在检测')).not.toBeInTheDocument()
  expect(screen.getAllByText('无法确认扩展状态')).toHaveLength(3)
})

it('offers a real retry after a browser extension download fails without showing internal details', async () => {
  const notifyRetryableFailure = vi.spyOn(toast, 'notifyRetryableFailure').mockReturnValue('toast')
  vi.mocked(settingsActions.browserConnectionAction).mockImplementation(async action => {
    if (action === 'download') {
      settingsStore.setState({ browserError: null })
      await new Promise(resolve => setTimeout(resolve, 0))
      settingsStore.setState({ browserError: 'ENOENT: C:\\private\\extension.zip' })
    }
  })
  render(<BrowserTab />)
  vi.mocked(settingsActions.browserConnectionAction).mockClear()
  const edgeRow = screen.getByRole('listitem', { name: 'Microsoft Edge' })

  await act(async () => { fireEvent.click(within(edgeRow).getByRole('button', { name: '下载 Microsoft Edge 扩展' })) })
  await waitFor(() => expect(notifyRetryableFailure).toHaveBeenCalledOnce())
  expect(notifyRetryableFailure).toHaveBeenCalledWith('浏览器扩展下载失败', expect.objectContaining({
    description: '请检查网络后重试；仍失败可从项目发布页获取。',
    action: expect.objectContaining({ label: '重试下载' }),
  }))
  expect(notifyRetryableFailure.mock.calls[0]?.[0]).not.toContain('ENOENT')

  const action = notifyRetryableFailure.mock.calls[0]?.[1]?.action
  await act(async () => { action?.onPress() })
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledTimes(2)
  expect(settingsActions.browserConnectionAction).toHaveBeenCalledWith('download', undefined, 'edge')
  await waitFor(() => expect(notifyRetryableFailure).toHaveBeenCalledTimes(2))
})
