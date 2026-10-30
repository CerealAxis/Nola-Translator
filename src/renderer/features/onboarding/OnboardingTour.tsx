import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Progress } from '@base-ui/react/progress'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Github, MousePointer2, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { settingsPath, useRoute } from '@/routes'
import { actions, getBridge, stores, useStore } from '@/store'
import { reportSettingsFailure } from '@/features/settings/settingsErrorChannel'
import { placeTourCard, spotlightPath } from './tourLayout'
import type { TourRect, TourSize } from './tourLayout'
import nolaLogoUrl from '../../../../assets/brand/nola-logo.svg'
import { TOUR_CHAPTERS, TOUR_STEPS, tourTarget } from './tourSteps'
import './onboarding.css'

export interface OnboardingTourProps {
  /** Website demos can opt into manual presentation without writing a first-run marker. */
  autoStart?: boolean
}

export function OnboardingTour({ autoStart = true }: OnboardingTourProps) {
  const { settings, loaded, onboardingActive, onboardingWelcome, onboardingRun, runtimeBusy } = useStore(stores.settings, state => state)
  const { status, engineStatus } = useStore(stores.session, state => state)
  const browserBusy = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionService === 'loading' || state.captionService === 'ready')
  const { navigate } = useRoute()
  const busy = ['starting', 'running', 'paused', 'stopping'].includes(status) || runtimeBusy || browserBusy
  useLayoutEffect(() => {
    if (onboardingActive) navigate('#/')
  }, [onboardingActive, onboardingWelcome, onboardingRun, navigate])
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
    if (!stores.settings.getState().settings?.onboardingSeen) {
      void actions.settings.markOnboardingSeen().catch((error: unknown) => {
        reportSettingsFailure(t('onboarding.saveFailed'), error)
      })
    }
  }, [t])

  return <Dialog open onOpenChange={(open, details) => { if (details.reason === 'outside-press') { details.cancel(); return } if (!open) actions.settings.stopOnboarding() }}>

        <DialogContent className="onboarding-welcome onboarding-dialog" aria-modal="true" aria-describedby="onboarding-welcome-description">
          <CardHeader>
            <CardAction><img ref={markPresented} className="onboarding-welcome__logo" src={nolaLogoUrl} alt="" aria-hidden="true" /></CardAction>
            <CardTitle><DialogTitle>{t('onboarding.welcomeTitle')}</DialogTitle></CardTitle>
            <CardDescription id="onboarding-welcome-description">{t('onboarding.welcomeIntro')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="onboarding-welcome__chapters">
              {TOUR_CHAPTERS.map((key, item) => <li key={key}><span aria-hidden="true">{item + 1}</span>{t(key)}</li>)}
            </ol>
            <p className="onboarding-welcome__support">{t('onboarding.starRequest')}</p>
          </CardContent>
          <DialogFooter>
            <Button variant="default" size="sm" autoFocus onClick={() => actions.settings.beginOnboarding()}>{t('onboarding.begin')}</Button>
            <Button variant="secondary" size="sm" onClick={() => actions.settings.stopOnboarding()}>{t('onboarding.later')}</Button>
            <a className="onboarding-welcome__link button button--sm button--secondary" href="https://nola.xaviermc.top" target="_blank" rel="noreferrer">
              <BookOpen aria-hidden="true" />{t('onboarding.helpDocs')}
            </a>
            <a className="onboarding-welcome__link button button--sm button--secondary" href="https://github.com/CerealAxis/Nola-Translator" target="_blank" rel="noreferrer">
              <Github aria-hidden="true" />{t('onboarding.github')}
            </a>
          </DialogFooter>
        </DialogContent>

  </Dialog>
}

interface TourGeometry {
  target: TourRect | null
  tip: { x: number; y: number }
  viewport: TourSize
  radius: number
  maxHeight?: number
}

/** Ignore hidden tab panels and choose the first real, visible catalog entry. */
function findTarget(selectors: string): HTMLElement | null {
  for (const selector of selectors.split(',')) {
    const visible = [...document.querySelectorAll<HTMLElement>(selector.trim())].find(element => {
      const rect = element.getBoundingClientRect()
      return !element.closest('[hidden]') && rect.width > 0 && rect.height > 0
    })
    if (visible) return visible
  }
  return null
}

