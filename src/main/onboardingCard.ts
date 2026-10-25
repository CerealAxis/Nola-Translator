import { BrowserWindow, ipcMain, screen, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppSettings } from '../shared/settings'
import type { OnboardingCardPlacement } from '../shared/onboarding-card'
import { parseOnboardingCardAction, parseOnboardingCardRect, parseOnboardingCardState } from '../shared/onboarding-card'
import { resolvePreloadPath } from './window-options'

/**
 * The onboarding teaching card renders in its own transparent child window:
 *   - it can extend past the main viewport, so large spotlights never squeeze it against an edge;
 *   - it stays above modal dialogs inside the main document, which would otherwise inert it;
 *   - it forwards mouse events everywhere except the card itself, so guided clicks still
 *     reach the highlighted control underneath.
 *
 * Geometry is authoritative here: only this module knows the card window's bounds, so it injects
 * `mainOffset` and the screen-clipped `usable` area into every state it forwards.
 */

/** Room for the card around the main viewport: card width is at most ~560px, height ~340px. */
const MARGIN = 340

interface Rect { x: number; y: number; width: number; height: number }

function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) }
}

export interface OnboardingCardHandle {
  stop(): void
}

export function registerOnboardingCard(
  getTheme: () => AppSettings['theme'],
  mainDirectory: string,
  getMainWindow: () => BrowserWindow | null,
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow = options => new BrowserWindow(options),
): OnboardingCardHandle {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const entryUrl = rendererUrl
    ? new URL('onboarding-card.html', rendererUrl)
    : pathToFileURL(join(mainDirectory, '../renderer/onboarding-card.html'))

  let cardWindow: BrowserWindow | null = null
  let placement: OnboardingCardPlacement | null = null
  // The window loads asynchronously; states that arrive before it is ready are kept and replayed,
  // otherwise the very first lesson is dropped and the card stays empty forever.
  let lastState: ReturnType<typeof parseOnboardingCardState> = null
  let cardRect: { x: number; y: number; width: number; height: number } | null = null
  let interactive = false
  // Listeners this module attached to the main window, so a rebuilt card never doubles them up.
  const mainListeners: { event: string; listener: () => void }[] = []

  const isCardWindow = (window: BrowserWindow | null): boolean => !!window && window === cardWindow
  const trustedDocument = (raw: string, cardOnly: boolean): boolean => {
    try {
      const url = new URL(raw)
      if (rendererUrl) return url.origin === new URL(rendererUrl).origin && (!cardOnly || url.pathname === entryUrl.pathname)
      if (url.protocol !== 'file:') return false
      const allowed = cardOnly
        ? [entryUrl.pathname]
        : [entryUrl.pathname, pathToFileURL(join(mainDirectory, '../renderer/index.html')).pathname]
      return allowed.includes(url.pathname)
    } catch {
      return false
    }
  }
  const senderWindow = (sender: Electron.WebContents): BrowserWindow | null => {
    const window = BrowserWindow.fromWebContents(sender)
    return window && !window.isDestroyed() ? window : null
  }

  const detachFromMain = () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) for (const { event, listener } of mainListeners) main.off(event as never, listener)
    mainListeners.length = 0
  }

  const syncBounds = () => {
    const main = getMainWindow()
    if (!cardWindow || cardWindow.isDestroyed() || !main || main.isDestroyed()) return
    const content = main.getContentBounds()
    const bounds = { x: content.x - MARGIN, y: content.y - MARGIN, width: content.width + MARGIN * 2, height: content.height + MARGIN * 2 }
    cardWindow.setBounds(bounds)
    // Screen clipping decides where the card may actually be painted; outside the work area the
    // OS would happily place it, but the user could never see or click it.
    const visible = intersectRect(bounds, screen.getDisplayMatching(content).workArea)
    placement = {
      mainOffset: { x: content.x - bounds.x, y: content.y - bounds.y },
      usable: { x: visible.x - bounds.x, y: visible.y - bounds.y, width: visible.width, height: visible.height },
    }
    cardRect = null
    cardWindow.webContents.send('onboarding-card:placement', placement)
    // Stale card rects would hit-test against pre-move coordinates; clear them until the card
    // reports its new position.
    getMainWindow()?.webContents.send('onboarding-card:rect-forward', { rect: null, mainOffset: placement.mainOffset })
  }

  const setInteractive = (value: boolean) => {
    if (interactive === value || !cardWindow || cardWindow.isDestroyed()) return
    interactive = value
    cardWindow.setIgnoreMouseEvents(!value)
  }

  const replayState = () => {
    if (lastState && placement && cardWindow && !cardWindow.isDestroyed()) {
      cardWindow.webContents.send('onboarding-card:state', { ...lastState, mainOffset: placement.mainOffset, usable: placement.usable })
    }
  }

  const destroyCard = () => {
    detachFromMain()
    if (cardWindow && !cardWindow.isDestroyed()) cardWindow.destroy()
    cardWindow = null
    placement = null
    lastState = null
    cardRect = null
    interactive = false
  }

  const showCard = async () => {
    const main = getMainWindow()
    if (!main || main.isDestroyed()) return
    if (cardWindow && !cardWindow.isDestroyed()) {
      // A previously hidden card may have missed nothing, but pass-through state is window-local.
      interactive = false
      cardWindow.setIgnoreMouseEvents(true)
      syncBounds()
      replayState()
      cardWindow.showInactive()
      return
    }
    const url = new URL(entryUrl)
    url.searchParams.set('theme', getTheme())
    const window = createWindow({
      parent: main,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: resolvePreloadPath(mainDirectory),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    cardWindow = window
    // The card only ever floats above its parent; every other region forwards clicks through.
    window.setIgnoreMouseEvents(true)
    for (const event of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) {
      // Electron types each event overload separately; the loop variable widens past them all.
      main.on(event as never, syncBounds as never)
      mainListeners.push({ event, listener: syncBounds })
    }
    // Hidden or minimized, the main window has nothing to teach over.
    const followVisibility = () => {
      if (!cardWindow || cardWindow.isDestroyed()) return
      const owner = getMainWindow()
      if (!owner || owner.isDestroyed()) return
      if (owner.isVisible() && !owner.isMinimized()) cardWindow.showInactive()
      else cardWindow.hide()
    }
    for (const event of ['hide', 'show'] as const) {
      main.on(event as never, followVisibility as never)
      mainListeners.push({ event, listener: followVisibility })
    }
    const onMainClosed = () => destroyCard()
    main.once('closed', onMainClosed)
    mainListeners.push({ event: 'closed', listener: onMainClosed })
    window.on('closed', () => {
      if (cardWindow === window) {
        cardWindow = null
        placement = null
        cardRect = null
        interactive = false
        detachFromMain()
      }
    })
    try {
      await window.loadURL(url.toString())
      if (cardWindow !== window) return
      syncBounds()
      replayState()
      window.showInactive()
    } catch (error) {
      console.error('[onboarding-card] failed to load the card window', error)
      if (cardWindow === window) destroyCard()
    }
  }

  ipcMain.on('onboarding-card:show', event => {
    if (trustedDocument(event.senderFrame?.url ?? '', false)) void showCard()
  })
  ipcMain.on('onboarding-card:hide', event => {
    if (!trustedDocument(event.senderFrame?.url ?? '', false)) return
    if (cardWindow && !cardWindow.isDestroyed()) cardWindow.hide()
  })
  ipcMain.on('onboarding-card:state', (event, raw) => {
    if (!trustedDocument(event.senderFrame?.url ?? '', false)) return
    const state = parseOnboardingCardState(raw)
    if (!state) return
    lastState = state
    if (!cardWindow || cardWindow.isDestroyed() || !placement) return
    cardWindow.webContents.send('onboarding-card:state', { ...state, mainOffset: placement.mainOffset, usable: placement.usable })
  })
  ipcMain.on('onboarding-card:rect', (event, raw) => {
    if (!isCardWindow(senderWindow(event.sender)) || !trustedDocument(event.senderFrame?.url ?? '', true)) return
    cardRect = parseOnboardingCardRect(raw)
    // The main window maps its own cursor position onto the card rect; it needs both pieces.
    if (placement) getMainWindow()?.webContents.send('onboarding-card:rect-forward', { rect: cardRect, mainOffset: placement.mainOffset })
  })
  ipcMain.on('onboarding-card:action', (event, raw) => {
    if (!isCardWindow(senderWindow(event.sender)) || !trustedDocument(event.senderFrame?.url ?? '', true)) return
    const action = parseOnboardingCardAction(raw)
    if (action) getMainWindow()?.webContents.send('onboarding-tour:action', action)
  })
  ipcMain.on('onboarding-card:hit', (event, raw) => {
    if (!trustedDocument(event.senderFrame?.url ?? '', false)) return
    setInteractive(raw === true)
  })

  return { stop: destroyCard }
}
