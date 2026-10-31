import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { actions, getBridge, stores, useStore } from '@/store'
import { reportSettingsFailure } from '@/features/settings/settingsErrorChannel'
import { placeTourCard } from './tourLayout'
import type { TourRect, TourSize } from './tourLayout'
import { TOUR_STEPS } from './tourSteps'
import type { OnboardingCardState } from '../../../shared/onboarding-card'
import { TourLesson } from './TourLesson'
import { closeTourDialog, findTourTarget, prepareTourStep } from './tourDriver'
import './onboarding.css'

export interface OnboardingTourProps {
  /** Website demos can opt into manual presentation without writing a first-run marker. */
  autoStart?: boolean
}

export function OnboardingTour({ autoStart = true }: OnboardingTourProps) {
  const { settings, loaded, onboardingActive, onboardingWelcome, onboardingRun, runtimeBusy } = useStore(stores.settings, state => state)
  const { status, engineStatus } = useStore(stores.session, state => state)
  const modelsReady = useStore(stores.models, state => state.loaded || (!state.loading && state.error !== null))
  const browserBusy = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionService === 'loading' || state.captionService === 'ready')
  const busy = ['starting', 'running', 'paused', 'stopping'].includes(status) || runtimeBusy || browserBusy
  useEffect(() => {
    if (autoStart && loaded && settings && modelsReady && !busy && (engineStatus === 'ready' || engineStatus === 'failed')) {
      actions.settings.startOnboarding('automatic')
    }
  }, [autoStart, loaded, settings, modelsReady, busy, engineStatus])

  if (!onboardingActive) return null
  if (onboardingWelcome) return <WelcomeDialog />
  return <TourSteps key={onboardingRun} />
}

function WelcomeDialog() {
  const { t } = useI18n()
  const required = useStore(stores.settings, state => state.onboardingRequired)
  useEffect(() => {
    void actions.settings.saveOnboardingStep('W0').catch(error => reportSettingsFailure(t('onboarding.saveFailed'), error))
  }, [t])
  const { navigate } = useRoute()
  useLayoutEffect(() => { navigate('#/') }, [navigate])

  return <Dialog open onOpenChange={(open, details) => { if (details.reason === 'outside-press' || required) { details.cancel(); return } if (!open) actions.settings.stopOnboarding() }}>

        <DialogContent className="onboarding-welcome onboarding-dialog" aria-modal="true" aria-describedby="onboarding-welcome-description">
          {!required ? <DialogCloseButton aria-label={t('onboarding.exit')} /> : null}
          <CardHeader>
            <CardTitle><DialogTitle>{t('onboarding.welcomeTitle')}</DialogTitle></CardTitle>
            <CardDescription id="onboarding-welcome-description">{t('onboarding.welcomeIntro')}</CardDescription>
          </CardHeader>
          <DialogFooter>
            <Button data-onboarding="onboarding-begin" variant="default" size="sm" autoFocus onClick={() => actions.settings.beginOnboarding()}>{t('onboarding.begin')}</Button>
            {!required ? <Button variant="secondary" size="sm" onClick={() => actions.settings.stopOnboarding()}>{t('onboarding.exit')}</Button> : null}

          </DialogFooter>
        </DialogContent>

  </Dialog>
}

interface TourGeometry {
  stepId: string
  target: TourRect | null
  tip: { x: number; y: number }
  viewport: TourSize
  radius: number
}

