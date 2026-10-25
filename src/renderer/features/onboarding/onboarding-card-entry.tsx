import './onboarding-card-entry.css'
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '@/i18n'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { getBridge, initStores } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@base-ui/react/progress'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, MousePointer2, X } from 'lucide-react'
import { TOUR_CHAPTERS, TOUR_STEPS } from './tourSteps'
import { placeTourCard } from './tourLayout'
import type { TourRect, TourSize } from './tourLayout'
import type { OnboardingCardActionType, OnboardingCardPlacement, OnboardingCardState } from '../../../shared/onboarding-card'

/*
 * The teaching card half of the tour: this document paints only the card. The main window
 * measures the spotlight and streams lesson state; this window places the card with the same
 * `placeTourCard` rules, reports its rect for mouse pass-through switching, and forwards footer
 * controls back. Nothing here touches the main window's DOM.
 *
 * The state subscription lives at module level, not in a component effect: the main process
 * replays the current lesson as soon as this document loads, which can precede React mounting.
 */

type CardState = OnboardingCardState & OnboardingCardPlacement

function initialTheme(): 'light' | 'dark' {
  const requested = new URLSearchParams(window.location.search).get('theme')
  if (requested === 'dark' || requested === 'light') return requested
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let cardState: CardState | null = null
const stateListeners = new Set<() => void>()
const notifyState = () => stateListeners.forEach(listener => listener())

initStores(createIpcBridge(), { backgroundChecks: false, overlayMenu: true, offline: false })
document.documentElement.dataset.theme = initialTheme()
getBridge()?.onboardingCard?.onState(value => {
  cardState = { ...value }
  document.documentElement.dataset.theme = value.theme
  notifyState()
})
getBridge()?.onboardingCard?.onPlacement(value => {
  if (!cardState) return
  cardState = { ...cardState, ...value }
  notifyState()
})

function subscribeState(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

/** placeTourCard assumes a viewport rooted at (0,0); `usable` may start elsewhere after screen clipping. */
function placeInUsable(target: TourRect | null, card: TourSize, usable: OnboardingCardPlacement['usable'], gap: number, topInset: number): { x: number; y: number } {
  const local = placeTourCard(
    target ? { x: target.x - usable.x, y: target.y - usable.y, width: target.width, height: target.height } : null,
    card,
    { width: usable.width, height: usable.height },
    gap,
    Math.max(gap, topInset - usable.y),
  )
  return { x: local.x + usable.x, y: local.y + usable.y }
}

function OnboardingCardWindow(): ReactNode {
  const { t } = useI18n()
  const state = useSyncExternalStore(subscribeState, () => cardState)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const api = getBridge()?.onboardingCard

  useLayoutEffect(() => {
    if (!state || !cardRef.current) return
    const space = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-1')) || 8
    const gap = space * 2
    const measure = () => {
      if (!cardRef.current) return
      const card = cardRef.current.getBoundingClientRect()
      // The spotlight arrives in main-viewport coordinates; shift it into this window first.
      const spotlight: TourRect | null = state.spotlight
        ? { x: state.spotlight.x + state.mainOffset.x, y: state.spotlight.y + state.mainOffset.y, width: state.spotlight.width, height: state.spotlight.height }
        : null
      const topInset = state.topInset + state.mainOffset.y
      const position = state.away
        ? { x: state.usable.x + (state.usable.width - card.width) / 2, y: state.usable.y + (state.usable.height - card.height) / 2 }
        : placeInUsable(spotlight, { width: card.width, height: card.height }, state.usable, gap, topInset)
      setTip(previous => previous && previous.x === position.x && previous.y === position.y ? previous : position)
      api?.sendRect({ x: position.x, y: position.y, width: card.width, height: card.height })
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(cardRef.current)
    return () => resize.disconnect()
  }, [state, api])

  useEffect(() => {
    if (!api) return
    // This window only sees the mouse while interactive; a move outside the card restores pass-through.
    const move = (event: MouseEvent) => {
      const card = cardRef.current?.getBoundingClientRect()
      if (!card) return
      const inside = event.clientX >= card.left && event.clientX <= card.right && event.clientY >= card.top && event.clientY <= card.bottom
      if (!inside) api.sendHit(false)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [api])

  if (!state) return null
  const step = TOUR_STEPS.find(item => item.id === state.step)
  const send = (action: OnboardingCardActionType) => () => api?.sendAction(action)
  return <div className="onboarding-card-window" data-main-offset={`${state.mainOffset.x},${state.mainOffset.y}`}>
    <Card size="sm" ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body"
      className={['onboarding-tour__card', state.compact && 'onboarding-tour__card--compact'].filter(Boolean).join(' ')}
      data-ready={tip !== null}
      style={tip ? { left: tip.x, top: tip.y } : undefined}>
      <CardHeader>
        <CardTitle id="onboarding-heading">{step ? t(step.title) : t('onboarding.title')}</CardTitle>
        <CardDescription id="onboarding-body">{state.away ? t('onboarding.paused') : step ? t(step.body) : null}</CardDescription>
        <CardAction><Button variant="tertiary" size="icon-xs" className="onboarding-tour__close" aria-label={t('onboarding.exit')} onClick={send('exit')}><X aria-hidden="true" /></Button></CardAction>
      </CardHeader>
      <CardContent key={state.step} className="onboarding-tour__lesson">
        <ol className="onboarding-tour__chapters" aria-label={t('onboarding.title')}>
          {TOUR_CHAPTERS.map((key, item) => <li key={key} aria-current={item === state.chapter ? 'step' : undefined} data-state={item < state.chapter ? 'complete' : item === state.chapter ? 'current' : 'upcoming'}>
            <span aria-hidden="true">{item < state.chapter ? <Check /> : item + 1}</span><span>{t(key)}</span>
          </li>)}
        </ol>
        <Progress.Root className="onboarding-tour__meter" aria-label={t('onboarding.title')} value={(state.index / state.total) * 100}>
          <Progress.Track className="onboarding-tour__meter-track"><Progress.Indicator className="onboarding-tour__meter-fill" /></Progress.Track>
        </Progress.Root>
        {!state.away && state.missing ? <p className="onboarding-tour__status" role="status">{state.unavailable ? t('onboarding.targetMissing') : <><Spinner />{t('onboarding.loading')}</>}</p> : null}
        {!state.away && !state.missing && step?.action ? <p className="onboarding-tour__instruction"><MousePointer2 aria-hidden="true" />{t('onboarding.actHint')}</p> : null}
        {state.feedback ? <div className="onboarding-tour__feedback" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" />{t('onboarding.feedback')}</div> : null}
      </CardContent>
      <CardFooter className="onboarding-tour__footer">
        <div className="onboarding-tour__navigation">
          <span className="onboarding-tour__progress">{t('onboarding.chapterProgress', { current: state.chapter + 1, total: state.chapters })}<span>{t('onboarding.progress', { current: state.chapterIndex, total: state.chapterSteps })}</span></span>
          <div className="onboarding-tour__actions">
            <Button variant="secondary" size="sm" disabled={state.index === 0} onClick={send('back')}><ArrowLeft aria-hidden="true" />{t('onboarding.back')}</Button>
            {state.away || (state.missing && state.unavailable) ? <Button variant="default" size="sm" onClick={send(state.away ? 'resume' : 'retry')}>{t(state.away ? 'onboarding.resume' : 'onboarding.retry')}</Button>
              : step && !step.action ? <Button variant="default" size="sm" onClick={send('next')}>{t('onboarding.next')}<ArrowRight aria-hidden="true" /></Button> : null}
          </div>
        </div>
        <div className="onboarding-tour__secondary">
          <Button variant="tertiary" size="sm" onClick={send('skip-step')}>{t('onboarding.skipStep')}</Button>
          <Button variant="tertiary" size="sm" onClick={send('skip-chapter')}>{t('onboarding.skipChapter')}</Button>
        </div>
      </CardFooter>
    </Card>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><OnboardingCardWindow /></I18nProvider></StrictMode>)