function TourSteps() {
  const { t } = useI18n()
  const { navigate, path } = useRoute()
  // The desktop build teaches with a card in its own transparent window, immune to the main
  // document's viewport limits and modal interaction locks; web demos fall back to the
  // in-document card below.
  const cardWindow = getBridge()?.onboardingCard?.available() ? getBridge()!.onboardingCard! : null
  const [index, setIndex] = useState(0)
  const [geometry, setGeometry] = useState<TourGeometry | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const [retry, setRetry] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const step = TOUR_STEPS[index]
  const finished = !step
  const chapter = step?.chapter ?? TOUR_CHAPTERS.length - 1
  const chapterSteps = TOUR_STEPS.filter(item => item.chapter === chapter)
  const chapterIndex = step ? chapterSteps.indexOf(step) + 1 : chapterSteps.length
  const away = !!step && path !== step.path && path !== step.destination

  const moveTo = useCallback((nextIndex: number, completed = false) => {
    let next = TOUR_STEPS[nextIndex]
    // Going back into a closed detail starts at its real opener, rather than simulating a click.
    if (next?.model && !document.querySelector(tourTarget('model-detail'))) {
      nextIndex = nextIndex > index
        ? TOUR_STEPS.findIndex((item, position) => position >= nextIndex && !item.model)
        : TOUR_STEPS.findIndex(item => item.id === `${next!.model}-model`)
      next = TOUR_STEPS[nextIndex]
    }
    if (!next?.model) document.querySelector<HTMLButtonElement>(tourTarget('model-detail-close'))?.click()
    setGeometry(null)
    setFeedback(completed)
    setIndex(nextIndex)
    if (next) navigate(next.path)
  }, [navigate, index])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(false), 1600)
    return () => window.clearTimeout(timer)
  }, [feedback, index])

  useLayoutEffect(() => {
    setUnavailable(false)
    if (!step || away) {
      setGeometry(null)
      return
    }
    let frame = 0
    let settleFrame = 0
    let target: HTMLElement | null = null
    let alignmentKey = ''
    let focused = false
    let acted = false
    let advancing = false
    let alive = true
    const style = getComputedStyle(document.documentElement)
    const space = parseFloat(style.getPropertyValue('--space-1')) || 8
    const gap = space * 2
    const radius = parseFloat(style.getPropertyValue('--radius-xl')) || space * 2
    const reduced = document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const advance = () => {
      if (advancing || !alive) return
      advancing = true
      // React and the controls must finish their route/tab/dialog update before the next lesson measures it.
      settleFrame = requestAnimationFrame(() => { if (alive) moveTo(index + 1, true) })
    }
    const measure = () => {
      if (!alive) return
      const found = findTarget(step.target)
      if (found !== target && target) resize.unobserve(target)
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      if (found) {
        // The separate card window never competes for horizontal room, so only the in-document
        // card makes vertical scroll alignment necessary.
        const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 0
        const alignTop = found.getBoundingClientRect().width + cardWidth + gap * 3 > viewport.width
        const alignment = `${viewport.width}:${viewport.height}:${alignTop}`
        if (found !== target || alignmentKey !== alignment) {
          target = found
          alignmentKey = alignment
          const behavior = reduced ? 'instant' : 'smooth'
          const main = target.closest<HTMLElement>('.nola-main')
          if (target.closest('.settings-nav')) main?.scrollTo({ top: 0, behavior })
          else {
            // Scroll only the containing panel: scrollIntoView also moves the document and its title bar.
            let scroller = target.parentElement
            while (scroller && scroller !== document.body) {
              if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) break
              scroller = scroller.parentElement
            }
            if (scroller && scroller !== document.body) {
              const bounds = scroller.getBoundingClientRect()
              const nav = main?.querySelector<HTMLElement>('.settings-nav')
              const stackedNav = scroller === main && target.closest('.settings-panels') && nav && nav.offsetWidth > main.clientWidth / 2 ? nav.offsetHeight + space : 0
              const top = bounds.top + gap + stackedNav
              const room = Math.max(0, bounds.bottom - gap - top)
              const rect = target.getBoundingClientRect()
              const desired = alignTop ? top : top + Math.max(0, (room - rect.height) / 2)
              scroller.scrollTo({ top: scroller.scrollTop + rect.top - desired, behavior })
            }
          }
          resize.observe(target)
        }
      } else target = null
      const topInset = document.querySelector('.nola-app-body')?.getBoundingClientRect().top ?? gap * 4
      const targetRect = target?.getBoundingClientRect()
      const included = step.include ? findTarget(step.include) : null
      if (included) resize.observe(included)
      const includedRect = included?.getBoundingClientRect()
      // Related actions belong to the same protected area, even when rendered in a separate modal footer.
      const rect = targetRect && includedRect ? {
        left: Math.min(targetRect.left, includedRect.left),
        top: Math.min(targetRect.top, includedRect.top),
        right: Math.max(targetRect.right, includedRect.right),
        bottom: Math.max(targetRect.bottom, includedRect.bottom),
      } : targetRect
      let spotlight: TourRect | null = null
      if (rect) {
        const x = Math.max(space, rect.left - space)
        const y = Math.max(topInset + space, rect.top - space)
        const right = Math.min(viewport.width - space, rect.right + space)
        const bottom = Math.min(viewport.height - space, rect.bottom + space)
        if (right > x && bottom > y) spotlight = { x, y, width: right - x, height: bottom - y }
      }
      const card = cardRef.current?.getBoundingClientRect()
      const sideRoom = spotlight ? Math.max(spotlight.x - gap * 2, viewport.width - spotlight.x - spotlight.width - gap * 2) : viewport.width
      const verticalRoom = spotlight ? Math.max(spotlight.y - topInset - gap * 2, viewport.height - spotlight.y - spotlight.height - gap * 2) : viewport.height
      const maxHeight = card && sideRoom < card.width && verticalRoom > space * 8 ? verticalRoom : undefined
      const size = card ? { width: card.width, height: maxHeight ? Math.min(card.height, maxHeight) : card.height } : { width: 0, height: 0 }
      const next: TourGeometry = card
        ? { target: spotlight, viewport, radius, maxHeight, tip: placeTourCard(spotlight, size, viewport, gap, topInset) }
        : { target: spotlight, viewport, radius, tip: { x: 0, y: 0 } }
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      if (!focused && target) {
        focused = true
        const control = target.matches('button, [role="tab"]') ? target : target.querySelector<HTMLElement>('[aria-haspopup="listbox"], button:not(:disabled)')
        // Do not take focus away from a dropdown or dialog that the user just opened.
        if (!document.querySelector('[role="listbox"]')) (control ?? cardRef.current)?.focus({ preventScroll: true })
      }
      if (step.action === 'press' && acted && (!step.result || findTarget(step.result))) advance()
    }
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.onboarding-tour')) return
      const clicked = event.target.closest(step.target)
      const control = event.target.closest('button, [role="tab"], [role="button"]')
      if (step.action === 'press' && clicked && control && !control.matches(':disabled, [aria-disabled="true"]')) {
        acted = true
        refresh()
      }
    }
    const resize = new ResizeObserver(refresh)
    if (cardRef.current) resize.observe(cardRef.current)
    const mutation = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.onboarding-tour'))) refresh()
    })
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-pressed', 'hidden', 'data-onboarding-result'] })
    document.addEventListener('click', click, true)
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const timeout = window.setTimeout(() => { setUnavailable(true); refresh() }, 2500)
    refresh()
    return () => {
      alive = false
      clearTimeout(timeout)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(settleFrame)
      resize.disconnect()
      mutation.disconnect()
      document.removeEventListener('click', click, true)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [step, index, away, retry, moveTo])

  // Route changes are evidence of actual navigation, including keyboard activation.
  useEffect(() => {
    if (step?.destination === path) moveTo(index + 1, true)
  }, [step, path, index, moveTo])

  useEffect(() => {
    if (finished) return
    const previous = document.activeElement
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="listbox"], [data-onboarding="model-detail"]')) return
      actions.settings.stopOnboarding()
    }
    document.addEventListener('keydown', keyDown)
    return () => {
      document.removeEventListener('keydown', keyDown)
      const restore = previous instanceof HTMLElement && previous.isConnected ? previous : document.querySelector<HTMLElement>('.nola-nav-button[aria-current="page"]')
      restore?.focus({ preventScroll: true })
    }
  }, [finished])

  const resume = useCallback(() => {
    if (step?.model && !document.querySelector(tourTarget('model-detail'))) {
      moveTo(TOUR_STEPS.findIndex(item => item.id === `${step.model}-model`))
    } else if (step) {
      navigate(step.path)
      setRetry(value => value + 1)
    }
  }, [step, moveTo, navigate])
  const missing = !geometry?.target
  const skipChapter = useCallback(() => {
    moveTo(TOUR_STEPS.findIndex(item => item.chapter > chapter) < 0 ? TOUR_STEPS.length : TOUR_STEPS.findIndex(item => item.chapter > chapter))
  }, [moveTo, chapter])

  useEffect(() => {
    if (!cardWindow) return
    cardWindow.show()
    return () => cardWindow.hide()
  }, [cardWindow])

  // The card window mirrors one lesson at a time; every driver of the DOM card re-sends here.
  useEffect(() => {
    if (!cardWindow || finished || !step) return
    cardWindow.sendState({
      step: step.id,
      chapter,
      chapters: TOUR_CHAPTERS.length,
      chapterIndex,
      chapterSteps: chapterSteps.length,
      index,
      total: TOUR_STEPS.length,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      topInset: document.querySelector('.nola-app-body')?.getBoundingClientRect().top ?? 32,
      spotlight: geometry?.target ?? null,
      away,
      missing,
      unavailable,
      feedback,
      compact: !!step.model || window.innerHeight < 640,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    })
  }, [cardWindow, finished, step, geometry, away, missing, unavailable, feedback, index, chapter, chapterIndex, chapterSteps])

  useEffect(() => {
    if (!cardWindow) return
    return cardWindow.onAction(action => {
      if (action === 'exit') actions.settings.stopOnboarding()
      else if (action === 'next' || action === 'skip-step') moveTo(index + 1)
      else if (action === 'back') moveTo(index - 1)
      else if (action === 'skip-chapter') skipChapter()
      else if (action === 'resume' || action === 'retry') resume()
    })
  }, [cardWindow, index, moveTo, skipChapter, resume])

  // While the cursor is over the card, the card window must stop forwarding mouse events; the
  // main window is the only one that sees the cursor while it still forwards.
  useEffect(() => {
    if (!cardWindow) return
    let rect: { x: number; y: number; width: number; height: number } | null = null
    let offset = { x: 0, y: 0 }
    let interactive = false
    const off = cardWindow.onRect(payload => { rect = payload.rect; offset = payload.mainOffset })
    const move = (event: MouseEvent) => {
      const x = event.clientX + offset.x
      const y = event.clientY + offset.y
      const inside = !!rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
      if (inside === interactive) return
      interactive = inside
      cardWindow.sendHit(inside)
    }
    window.addEventListener('mousemove', move)
    return () => {
      off()
      window.removeEventListener('mousemove', move)
      if (interactive) cardWindow.sendHit(false)
    }
  }, [cardWindow])

  if (finished) return <TourCompletion onExit={() => { actions.settings.stopOnboarding(); navigate(settingsPath('more')) }} />

  // Separate-window path: the mask stays here, the teaching card lives in its own window.
  if (cardWindow) return createPortal(
    <div className="onboarding-tour z-onboarding" data-step={step.id}>
      {!away ? <svg className="onboarding-tour__mask" width="100%" height="100%" aria-hidden="true">
        <path className="onboarding-tour__scrim" fillRule="evenodd" d={spotlightPath(geometry?.viewport ?? { width: window.innerWidth, height: window.innerHeight }, geometry?.target ?? null, geometry?.radius ?? 0)} />
        {geometry?.target ? <rect className="onboarding-tour__outline" x={geometry.target.x} y={geometry.target.y} width={geometry.target.width} height={geometry.target.height} rx={geometry.radius} /> : null}
      </svg> : null}
    </div>, document.body,
  )

  return createPortal(
    <div className="onboarding-tour z-onboarding" data-react-aria-top-layer="true" data-step={step?.id ?? 'complete'}>
      {!away ? <svg className="onboarding-tour__mask" width="100%" height="100%" aria-hidden="true">
        <path className="onboarding-tour__scrim" fillRule="evenodd" d={spotlightPath(geometry?.viewport ?? { width: window.innerWidth, height: window.innerHeight }, geometry?.target ?? null, geometry?.radius ?? 0)} />
        {geometry?.target ? <rect className="onboarding-tour__outline" x={geometry.target.x} y={geometry.target.y} width={geometry.target.width} height={geometry.target.height} rx={geometry.radius} /> : null}
      </svg> : null}
      <Card size="sm" ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body"
        className={['onboarding-tour__card', (step?.model || (geometry?.viewport.height ?? window.innerHeight) < 640) && 'onboarding-tour__card--compact', away && 'onboarding-tour__card--center'].filter(Boolean).join(' ')}
        data-ready={away || geometry !== null}
        style={geometry && !away ? { left: geometry.tip.x, top: geometry.tip.y, maxHeight: geometry.maxHeight } : undefined}>
        <CardHeader>
          <CardTitle id="onboarding-heading">{t(step.title)}</CardTitle>
          <CardDescription id="onboarding-body">{away ? t('onboarding.paused') : t(step.body)}</CardDescription>
          <CardAction><Button variant="tertiary" size="icon" className="onboarding-tour__close border-transparent bg-transparent hover:bg-transparent aria-expanded:bg-transparent" aria-label={t('onboarding.exit')} onClick={() => actions.settings.stopOnboarding()}><X aria-hidden="true" /></Button></CardAction>
        </CardHeader>
        <CardContent key={step.id} className="onboarding-tour__lesson">
          <ol className="onboarding-tour__chapters" aria-label={t('onboarding.title')}>
            {TOUR_CHAPTERS.map((key, item) => <li key={key} aria-current={item === chapter ? 'step' : undefined} data-state={item < chapter ? 'complete' : item === chapter ? 'current' : 'upcoming'}>
              <span aria-hidden="true">{item < chapter ? <Check /> : item + 1}</span><span>{t(key)}</span>
            </li>)}
          </ol>
          <Progress.Root className="onboarding-tour__meter" aria-label={t('onboarding.title')} value={(index / TOUR_STEPS.length) * 100}>
            <Progress.Track className="onboarding-tour__meter-track"><Progress.Indicator className="onboarding-tour__meter-fill" /></Progress.Track>
          </Progress.Root>
            {!away && missing ? <p className="onboarding-tour__status" role="status">{unavailable ? t('onboarding.targetMissing') : <><Spinner />{t('onboarding.loading')}</>}</p> : null}
            {!away && !missing && step.action ? <p className="onboarding-tour__instruction"><MousePointer2 aria-hidden="true" />{t('onboarding.actHint')}</p> : null}
            {feedback ? <div className="onboarding-tour__feedback" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" />{t('onboarding.feedback')}</div> : null}
        </CardContent>
          <CardFooter className="onboarding-tour__footer">
            <div className="onboarding-tour__navigation">
            <span className="onboarding-tour__progress">{t('onboarding.chapterProgress', { current: chapter + 1, total: TOUR_CHAPTERS.length })}<span>{t('onboarding.progress', { current: chapterIndex, total: chapterSteps.length })}</span></span>
            <div className="onboarding-tour__actions">
              <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => moveTo(index - 1)}><ArrowLeft aria-hidden="true" />{t('onboarding.back')}</Button>
              {away || (missing && unavailable) ? <Button variant="default" size="sm" onClick={resume}>{t(away ? 'onboarding.resume' : 'onboarding.retry')}</Button>
                : !step.action ? <Button variant="default" size="sm" disabled={missing} onClick={() => moveTo(index + 1)}>{t('onboarding.next')}<ArrowRight aria-hidden="true" /></Button> : null}
            </div>
            </div>
          <div className="onboarding-tour__secondary">
            <Button variant="tertiary" size="sm" onClick={() => moveTo(index + 1)}>{t('onboarding.skipStep')}</Button>
            <Button variant="tertiary" size="sm" onClick={skipChapter}>{t('onboarding.skipChapter')}</Button>
          </div>
          </CardFooter>
      </Card>
    </div>, document.body,
  )
}

export interface TourCompletionProps { onExit: () => void }

function TourCompletion({ onExit }: TourCompletionProps) {
  const { t } = useI18n()
  return <Dialog open onOpenChange={(open, details) => { if (details.reason === 'outside-press') { details.cancel(); return } if (!open) actions.settings.stopOnboarding() }}>

      <DialogContent className="onboarding-dialog" data-onboarding="complete" aria-modal="true" aria-describedby="onboarding-complete-description">
        <DialogCloseButton aria-label={t('onboarding.exit')} />
        <CardHeader className="onboarding-dialog__completion-header"><CardTitle><DialogTitle>{t('onboarding.finishTitle')}</DialogTitle></CardTitle><CardDescription id="onboarding-complete-description">{t('onboarding.finishBody')}</CardDescription></CardHeader>
        <DialogFooter>
      <a className="onboarding-welcome__link button button--sm button--secondary" href="https://github.com/CerealAxis/Nola-Translator" target="_blank" rel="noreferrer">
        <Github aria-hidden="true" />{t('onboarding.githubHome')}
      </a>
      <Button variant="default" size="sm" onClick={onExit}>{t('onboarding.finishExit')}</Button>
        </DialogFooter>
      </DialogContent>

  </Dialog>
}
