import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, Card, Link, Modal, Spinner, toast } from '@heroui/react'
import { Github } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { DictionaryKey } from '@/i18n/zh-CN'
import { useRoute } from '@/routes'
import { actions, stores, useStore } from '@/store'
import { placeTourCard, spotlightPath } from './tourLayout'
import type { TourRect, TourSize } from './tourLayout'
import nolaLogoUrl from '../../../../assets/brand/nola-logo.svg'
import './onboarding.css'

interface TourStep {
  path: string
  target: string
  title: DictionaryKey
  body: DictionaryKey
}

const STEPS: readonly TourStep[] = [
  { path: '#/', target: '[data-onboarding="home-quick"]', title: 'onboarding.quickTitle', body: 'onboarding.quickBody' },
  { path: '#/', target: '[data-onboarding="home-overlay"]', title: 'onboarding.overlayTitle', body: 'onboarding.overlayBody' },
  { path: '#/', target: '[data-onboarding="nav-video-captions"]', title: 'onboarding.browserTitle', body: 'onboarding.browserBody' },
  { path: '#/settings/compute', target: '[data-onboarding="runtime-engine"] .settings-row:nth-child(2)', title: 'onboarding.torchTitle', body: 'onboarding.torchBody' },
  { path: '#/settings/compute', target: '[data-onboarding="runtime-llama"] .settings-row:nth-child(2)', title: 'onboarding.llamaTitle', body: 'onboarding.llamaBody' },
  { path: '#/settings/audio', target: '[data-onboarding="recognition-settings"] .settings-group:nth-child(2) .settings-row', title: 'onboarding.recognitionTitle', body: 'onboarding.recognitionBody' },
  { path: '#/settings/translation', target: '[data-onboarding="translation-settings"] .settings-group .settings-row', title: 'onboarding.translationTitle', body: 'onboarding.translationBody' },
  { path: '#/models', target: '[data-onboarding="model-downloads"] [data-onboarding="download-model"], [data-onboarding="model-downloads"] .models-card', title: 'onboarding.modelsTitle', body: 'onboarding.modelsBody' },
  { path: '#/settings/more', target: '[data-onboarding="replay"]', title: 'onboarding.replayTitle', body: 'onboarding.replayBody' },
]

export interface OnboardingTourProps {
  /** Website demos can opt into manual presentation without writing a first-run marker. */
  autoStart?: boolean
}

export function OnboardingTour({ autoStart = true }: OnboardingTourProps) {
  const { settings, loaded, onboardingActive, onboardingWelcome, onboardingRun, runtimeBusy } = useStore(stores.settings, state => state)
  const { status, engineStatus } = useStore(stores.session, state => state)
  const busy = ['starting', 'running', 'paused', 'stopping'].includes(status) || runtimeBusy
  useEffect(() => {
    if (autoStart && loaded && settings && !busy && (engineStatus === 'ready' || engineStatus === 'failed')) {
      actions.settings.startOnboarding('automatic')
    }
  }, [autoStart, loaded, settings, busy, engineStatus])

  if (!onboardingActive) return null
  if (onboardingWelcome) return <WelcomeDialog />
  return <TourSteps key={onboardingRun} />
}

