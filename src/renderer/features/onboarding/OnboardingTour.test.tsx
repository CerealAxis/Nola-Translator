import { StrictMode, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { sessionStore } from '@/store/sessionStore'
import { attachSettingsStore, detachSettingsStore, mergeSettings, settingsStore, startOnboarding } from '@/store/settingsStore'
import * as appStore from '@/store'
import { useRoute } from '@/routes'
import { OnboardingTour } from './OnboardingTour'
import { TOUR_STEPS } from './tourSteps'
import type { OnboardingCardAction } from '../../../shared/onboarding-card'

let saved = structuredClone(DEFAULT_SETTINGS)
let rejectWrite = false
const harmfulAction = vi.fn()
beforeEach(() => {
  window.location.hash = '#/'
  saved = structuredClone(DEFAULT_SETTINGS)
  rejectWrite = false
  harmfulAction.mockClear()
  const bridge = createIpcBridge()
  vi.spyOn(bridge.settings, 'update').mockImplementation(async patch => {
    if (rejectWrite) throw new Error('disk unavailable')
    saved = mergeSettings(saved, patch)
    return saved
  })
  attachSettingsStore(bridge, false)
  settingsStore.setState({ settings: saved, loaded: true, runtimeBusy: false, browser: null, captionService: 'idle' })
  appStore.stores.models.setState({ loaded: true, loading: false, error: null })
  sessionStore.setState({ status: 'idle', engineStatus: 'ready' })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('onboarding-tour__card') ? 400 : 180
    return { x: 80, y: 100, left: 80, top: 100, right: 80 + width, bottom: 280, width, height: 180, toJSON: () => ({}) }
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
  const { path, navigate } = useRoute()
  const [category, setCategory] = useState('LLM')
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const targets = [...new Set(TOUR_STEPS.filter(step => step.path === path && !step.sourceCategory)
    .map(step => step.target.match(/"(.+)"/)![1]))]
  return <div className="nola-app-shell">
    <div className="nola-app-body" />
    {targets.filter(target => target !== 'models-category').map(target => <div key={target} data-onboarding={target}>
      {target === 'home-models' ? <button onClick={() => navigate('#/models')}>manage</button> : null}
      <button onClick={harmfulAction}>start service</button>
    </div>)}
    {path === '#/models' && <>
      <button data-onboarding="models-category" data-category={category} onClick={() => setCategoriesOpen(true)}>{category}</button>
      {categoriesOpen && ['ASR', 'MT'].map(value => <button key={value} data-onboarding={`models-category-${value}`} onClick={() => {
        setCategory(value)
        setCategoriesOpen(false)
      }}>{value}</button>)}
      <button data-onboarding="models-add-source" onClick={() => setPickerOpen(true)}>add</button>
    </>}
    {pickerOpen ? <div data-onboarding="models-source-picker">
      <button data-onboarding="models-source-picker-close" onClick={() => setPickerOpen(false)}>close</button>
      <button onClick={harmfulAction}>save source</button>
    </div> : null}
  </div>
}
function fixture() { return render(<StrictMode><TutorialApp /><OnboardingTour /></StrictMode>) }
async function expectStep(id: string) {
  await waitFor(() => {
    expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-step', id)
    expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-busy', 'false')
  })
}
async function start() {
  fixture()
  fireEvent.click(await screen.findByRole('button', { name: '开始了解' }))
  await expectStep('H1')
}
async function next() { fireEvent.click(screen.getByRole('button', { name: /下一步|完成|重新定位/ })) }

it('requires first-run viewing and shows only a title, description, count and Next', async () => {
  await start()
  expect(screen.queryByRole('button', { name: /上一步|退出/ })).not.toBeInTheDocument()
  expect(document.querySelector('.onboarding-tour__chapters, .onboarding-tour__meter')).toBeNull()
  expect(document.querySelector('.onboarding-tour__progress')).toHaveTextContent(`1 / ${TOUR_STEPS.length}`)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(document.querySelector('.onboarding-tour')).toBeInTheDocument()
})

it('demonstrates every scene with Next alone without downloads, recording or service starts', async () => {
  await start()
  for (const step of TOUR_STEPS) {
    await expectStep(step.id)
    expect(window.location.hash).toBe(step.path)
    expect(document.querySelector(step.target)).toBeInTheDocument()
    if (step.sourceCategory) expect(document.querySelector('[data-onboarding="models-category"]')).toHaveAttribute('data-category', step.sourceCategory)
    else expect(document.querySelector('[data-onboarding="models-source-picker"]')).toBeNull()
    await next()
  }
  await waitFor(() => expect(saved.onboardingCompletedVersion).toBe(2))
  expect(document.querySelector('.onboarding-tour')).toBeNull()
  expect(window.location.hash).toBe('#/')
  expect(harmfulAction).not.toHaveBeenCalled()
})

it('resumes a retired file-selection lesson at the speech recognition source picker', async () => {
  saved = { ...saved, onboardingSeen: true, onboardingVersion: 2, onboardingStep: 'T3' }
  settingsStore.setState({ settings: saved })
  fixture()
  await expectStep('H2')
  expect(window.location.hash).toBe('#/models')
  expect(document.querySelector('[data-onboarding="models-source-picker"]')).toBeInTheDocument()
})

it('closes the source picker when a replay exits', async () => {
  saved = { ...saved, onboardingSeen: true, onboardingCompletedVersion: 2, onboardingStep: 'Z0' }
  settingsStore.setState({ settings: saved })
  fixture()
  act(() => startOnboarding('tour'))
  await expectStep('H1')
  for (const step of TOUR_STEPS.slice(0, 3)) { await expectStep(step.id); await next() }
  await expectStep('H2')
  fireEvent.click(screen.getByRole('button', { name: '退出教程' }))
  await waitFor(() => expect(document.querySelector('[data-onboarding="models-source-picker"]')).toBeNull())
  expect(saved.onboardingStep).toBe('Z0')
})

it('ignores repeated native-card actions during a transition and stale previous-step messages', async () => {
  let receive!: (message: OnboardingCardAction) => void
  const sendState = vi.fn()
  const show = vi.fn()
  const hide = vi.fn()
  vi.spyOn(appStore, 'getBridge').mockReturnValue({ ...createIpcBridge(), onboardingCard: {
    available: () => true, show, hide, sendState, sendAction: vi.fn(), sendRect: vi.fn(), sendHit: vi.fn(),
    onState: () => () => {}, onPlacement: () => () => {}, onRect: () => () => {},
    onAction: listener => { receive = listener; return () => {} },
  } })
  await start()
  act(() => { receive({ step: 'H1', action: 'next' }); receive({ step: 'H1', action: 'next' }) })
  await expectStep('M1')
  act(() => receive({ step: 'H1', action: 'next' }))
  expect(document.querySelector('.onboarding-tour')).toHaveAttribute('data-step', 'M1')
  act(() => receive({ step: 'M1', action: 'next' }))
  await expectStep('U6')
  act(() => receive({ step: 'U6', action: 'next' }))
  await expectStep('H2')
  act(() => receive({ step: 'H2', action: 'next' }))
  await expectStep('M2')
  expect(sendState.mock.lastCall?.[0]).toMatchObject({ step: 'M2', busy: false, missing: false })
  // StrictMode replays setup once; moving between scenes must keep the native window alive.
  expect(show.mock.calls.length - hide.mock.calls.length).toBe(1)
})
