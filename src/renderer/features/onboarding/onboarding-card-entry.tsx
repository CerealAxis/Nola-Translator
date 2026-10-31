import './onboarding-card-entry.css'
import { StrictMode, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '@/i18n'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { getBridge, initStores } from '@/store'
import { Card } from '@/components/ui/card'
import { TOUR_STEPS } from './tourSteps'
import { TourLesson } from './TourLesson'
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
  const [tip, setTip] = useState<{ x: number; y: number; maxHeight?: number; maxWidth?: number } | null>(null)
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
      // The physical work area bounds the card; the spotlight must never squeeze its contents.
      const topInset = state.usable.y
      const maxHeight = state.usable.height - gap * 2
      const size = { width: card.width, height: Math.min(card.height, maxHeight ?? card.height) }
      const position = placeInUsable(spotlight, size, state.usable, gap, topInset)
      const maxWidth = state.usable.width - gap * 2
      const next = { ...position, maxHeight, maxWidth }
      setTip(previous => previous && previous.x === next.x && previous.y === next.y && previous.maxHeight === next.maxHeight && previous.maxWidth === next.maxWidth ? previous : next)
      api?.sendRect({ x: position.x, y: position.y, width: card.width, height: card.height })
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(cardRef.current)
    return () => resize.disconnect()
  }, [state, api])


  if (!state) return null
  const step = TOUR_STEPS.find(item => item.id === state.step)
  const send = (action: OnboardingCardActionType) => () => api?.sendAction({ step: state.step, action })
  return <div className="onboarding-card-window" data-main-offset={`${state.mainOffset.x},${state.mainOffset.y}`}>
    <Card size="sm" ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="onboarding-heading" aria-describedby="onboarding-body"
      className={['onboarding-tour__card', state.compact && 'onboarding-tour__card--compact'].filter(Boolean).join(' ')}
      data-step={state.step}
      data-ready={tip !== null}
      style={tip ? { left: tip.x, top: tip.y, maxHeight: tip.maxHeight, maxWidth: tip.maxWidth } : undefined}>
      <TourLesson
        title={step ? t(step.title) : t('onboarding.title')}
        description={state.unavailable ? t('onboarding.targetMissing') : step ? t(step.body) : ''}
        progress={t('onboarding.progress', { current: state.index + 1, total: state.total })}
        nextLabel={t(state.unavailable ? 'onboarding.retry' : state.index === state.total - 1 ? 'onboarding.finishAction' : 'onboarding.next')}
        busy={state.busy}
        onNext={send('next')}
        exitLabel={!state.required ? t('onboarding.exit') : undefined}
        onExit={send('exit')}
      />
    </Card>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><OnboardingCardWindow /></I18nProvider></StrictMode>)