function TourSteps() {
  const { t } = useI18n()
  const { navigate, path } = useRoute()
  const cardWindow = getBridge()?.onboardingCard?.available() ? getBridge()!.onboardingCard! : null
  const required = useStore(stores.settings, state => state.onboardingRequired)
  const [index, setIndex] = useState(() => {
    const saved = required ? stores.settings.getState().settings?.onboardingStep : 'H1'
    return saved === 'Z0' ? TOUR_STEPS.length : Math.max(0, TOUR_STEPS.findIndex(item => item.id === saved))
  })
  const [shownIndex, setShownIndex] = useState(index)
  const [busy, setBusy] = useState(true)
  const busyRef = useRef(true)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [geometry, setGeometry] = useState<TourGeometry | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const step = TOUR_STEPS[shownIndex]
  const finished = !TOUR_STEPS[index]

  useEffect(() => {
    if (finished) return
    const controller = new AbortController()
    busyRef.current = true
    setBusy(true)
    setUnavailable(false)
    void prepareTourStep(TOUR_STEPS[index], navigate, controller.signal).then(() => {
      setShownIndex(index)
      setBusy(false)
      busyRef.current = false
      if (required) void actions.settings.saveOnboardingStep(TOUR_STEPS[index].id).catch(error => reportSettingsFailure(t('onboarding.saveFailed'), error))
    }).catch(error => {
      if (controller.signal.aborted) return
      console.error('[onboarding] scene transition failed', error)
      setUnavailable(true)
      setBusy(false)
      busyRef.current = false
    })
    return () => controller.abort()
  }, [index, attempt, finished, navigate, required, t])

  useEffect(() => () => closeTourDialog(), [])

  const next = useCallback(() => {
    if (busyRef.current) return
    if (unavailable) { setAttempt(value => value + 1); return }
    busyRef.current = true
    setBusy(true)
    if (index === TOUR_STEPS.length - 1) {
      void actions.settings.completeOnboarding().then(() => {
        closeTourDialog()
        navigate('#/')
      }).catch(error => {
        reportSettingsFailure(t('onboarding.saveFailed'), error)
        busyRef.current = false
        setBusy(false)
      })
    } else setIndex(value => value + 1)
  }, [index, unavailable, navigate, t])

  useLayoutEffect(() => {
    if (!step || finished) return
    let frame = 0
    const measure = () => {
      const target = findTourTarget(step.target)
      const rect = target?.getBoundingClientRect()
      const included = step.include ? findTourTarget(step.include)?.getBoundingClientRect() : null
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const style = getComputedStyle(document.documentElement)
      const space = parseFloat(style.getPropertyValue('--space-1')) || 8
      const gap = space * 2
      const topInset = document.querySelector('.nola-app-body')?.getBoundingClientRect().top ?? 0
      const bounds = rect && included ? {
        left: Math.min(rect.left, included.left), top: Math.min(rect.top, included.top),
        right: Math.max(rect.right, included.right), bottom: Math.max(rect.bottom, included.bottom),
      } : rect
      let spotlight: TourRect | null = null
      if (bounds && path === step.path) {
        const x = Math.max(space, bounds.left - space)
        const y = Math.max(topInset + space, bounds.top - space)
        const right = Math.min(viewport.width - space, bounds.right + space)
        const bottom = Math.min(viewport.height - space, bounds.bottom + space)
        if (right > x && bottom > y) spotlight = { x, y, width: right - x, height: bottom - y }
      }
      const card = cardRef.current?.getBoundingClientRect()
      const size = card ? { width: card.width, height: card.height } : { width: 0, height: 0 }
      const nextGeometry = {
        stepId: step.id, target: spotlight, viewport, radius: parseFloat(style.getPropertyValue('--radius-xl')) || gap,
        tip: placeTourCard(spotlight, size, viewport, gap, topInset),
      }
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(nextGeometry) ? previous : nextGeometry)
    }
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(refresh)
    if (cardRef.current) resize.observe(cardRef.current)
    const target = findTourTarget(step.target)
    if (target) resize.observe(target)
    const mutation = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.onboarding-tour'))) refresh()
    })
    mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-closed', 'aria-expanded'] })
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    measure()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [step, shownIndex, finished, path])

  useLayoutEffect(() => {
    if (!cardWindow || !step || finished || geometry?.stepId !== step.id || !geometry.target) return
    const state: OnboardingCardState = {
      step: step.id, required, index: shownIndex, total: TOUR_STEPS.length,
      viewport: geometry?.viewport ?? { width: window.innerWidth, height: window.innerHeight },
      topInset: document.querySelector('.nola-app-body')?.getBoundingClientRect().top ?? 0,
      spotlight: geometry?.target ?? null, missing: !geometry?.target, unavailable, busy,
      compact: window.innerHeight < 640,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    }
    cardWindow.sendState(state)
  }, [cardWindow, step, finished, geometry, shownIndex, required, unavailable, busy])

  useEffect(() => {
    if (!cardWindow || finished) return
    cardWindow.show()
    return () => cardWindow.hide()
  }, [cardWindow, finished])

  useEffect(() => {
    if (!cardWindow) return
    return cardWindow.onAction(message => {
      if (message.step !== step?.id) return
      if (message.action === 'next') next()
      else if (message.action === 'exit' && !required) actions.settings.stopOnboarding()
    })
  }, [cardWindow, step, next, required])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!required) actions.settings.stopOnboarding() }
    }
    const block = (event: MouseEvent) => {
      if (event.isTrusted && event.target instanceof Element && !event.target.closest('.onboarding-tour__card, .onboarding-tour__keyboard')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', block, true)
    document.addEventListener('pointerdown', block, true)
    document.addEventListener('keydown', keyDown, true)
    return () => {
      document.removeEventListener('keydown', keyDown, true)
      document.removeEventListener('click', block, true)
      document.removeEventListener('pointerdown', block, true)
    }
  }, [required])


  if (finished) return <TourCompletion />
  const target = geometry?.target
  const title = t(step.title)
  const description = unavailable ? t('onboarding.targetMissing') : t(step.body)
  const nextLabel = t(unavailable ? 'onboarding.retry' : shownIndex === TOUR_STEPS.length - 1 ? 'onboarding.finishAction' : 'onboarding.next')
  return createPortal(
    <div className="onboarding-tour z-onboarding" data-step={step.id} data-busy={busy}>
      <div className="onboarding-tour__blocker" aria-hidden="true" />
      {target ? <svg className="onboarding-tour__mask" width="100%" height="100%" aria-hidden="true">
        <defs><mask id="onboarding-aperture">
          <rect width="100%" height="100%" fill="white" />
          <rect className="onboarding-tour__aperture" fill="black" x={target.x} y={target.y} width={target.width} height={target.height} rx={geometry.radius} />
        </mask></defs>
        <rect className="onboarding-tour__scrim" width="100%" height="100%" mask="url(#onboarding-aperture)" />
        <rect className="onboarding-tour__outline" x={target.x} y={target.y} width={target.width} height={target.height} rx={geometry.radius} />
        <rect key={step.id} className="onboarding-tour__pulse" x={target.x} y={target.y} width={target.width} height={target.height} rx={geometry.radius} />
      </svg> : null}
      {!cardWindow ? <Card ref={cardRef} size="sm" role="dialog" aria-modal="false" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body"
        className="onboarding-tour__card" data-ready={geometry !== null}
        style={geometry ? { left: geometry.tip.x, top: geometry.tip.y } : undefined}>
        <TourLesson title={title} description={description} progress={t('onboarding.progress', { current: shownIndex + 1, total: TOUR_STEPS.length })}
          nextLabel={nextLabel} busy={busy} onNext={next} exitLabel={!required ? t('onboarding.exit') : undefined} onExit={() => actions.settings.stopOnboarding()} />
      </Card> : <div className="onboarding-tour__keyboard sr-only focus-within:not-sr-only">
        <Button disabled={busy} onClick={next}>{nextLabel}</Button>
      </div>}
    </div>, document.body,
  )
}