function WelcomeDialog() {
  const { t } = useI18n()
  const marked = useRef(false)
  const markPresented = useCallback((dialog: HTMLElement | null) => {
    // Remember the invitation itself, including when the user chooses to skip the tour.
    if (!dialog || !dialog.isConnected || marked.current) return
    marked.current = true
    void actions.settings.markOnboardingSeen().catch(() => toast.warning(t('onboarding.saveFailed')))
  }, [t])

  return <Modal.Backdrop isOpen onOpenChange={open => { if (!open) actions.settings.stopOnboarding() }} className="z-overlay" isDismissable={false}>
      <Modal.Container size="md" placement="center">
        <Modal.Dialog className="onboarding-welcome">
          <Modal.Header>
            <img ref={markPresented} className="onboarding-welcome__logo" src={nolaLogoUrl} alt="" aria-hidden="true" />
            <Modal.Heading>{t('onboarding.welcomeTitle')}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>{t('onboarding.welcomeIntro')}</p>
            <p>{t('onboarding.welcomeHint')}</p>
            <div className="onboarding-welcome__support">
              <p>{t('onboarding.starRequest')}</p>
              <p>{t('onboarding.starImportance')}</p>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" size="sm" onPress={() => actions.settings.stopOnboarding()}>{t('onboarding.later')}</Button>
            <Button variant="primary" size="sm" autoFocus onPress={() => actions.settings.beginOnboarding()}>{t('onboarding.begin')}</Button>
            <Link className="onboarding-welcome__github button button--sm button--tertiary" href="https://github.com/CerealAxis/Nola-Translator" target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />{t('onboarding.github')}
            </Link>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
  </Modal.Backdrop>
}

interface TourGeometry {
  target: TourRect | null
  tip: { x: number; y: number }
  viewport: TourSize
  radius: number
}

