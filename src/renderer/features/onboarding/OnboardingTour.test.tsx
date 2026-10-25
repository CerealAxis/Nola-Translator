import { StrictMode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { sessionStore } from '@/store/sessionStore'
import { detachSettingsStore, settingsStore, startOnboarding } from '@/store/settingsStore'
import * as settingsActions from '@/store/settingsStore'
import { useRoute } from '@/routes'
import { OnboardingTour } from './OnboardingTour'

beforeEach(() => {
  window.location.hash = '#/'
  settingsStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), loaded: true, runtimeBusy: false, browser: null, captionService: 'idle' })
  sessionStore.setState({ status: 'idle', engineStatus: 'ready' })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('onboarding-tour__card') ? 400 : 180
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

function TutorialApp() {
  const { navigate } = useRoute()
  const [model, setModel] = useState<string | null>(null)
  return <div className="nola-app-shell">
    <div className="nola-app-body" />
    {Object.entries({ models: '#/models', workspace: '#/workspace', 'video-captions': '#/video-captions', 'model-gateway': '#/model-gateway' }).map(([id, path]) =>
      <Button key={id} data-onboarding={`nav-${id}`} onClick={() => navigate(path)}>{id}</Button>)}
    {/* The workbench opens a separate window, so its sidebar entry never navigates the main window. */}
    <Button data-onboarding="nav-workbench">workbench</Button>
    <Button data-onboarding="models-runtime-setup" onClick={() => navigate('#/settings/compute?component=engine')}>runtime-setup</Button>
    <div data-onboarding="models-active" />
    <div data-onboarding="models-tabs" />
    <div id="runtime-engines-section" />
    <Button data-onboarding="model-family-recognitionModel" onClick={() => setModel('recognitionModel')}>recognition-details</Button>
    {model ? <div data-onboarding="model-detail" data-model-kind={model}>
      <Button data-onboarding="model-detail-close" onClick={() => setModel(null)}>close-details</Button>
    </div> : null}
    <div data-onboarding="quick-settings" />
    <Button data-onboarding="open-overlay">open-overlay</Button>
    <div data-onboarding="caption-preview" />
    <div className="nola-video-service" />
    <div data-onboarding="gateway-service" />
    <div data-onboarding="gateway-capabilities" />
  </div>
}

function fixture() {
  return render(<StrictMode><TutorialApp /><OnboardingTour /></StrictMode>)
}

async function expectStep(id: string) {
  await waitFor(() => expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-step', id))
  await waitFor(() => expect(document.querySelector('.onboarding-tour__card')).toHaveAttribute('data-ready', 'true'))
}

async function start() {
  fixture()
  fireEvent.click(await screen.findByRole('button', { name: '开始指引' }))
  await expectStep('models')
}

async function skipSection() {
  fireEvent.click(screen.getByRole('button', { name: '跳过本节' }))
  await waitFor(() => expect(document.querySelector('.onboarding-tour__card[data-ready="true"], [data-onboarding="complete"]')).toBeInTheDocument())
}

it('preserves the original welcome content, starts at home, and saves the invitation once', async () => {
  window.location.hash = '#/settings/more'
  fixture()
  expect(await screen.findByRole('dialog', { name: 'Nola Translator 新手指引' })).toBeInTheDocument()
  expect(window.location.hash).toBe('#/')
  expect(screen.getByText(/给本项目点一个 Star/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '帮助文档' })).toHaveAttribute('href', 'https://nola.xaviermc.top')
  expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/CerealAxis/Nola-Translator')
  expect(settingsActions.markOnboardingSeen).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '稍后再看' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => { startOnboarding('welcome') })
  expect(await screen.findByRole('dialog', { name: 'Nola Translator 新手指引' })).toBeInTheDocument()
  expect(settingsActions.markOnboardingSeen).toHaveBeenCalledTimes(1)
})

it('walks the region-first tour, opening and closing the model dialog', async () => {
  await start()
  expect(document.querySelector('.nola-app-shell')).not.toHaveAttribute('inert')
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('runtime-setup')
  fireEvent.click(screen.getByRole('button', { name: 'runtime-setup' }))
  await expectStep('runtime-engines')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('runtime-return')
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('models-active')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('models-tabs')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('recognition-model')
  fireEvent.click(screen.getByRole('button', { name: 'recognition-details' }))
  await expectStep('models-detail')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('quick-nav')
  expect(document.querySelector('[data-onboarding="model-detail"]')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'workspace' }))
  await expectStep('quick')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('overlay')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('browser-nav')
  fireEvent.click(screen.getByRole('button', { name: 'video-captions' }))
  await expectStep('browser')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('workbench')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('gateway-nav')
  fireEvent.click(screen.getByRole('button', { name: 'model-gateway' }))
  await expectStep('gateway-service')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('gateway-capabilities')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  const completion = await screen.findByRole('dialog', { name: '恭喜你完成新手指引' })
  expect(completion).toHaveAttribute('data-slot', 'dialog-content')
  expect(document.querySelector('.onboarding-tour__card')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 主页' })).toHaveAttribute('href', 'https://github.com/CerealAxis/Nola-Translator')
  fireEvent.click(screen.getByRole('button', { name: '退出' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('supports Back, including returning from the model dialog to its opener', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('runtime-setup')
  fireEvent.click(screen.getByRole('button', { name: '上一步' }))
  await expectStep('models')
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('runtime-setup')
  fireEvent.click(screen.getByRole('button', { name: 'runtime-setup' }))
  await expectStep('runtime-engines')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('runtime-return')
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('models-active')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('models-tabs')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('recognition-model')
  fireEvent.click(screen.getByRole('button', { name: 'recognition-details' }))
  await expectStep('models-detail')
  fireEvent.click(screen.getByRole('button', { name: '上一步' }))
  await expectStep('recognition-model')
  expect(document.querySelector('[data-onboarding="model-detail"]')).not.toBeInTheDocument()
})

it('introduces the overlay entry without opening a window', async () => {
  await start()
  await skipSection()
  await skipSection()
  await expectStep('quick-nav')
  fireEvent.click(screen.getByRole('button', { name: 'workspace' }))
  await expectStep('quick')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('overlay')
  const open = vi.fn()
  screen.getByRole('button', { name: 'open-overlay' }).addEventListener('click', open)
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('browser-nav')
  expect(open).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#/workspace')
})

it('pauses for exploration, returns on request, and exits with Escape', async () => {
  await start()
  act(() => { window.location.hash = '#/records'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
  expect(await screen.findByText('指引已暂停，你可以自由探索。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '回到当前步骤' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(settingsStore.getState().settings?.onboardingSeen).toBe(true)
})

it('does not interrupt a running desktop or browser service', async () => {
  sessionStore.setState({ status: 'running' })
  const app = fixture()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  app.unmount()
  sessionStore.setState({ status: 'idle' })
  settingsStore.setState({ captionService: 'loading' })
  fixture()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