function TourCompletion() {
  const { t } = useI18n()
  const { navigate } = useRoute()
  const required = useStore(stores.settings, state => state.onboardingRequired)
  const resources = useStore(stores.models, state => state.resources)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const finish = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await actions.settings.completeOnboarding()
      navigate('#/')
    } catch (error) {
      setFailed(true)
      reportSettingsFailure(t('onboarding.saveFailed'), error)
    } finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={(open, details) => { if (details.reason === 'outside-press' || required) { details.cancel(); return } if (!open) actions.settings.stopOnboarding() }}>
    <DialogContent className="onboarding-dialog" data-onboarding="complete" aria-modal="true" aria-describedby="onboarding-complete-description">
      {!required ? <DialogCloseButton aria-label={t('onboarding.exit')} /> : null}
      <CardHeader><CardTitle><DialogTitle>{t('onboarding.finishTitle')}</DialogTitle></CardTitle><CardDescription id="onboarding-complete-description">{t('onboarding.finishBody')}</CardDescription></CardHeader>
      <CardContent>
        <p>{t('onboarding.replayHelp')}</p>
        {!resources.some(resource => resource.installed && (resource.kind === 'recognitionModel' || resource.kind === 'translationModel')) ? <p className="onboarding-welcome__support">{t('onboarding.noModels')}</p> : null}
        {failed ? <p role="alert">{t('onboarding.saveFailed')}</p> : null}
      </CardContent>
      <DialogFooter><Button variant="default" size="sm" disabled={saving} onClick={() => void finish()}>{t('onboarding.finishExit')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
