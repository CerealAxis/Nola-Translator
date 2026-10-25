/**
 * The onboarding teaching card lives in its own transparent child window so it can extend past
 * the main window's viewport and stay clickable above modal dialogs, whose interaction locks
 * would inert a card rendered inside the main document.
 *
 * Geometry flows main window → main process → card window:
 *   - the main window measures the spotlight in its own viewport coordinates (CSS px = DIP)
 *   - the main process owns the card window, injects `mainOffset`/`usable`, and forwards the state
 *   - the card window places itself with `placeTourCard` and reports its rect for hit testing
 * Mouse pass-through is toggled by the main process: the card window forwards mouse events while
 * the cursor is outside the reported card rect, so guided clicks still reach the main window.
 */

/** Spotlight cutout in main-window viewport coordinates. */
export interface OnboardingSpotlight {
  x: number
  y: number
  width: number
  height: number
}

export type OnboardingCardActionType = 'next' | 'back' | 'skip-step' | 'skip-chapter' | 'exit' | 'resume' | 'retry'

/** Everything the card window needs to paint one lesson. */
export interface OnboardingCardState {
  /** Tour step id, used only for diagnostics; the card renders copy keys, not step data. */
  step: string
  chapter: number
  chapters: number
  chapterIndex: number
  chapterSteps: number
  index: number
  total: number
  /** Main-window viewport size; the compact rule mirrors it without re-measuring there. */
  viewport: { width: number; height: number }
  /** Distance from the main viewport top to the first usable row (below the title bar). */
  topInset: number
  spotlight: OnboardingSpotlight | null
  away: boolean
  missing: boolean
  /** The target never appeared; the card offers retry instead of next. */
  unavailable: boolean
  /** The previous guided action completed; shown briefly as confirmation. */
  feedback: boolean
  /** Mirrors the in-document compact rule (model dialogs and short viewports). */
  compact: boolean
  theme: 'light' | 'dark'
}

/** Geometry injected by the main process when forwarding state or on its own after a move. */
export interface OnboardingCardPlacement {
  /** Origin of the main window's viewport inside the card window, in card-window pixels. */
  mainOffset: { x: number; y: number }
  /** The card window's own visible (screen-clipped) area in card-window pixels. */
  usable: { x: number; y: number; width: number; height: number }
}

export interface OnboardingCardApi {
  /** False on the web and in embedded demos: no Electron window can host the card there. */
  available(): boolean
  /** Opens (once) and shows the card window above the main window. */
  show(): void
  hide(): void
  /** Main window → card window: the current lesson. */
  sendState(state: OnboardingCardState): void
  onState(callback: (state: OnboardingCardState & OnboardingCardPlacement) => void): () => void
  /** Main process → card window: the window moved, so only the placement changed. */
  onPlacement(callback: (placement: OnboardingCardPlacement) => void): () => void
  /** Card window → main window: a footer control was activated. */
  sendAction(action: OnboardingCardActionType): void
  onAction(callback: (action: OnboardingCardActionType) => void): () => void
  /** Card window → main window: where the card is painted, for mouse pass-through hit testing. */
  sendRect(rect: { x: number; y: number; width: number; height: number } | null): void
  /** Main process → main window: the card rect (card-window coordinates) plus the viewport offset. */
  onRect(callback: (payload: { rect: { x: number; y: number; width: number; height: number } | null; mainOffset: { x: number; y: number } }) => void): () => void
  /** Main window → main process: the cursor is over the card rect (interactive) or not. */
  sendHit(interactive: boolean): void
}

const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Narrow structural validation for the lesson state the main window sends; returns a copy or null. */
export function parseOnboardingCardState(raw: unknown): OnboardingCardState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const step = typeof value.step === 'string' ? value.step : ''
  const theme = value.theme === 'dark' ? 'dark' : value.theme === 'light' ? 'light' : null
  const viewport = value.viewport as Record<string, unknown> | undefined
  const spotlight = value.spotlight as Record<string, unknown> | null | undefined
  if (!theme || !step) return null
  const flags = ['away', 'missing', 'unavailable', 'compact', 'feedback']
  const numbers = ['chapter', 'chapters', 'chapterIndex', 'chapterSteps', 'index', 'total', 'topInset']
  if (numbers.some(key => !number(value[key]))) return null
  if (flags.some(key => typeof value[key] !== 'boolean')) return null
  if (spotlight !== null && spotlight !== undefined) {
    if (!number(spotlight.x) || !number(spotlight.y) || !number(spotlight.width) || !number(spotlight.height)) return null
  }
  if (!viewport || !number(viewport.width) || !number(viewport.height)) return null
  return {
    step,
    theme,
    viewport: { width: viewport.width as number, height: viewport.height as number },
    spotlight: spotlight ? spotlight as unknown as OnboardingSpotlight : null,
    away: value.away as boolean,
    missing: value.missing as boolean,
    unavailable: value.unavailable as boolean,
    compact: value.compact as boolean,
    feedback: value.feedback as boolean,
    chapter: value.chapter as number,
    chapters: value.chapters as number,
    chapterIndex: value.chapterIndex as number,
    chapterSteps: value.chapterSteps as number,
    index: value.index as number,
    total: value.total as number,
    topInset: value.topInset as number,
  }
}

export function parseOnboardingCardAction(raw: unknown): OnboardingCardActionType | null {
  const actions: readonly OnboardingCardActionType[] = ['next', 'back', 'skip-step', 'skip-chapter', 'exit', 'resume', 'retry']
  return actions.includes(raw as OnboardingCardActionType) ? (raw as OnboardingCardActionType) : null
}

/** Card rect in card-window coordinates; null when the card is not placed yet. */
export function parseOnboardingCardRect(raw: unknown): { x: number; y: number; width: number; height: number } | null {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (!number(value.x) || !number(value.y) || !number(value.width) || !number(value.height)) return null
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}
