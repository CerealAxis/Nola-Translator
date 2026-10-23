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
  const [active, setActive] = useState('engine')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  return <div className="nola-app-shell">
    <div className="nola-app-body" />
    {Object.entries({ settings: '#/settings/appearance', models: '#/models', workspace: '#/workspace', overlay: '#/overlay', 'video-captions': '#/video-captions' }).map(([id, path]) =>
      <Button key={id} data-onboarding={`nav-${id}`} onClick={() => navigate(path)}>{id}</Button>)}
    {['compute', 'audio', 'translation'].map(tab => <Button key={tab} data-onboarding={`settings-${tab}`} onClick={() => navigate(`#/settings/${tab}`)}>{tab}</Button>)}
    {['engine', 'llama', 'crisp'].map(kind => <div key={kind}>
      <Button data-onboarding={`runtime-${kind}`} aria-pressed={active === kind} onClick={() => setActive(kind)}>{kind}</Button>
      <div id={`runtime-${kind}`} data-onboarding={`runtime-version-${kind}`} hidden={active !== kind}><Button aria-expanded={expanded === kind} onClick={() => setExpanded(expanded ? null : kind)}>{`${kind}-versions`}</Button></div>
    </div>)}
    {['recognition', 'translation'].map(kind => <Button key={kind} data-onboarding={`model-family-${kind}Model`} onClick={() => setModel(`${kind}Model`)}>{`${kind}-details`}</Button>)}
    {model ? <div data-onboarding="model-detail" data-model-kind={model}>
      <Button data-onboarding="model-detail-close" onClick={() => setModel(null)}>close-details</Button>
      {['engine', 'scale'].map(choice => <div key={choice} data-onboarding={`model-${choice}`}><Button onClick={() => undefined}>{`choose-${choice}`}</Button></div>)}
      <div data-onboarding="model-version"><Button aria-expanded={expanded === 'model'} onClick={() => setExpanded(expanded ? null : 'model')}>model-versions</Button></div>
      <div data-onboarding="model-sources" />
    </div> : null}
    {['recognition-provider', 'audio-source', 'translation-provider'].map(id => <div key={id} data-onboarding={id}><Button aria-expanded={expanded === id} onClick={() => setExpanded(expanded ? null : id)}>{id}</Button></div>)}
    <div data-onboarding="recognition-model" /><div data-onboarding="translation-model" />
    <div data-onboarding="quick-settings" />
    <div data-slot="workspace"><div className="nola-workspace-toolbar" /></div>
    <div className="nola-overlay-page"><div className="nola-page-heading" /></div>
    <Button data-onboarding="open-overlay">open-overlay</Button>
    <div data-onboarding="caption-preview" />
    <div className="nola-video-service" />
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
  await expectStep('settings')
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

it('waits for real navigation and list inspection, keeps controls interactive, and supports Back', async () => {
  await start()
  expect(document.querySelector('.nola-app-shell')).not.toHaveAttribute('inert')
  expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'settings' }))
  await expectStep('compute')
  fireEvent.click(screen.getByRole('button', { name: 'compute' }))
  await expectStep('torch')
  fireEvent.click(screen.getByRole('button', { name: 'engine-versions' }))
  await waitFor(() => expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-inspecting', 'true'))
  expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-step', 'torch')
  fireEvent.click(screen.getByRole('button', { name: 'engine-versions' }))
  await expectStep('llama-tab')
  fireEvent.click(screen.getByRole('button', { name: 'llama' }))
  await expectStep('llama')
  fireEvent.click(screen.getByRole('button', { name: '上一步' }))
  await expectStep('llama-tab')
})

it('teaches real model details and allows skipping downloads without pretending setup is complete', async () => {
  await start()
  await skipSection()
  await expectStep('models')
  fireEvent.click(screen.getByRole('button', { name: 'models' }))
  await expectStep('recognition-model')
  fireEvent.click(screen.getByRole('button', { name: 'recognition-details' }))
  await expectStep('model-engine')
  fireEvent.click(screen.getByRole('button', { name: 'choose-engine' }))
  await expectStep('model-scale')
  fireEvent.click(screen.getByRole('button', { name: 'choose-scale' }))
  await expectStep('model-version')
  await skipSection()
  await expectStep('service-settings')
  expect(document.querySelector('[data-onboarding="model-detail"]')).not.toBeInTheDocument()
  await skipSection()
  await expectStep('quick-nav')
  await skipSection()
  const completion = await screen.findByRole('dialog', { name: '恭喜你完成新手指引' })
  expect(completion).toHaveAttribute('data-slot', 'dialog-content')
  expect(document.querySelector('.onboarding-tour__card')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'GitHub 主页' })).toHaveAttribute('href', 'https://github.com/CerealAxis/Nola-Translator')
  expect(screen.queryByText('本地模型或加载器待准备')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '退出' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('introduces the current caption entry without opening a window or navigating to a removed sidebar entry', async () => {
  await start()
  await skipSection()
  await skipSection()
  await skipSection()
  await expectStep('quick-nav')
  fireEvent.click(screen.getByRole('button', { name: 'workspace' }))
  await expectStep('quick')
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('overlay-nav')
  const open = vi.fn()
  screen.getByRole('button', { name: 'open-overlay' }).addEventListener('click', open)
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await expectStep('overlay')
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
