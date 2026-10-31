import { tourTarget } from './tourSteps'
import type { TourStep } from './tourSteps'

export function findTourTarget(selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(element => {
    const rect = element.getBoundingClientRect()
    return !element.closest('[hidden], [data-closed]') && rect.width > 0 && rect.height > 0
  }) ?? null
}

export function waitForTourTarget(selector: string, signal: AbortSignal): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    const check = () => {
      const target = findTourTarget(selector)
      if (target) { cleanup(); resolve(target) }
    }
    const observer = new MutationObserver(check)
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(selector)) }, 4000)
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    check()
  })
}

function reducedMotion(): boolean {
  return document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export async function demonstrateClick(element: HTMLElement, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (!reducedMotion() && element.animate) {
    const style = getComputedStyle(document.documentElement)
    const duration = parseFloat(style.getPropertyValue('--dur-enter')) || 200
    const accent = style.getPropertyValue('--accent').trim()
    const animation = element.animate([
      { transform: 'scale(1)', boxShadow: 'none' },
      { transform: 'scale(0.97)', boxShadow: `0 0 0 var(--space-1) color-mix(in oklch, ${accent} 30%, transparent)` },
      { transform: 'scale(1)', boxShadow: 'none' },
    ], { duration, easing: 'ease-out' })
    const cancel = () => animation.cancel()
    signal.addEventListener('abort', cancel, { once: true })
    void animation.finished.finally(() => signal.removeEventListener('abort', cancel)).catch(() => undefined)
  }
  signal.throwIfAborted()
  element.click()
}

function waitForTourRemoval(selector: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    const check = () => { if (!findTourTarget(selector)) { cleanup(); resolve() } }
    const observer = new MutationObserver(check)
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(selector)) }, 4000)
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-closed', 'hidden', 'style'] })
    check()
  })
}

/** Scroll only the owning panel, leaving the native title bar and outer document stationary. */
export async function scrollTourTarget(target: HTMLElement, signal: AbortSignal): Promise<void> {
  let scroller = target.parentElement
  while (scroller && scroller !== document.body) {
    if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) break
    scroller = scroller.parentElement
  }
  if (!scroller || scroller === document.body) return
  const bounds = scroller.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const space = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-1')) || 8
  const room = bounds.height - space * 4
  const desired = rect.width > window.innerWidth / 2
    ? bounds.top + space * 2 + room / 2
    : bounds.top + space * 2 + Math.max(0, (room - rect.height) / 2)
  const top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + rect.top - desired))
  if (Math.abs(top - scroller.scrollTop) < 1) return
  scroller.scrollTo({ top, behavior: reducedMotion() ? 'instant' : 'smooth' })
}

export function closeTourList(): void {
  findTourTarget(tourTarget('model-file-options'))?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
}

export function closeTourDialog(): void {
  closeTourList()
  findTourTarget(tourTarget('model-detail-close'))?.click()
}

/** Only these UI openers are automated. Downloads, settings writes and service starts are excluded. */
export async function prepareTourStep(step: TourStep, navigate: (path: string) => void, signal: AbortSignal): Promise<void> {
  const dialog = findTourTarget(tourTarget('model-detail'))
  if (dialog && dialog.dataset.modelFamily !== step.scene) {
    closeTourDialog()
    await waitForTourRemoval(tourTarget('model-detail'), signal)
  }
  if (!step.list) {
    closeTourList()
    await waitForTourRemoval(tourTarget('model-file-options'), signal)
  }
  if (window.location.hash !== step.path) {
    const opener = step.via ? findTourTarget(step.via) : null
    if (opener) { await scrollTourTarget(opener, signal); await demonstrateClick(opener, signal) }
    signal.throwIfAborted()
    if (window.location.hash !== step.path) navigate(step.path)
  }
  if (step.scene && !findTourTarget(tourTarget('model-detail'))) {
    const opener = await waitForTourTarget(tourTarget(`model-family-${step.scene}`), signal)
    await scrollTourTarget(opener, signal)
    await demonstrateClick(opener, signal)
    await waitForTourTarget(`${tourTarget('model-detail')}[data-model-family="${step.scene}"]`, signal)
  }
  if (step.list && !findTourTarget(tourTarget('model-file-options'))) {
    const trigger = await waitForTourTarget(`${tourTarget('model-version')} [aria-haspopup="listbox"]`, signal)
    await demonstrateClick(trigger, signal)
    await waitForTourTarget(tourTarget('model-file-options'), signal)
  }
  const target = await waitForTourTarget(step.target, signal)
  void scrollTourTarget(target, signal)
  signal.throwIfAborted()
}
