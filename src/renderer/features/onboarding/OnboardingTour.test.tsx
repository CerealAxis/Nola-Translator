import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { sessionStore } from '@/store/sessionStore'
import { detachSettingsStore, settingsStore, startOnboarding } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { OnboardingTour } from './OnboardingTour'

beforeEach(() => {
  window.location.hash = '#/'
  settingsStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), loaded: true, runtimeBusy: false })
  sessionStore.setState({ status: 'idle', engineStatus: 'ready' })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('onboarding-tour__card') ? 320 : 180
    return { x: 80, y: 100, left: 80, top: 100, right: 80 + width, bottom: 280, width, height: 180, toJSON: () => ({}) }
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.spyOn(settingsActions, 'markOnboardingSeen').mockImplementation(async () => {
    settingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingSeen: true } })
  })
})

afterEach(() => {
  cleanup()
  detachSettingsStore()
  sessionStore.setState({ status: 'idle', engineStatus: 'idle' })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture() {
  return render(<StrictMode>
    <div className="nola-app-shell">
      <div className="nola-app-body" />
      {['home-quick', 'home-overlay', 'nav-video-captions', 'replay'].map(target => <div key={target} data-onboarding={target} />)}
      {['engine', 'llama'].map(kind => <div key={kind} data-onboarding={`runtime-${kind}`}><div className="settings-row" /><div className="settings-row" /></div>)}
      <div data-onboarding="recognition-settings"><div className="settings-group" /><div className="settings-group"><div className="settings-row" /></div></div>
      <div data-onboarding="translation-settings"><div className="settings-group"><div className="settings-row" /></div></div>
      <div data-onboarding="model-downloads"><div className="models-card" /></div>
    </div>
    <OnboardingTour />
  </StrictMode>)
}

it('welcomes first-run users before the tour and includes the repository link and Star request', async () => {
  fixture()
  expect(await screen.findByRole('dialog', { name: '欢迎使用 Nola Translator' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
  expect(screen.getByText('这对我们十分重要。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 链接' })).toHaveAttribute('href', 'https://github.com/CerealAxis/Nola-Translator')
  fireEvent.click(screen.getByRole('button', { name: '开始指引' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled())
  expect(screen.getByRole('dialog', { name: '快速同传' })).toBeInTheDocument()
  expect(settingsActions.markOnboardingSeen).toHaveBeenCalledTimes(1)
})

it('shows only once automatically, marks the first visible step, and supports manual replay', async () => {
  const first = fixture()
  await screen.findByRole('dialog', { name: '欢迎使用 Nola Translator' })
  expect(settingsActions.markOnboardingSeen).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '稍后再看' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  first.unmount()
  fixture()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => { startOnboarding('welcome') })
  expect(await screen.findByRole('dialog', { name: '欢迎使用 Nola Translator' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始指引' }))
  expect(await screen.findByRole('dialog', { name: '快速同传' })).toBeInTheDocument()
})

it('navigates through all nine steps and finishes at the replay entry', async () => {
  fixture()
  fireEvent.click(await screen.findByRole('button', { name: '开始指引' }))
  const titles = ['快速同传', '悬浮字幕', '浏览器字幕', '安装 PyTorch', '安装 llama.cpp', '配置语音识别', '配置翻译', '下载模型', '再次查看教程']
  const paths = ['#/', '#/', '#/', '#/settings/compute', '#/settings/compute', '#/settings/audio', '#/settings/translation', '#/models', '#/settings/more']
  for (let index = 0; index < titles.length; index++) {
    const button = await screen.findByRole('button', { name: index === 8 ? '完成' : '下一步' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.getByRole('dialog', { name: titles[index] })).toBeInTheDocument()
    expect(window.location.hash).toBe(paths[index])
    expect(screen.getByText(`${index + 1} / 9`)).toBeInTheDocument()
    fireEvent.click(button)
  }
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(settingsStore.getState().settings?.onboardingSeen).toBe(true)
})

it('keeps only Skip and Next, traps keyboard focus, and supports Escape without clearing the saved marker', async () => {
  fixture()
  fireEvent.click(await screen.findByRole('button', { name: '开始指引' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled())
  const next = screen.getByRole('button', { name: '下一步' })
  const skip = screen.getByRole('button', { name: '跳过指引' })
  expect(screen.getAllByRole('button')).toHaveLength(2)
  fireEvent.keyDown(next, { key: 'Tab' })
  expect(skip).toHaveFocus()
  fireEvent.keyDown(skip, { key: 'Tab', shiftKey: true })
  expect(next).toHaveFocus()
  fireEvent.click(next)
  expect(await screen.findByRole('dialog', { name: '悬浮字幕' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(settingsStore.getState().settings?.onboardingSeen).toBe(true)
})

it('does not interrupt an active session or wait forever for an unavailable page', async () => {
  sessionStore.setState({ status: 'running' })
  render(<OnboardingTour />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => { sessionStore.setState({ status: 'idle' }) })
  fireEvent.click(await screen.findByRole('button', { name: '开始指引' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled(), { timeout: 4000 })
  expect(screen.getByRole('status')).toHaveTextContent('这个页面暂时没有加载完成')
  expect(settingsActions.markOnboardingSeen).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '跳过指引' }))
})