function TourSteps() {
  const { t } = useI18n()
  const alreadySeen = useStore(stores.settings, state => state.settings?.onboardingSeen === true)
  const { navigate, path } = useRoute()
  const [index, setIndex] = useState(0)
  const [geometry, setGeometry] = useState<TourGeometry | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const marked = useRef(false)
  const step = STEPS[index]!

  useLayoutEffect(() => { navigate(step.path) }, [navigate, step.path])

  useLayoutEffect(() => {
    setGeometry(null)
    setUnavailable(false)
    if (path !== step.path) return
    let frame = 0
    let target: HTMLElement | null = null
    let alignmentKey = ''
    let alive = true
    const rootStyle = getComputedStyle(document.documentElement)
    const space = parseFloat(rootStyle.getPropertyValue('--space-1')) || 8
    const gap = space * 2
    const radius = parseFloat(rootStyle.getPropertyValue('--radius-xl')) || space * 2
    const measure = () => {
      if (!alive || !cardRef.current) return
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      // Selectors are ordered fallbacks, so installed catalogs can still explain downloads.
      const found = step.target.split(',').map(selector => document.querySelector<HTMLElement>(selector.trim())).find(element => element !== null)
      if (found) {
        const cardWidth = cardRef.current.getBoundingClientRect().width
        const alignTop = found.getBoundingClientRect().width + cardWidth + gap * 3 > viewport.width
        const nextAlignment = `${viewport.width}:${viewport.height}:${alignTop}`
        if (target !== found || alignmentKey !== nextAlignment) {
          target = found
          alignmentKey = nextAlignment
          // Wide controls need room below them for the tip on the minimum window size.
          target.scrollIntoView({ block: alignTop ? 'start' : 'center', inline: 'nearest', behavior: 'instant' })
          if (alignTop) {
            const scroller = target.closest<HTMLElement>('.nola-main')
            if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollTop - gap)
          }
          resize.observe(target)
        }
      }
      const topInset = document.querySelector('.nola-app-body')?.getBoundingClientRect().top ?? gap * 4
      const rect = target?.getBoundingClientRect()
      let spotlight: TourRect | null = null
      if (rect && rect.width > 0 && rect.height > 0) {
        const x = Math.max(space, rect.left - space)
        const y = Math.max(topInset + space, rect.top - space)
        const right = Math.min(viewport.width - space, rect.right + space)
        const bottom = Math.min(viewport.height - space, rect.bottom + space)
        if (right > x && bottom > y) spotlight = { x, y, width: right - x, height: bottom - y }
      }
      const card = cardRef.current.getBoundingClientRect()
      const next: TourGeometry = { target: spotlight, viewport, radius, tip: placeTourCard(spotlight, card, viewport, gap, topInset) }
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(refresh)
    resize.observe(cardRef.current!)
    const mutation = new MutationObserver(refresh)
    const shell = document.querySelector('.nola-app-shell')
    if (shell) mutation.observe(shell, { childList: true, subtree: true })
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const timeout = window.setTimeout(() => { setUnavailable(true); refresh() }, 2500)
    refresh()
    return () => {
      alive = false
      clearTimeout(timeout)
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [step, path])

  const ready = !!geometry?.target || unavailable
  useEffect(() => {
    if (!geometry) return
    if (ready) primaryRef.current?.focus({ preventScroll: true })
    else cardRef.current?.focus({ preventScroll: true })
    if (!marked.current && geometry?.target) {
      marked.current = true
      if (!alreadySeen) void actions.settings.markOnboardingSeen().catch(() => toast.warning(t('onboarding.saveFailed')))
    }
  }, [ready, geometry, alreadySeen, t])

  useEffect(() => {
    const previousFocus = document.activeElement
    const shell = document.querySelector<HTMLElement>('.nola-app-shell')
    const previousInert = shell?.inert ?? false
    // The spotlight is informational: background controls must not start installs or sessions.
    if (shell) shell.inert = true
    return () => {
      if (shell) shell.inert = previousInert
      const restoreFocus = previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected
        ? previousFocus : document.querySelector<HTMLElement>('[data-onboarding="replay"]') ?? document.querySelector<HTMLElement>('.nola-nav-button[aria-current="page"]')
      restoreFocus?.focus({ preventScroll: true })
    }
  }, [])

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      actions.settings.stopOnboarding()
    }
    if (event.key !== 'Tab') return
    const buttons = [...(cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const first = buttons[0]
    const last = buttons.at(-1)
    if (document.activeElement === cardRef.current || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault()
      const destination = event.shiftKey ? last : first
      destination?.focus()
    }
  }

  const last = index === STEPS.length - 1
  return createPortal(
    <div className="onboarding-tour z-overlay" onKeyDown={keyDown}>
      <svg className="onboarding-tour__mask" width="100%" height="100%" aria-hidden="true">
        <path className="onboarding-tour__scrim" fillRule="evenodd" d={spotlightPath(geometry?.viewport ?? { width: window.innerWidth, height: window.innerHeight }, geometry?.target ?? null, geometry?.radius ?? 0)} />
        {geometry?.target ? <rect className="onboarding-tour__outline" x={geometry.target.x} y={geometry.target.y} width={geometry.target.width} height={geometry.target.height} rx={geometry.radius} /> : null}
      </svg>
      <Card ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body"
        className="onboarding-tour__card" data-ready={geometry !== null}
        style={geometry ? { left: geometry.tip.x, top: geometry.tip.y } : undefined}>
        <Card.Header><Card.Title id="onboarding-heading">{t(step.title)}</Card.Title></Card.Header>
        <Card.Content>
          <p id="onboarding-body">{t(step.body)}</p>
          {!ready ? <p className="onboarding-tour__status" role="status"><Spinner size="sm" />{t('onboarding.loading')}</p> : !geometry?.target ? <p className="onboarding-tour__status" role="status">{t('onboarding.unavailable')}</p> : null}
        </Card.Content>
        <Card.Footer>
          <div className="onboarding-tour__progress" aria-live="polite">{t('onboarding.progress', { current: index + 1, total: STEPS.length })}</div>
          <div className="onboarding-tour__actions">
            <Button variant="tertiary" size="sm" onPress={() => actions.settings.stopOnboarding()}>{t('onboarding.skip')}</Button>
            <Button ref={primaryRef} variant="primary" size="sm" isDisabled={!ready}
              onPress={() => { if (last) actions.settings.stopOnboarding(); else setIndex(index + 1) }}>{t(last ? 'onboarding.done' : 'onboarding.next')}</Button>
          </div>
        </Card.Footer>
      </Card>
    </div>, document.body,
  )
}
