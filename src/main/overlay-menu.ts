import { BrowserWindow, screen } from 'electron'
import { LANGUAGE_MENU_MAX_HEIGHT, LANGUAGE_MENU_SCREEN_FRACTION, OVERLAY_MENU_KINDS } from '../shared/overlay-menu'
import type { OverlayMenuPresentation, OverlayMenuRequest } from '../shared/overlay-menu'
import { resolvePreloadPath } from './window-options'

interface MenuSurface {
  window: BrowserWindow
  loaded: boolean
  presentation: OverlayMenuPresentation | null
  finish: (() => void) | null
  timeout: ReturnType<typeof setTimeout> | null
}

const surfaces = new Map<BrowserWindow, MenuSurface>()
const byWindow = new Map<BrowserWindow, MenuSurface>()
let sequence = 0
/** Match --space-2 in the shared caption stylesheet. */
const INSET = 16
const GAP = 8
const MENU_WIDTH = 260
const CHANGED = 'overlay:menu-changed'

function validRequest(value: unknown): value is OverlayMenuRequest {
  if (!value || typeof value !== 'object') return false
  const { kind, anchor, modality, settings, resources } = value as Partial<OverlayMenuRequest>
  return OVERLAY_MENU_KINDS.some(item => item === kind) && !!anchor && !!settings && Array.isArray(resources)
    && (modality === 'pointer' || modality === 'keyboard')
    && [anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite)
    && anchor.width > 0 && anchor.height > 0
}

function dismiss(surface: MenuSurface): void {
  surface.presentation = null
  if (surface.timeout !== null) clearTimeout(surface.timeout)
  surface.timeout = null
  if (!surface.window.isDestroyed()) {
    surface.window.hide()
    if (surface.loaded) surface.window.webContents.send(CHANGED, null)
  }
  const finish = surface.finish
  surface.finish = null
  finish?.()
}

/** Load one hidden renderer with the caption document, then reuse it without navigation or device queries. */
export function prepareOverlayMenu(owner: BrowserWindow, theme: string): MenuSurface {
  const existing = surfaces.get(owner)
  if (existing && !existing.window.isDestroyed()) return existing
  const menu = new BrowserWindow({
    parent: owner, width: MENU_WIDTH + INSET * 2, height: LANGUAGE_MENU_MAX_HEIGHT + INSET * 2,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    thickFrame: false, resizable: false, movable: false, skipTaskbar: true,
    show: false, fullscreenable: false, minimizable: false, maximizable: false,
    webPreferences: {
      preload: resolvePreloadPath(__dirname), contextIsolation: true,
      sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  })
  const surface: MenuSurface = { window: menu, loaded: false, presentation: null, finish: null, timeout: null }
  surfaces.set(owner, surface)
  byWindow.set(menu, surface)
  menu.setAlwaysOnTop(true, 'screen-saver')
  menu.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  menu.webContents.on('will-navigate', event => event.preventDefault())
  const hide = (): void => dismiss(surface)
  const destroy = (): void => { if (!menu.isDestroyed()) menu.destroy() }
  // A native drag or display change invalidates the trigger rectangle.
  owner.on('hide', hide).on('minimize', hide).on('move', hide).on('resize', hide).on('closed', destroy)
  screen.on('display-metrics-changed', hide)
  menu.on('blur', hide)
  menu.webContents.on('render-process-gone', destroy)
  menu.webContents.on('did-fail-load', destroy)
  menu.webContents.once('did-finish-load', () => {
    surface.loaded = true
    if (surface.presentation) menu.webContents.send(CHANGED, surface.presentation)
  })
  menu.once('closed', () => {
    dismiss(surface)
    surfaces.delete(owner)
    byWindow.delete(menu)
    owner.removeListener('hide', hide).removeListener('minimize', hide)
      .removeListener('move', hide).removeListener('resize', hide).removeListener('closed', destroy)
    screen.removeListener('display-metrics-changed', hide)
  })
  const url = new URL(owner.webContents.getURL())
  url.searchParams.set('overlay', '1')
  url.searchParams.set('overlayMenu', '1')
  url.searchParams.set('theme', theme)
  url.hash = ''
  void menu.loadURL(url.toString()).catch(destroy)
  return surface
}

/** Only position the reused menu surface; never mutate the caption's native bounds. */
export function openOverlayMenu(owner: BrowserWindow, value: unknown, theme: string): Promise<void> {
  if (!validRequest(value) || owner.isDestroyed() || !owner.isVisible()) return Promise.resolve()
  const surface = prepareOverlayMenu(owner, theme)
  dismiss(surface)
  const content = owner.getContentBounds()
  const anchor = { ...value.anchor, x: content.x + value.anchor.x, y: content.y + value.anchor.y }
  const area = screen.getDisplayMatching(anchor).workArea
  if (value.kind === 'confirm') {
    const width = Math.min(332, area.width)
    const height = Math.min(180, area.height)
    const x = Math.max(area.x, Math.min(anchor.x + anchor.width / 2 - width / 2, area.x + area.width - width))
    const y = Math.max(area.y, Math.min(anchor.y + anchor.height / 2 - height / 2, area.y + area.height - height))
    surface.window.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false)
    surface.presentation = { ...value, id: ++sequence, placement: 'bottom', maxHeight: height, triggerX: 0 }
    surface.timeout = setTimeout(() => dismiss(surface), 15_000)
    return new Promise(resolve => {
      surface.finish = resolve
      if (surface.loaded) surface.window.webContents.send(CHANGED, surface.presentation)
    })
  }
  const above = anchor.y - area.y
  const below = area.y + area.height - anchor.y - anchor.height
  const placement = above >= below ? 'top' : 'bottom'
  const maxHeight = Math.max(30, Math.floor(Math.min(
    LANGUAGE_MENU_MAX_HEIGHT, area.height * LANGUAGE_MENU_SCREEN_FRACTION,
    Math.max(above, below) - GAP - INSET * 2,
  )))
  const width = Math.min(area.width, Math.max(MENU_WIDTH, anchor.width) + INSET * 2)
  const height = Math.min(area.height, maxHeight + anchor.height + GAP + INSET * 2)
  const x = Math.max(area.x, Math.min(anchor.x - INSET, area.x + area.width - width))
  const desiredY = placement === 'top' ? anchor.y + anchor.height + INSET - height : anchor.y - INSET
  const y = Math.max(area.y, Math.min(desiredY, area.y + area.height - height))
  surface.window.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.ceil(width), height: Math.ceil(height) }, false)
  surface.presentation = { ...value, id: ++sequence, placement, maxHeight, triggerX: anchor.x - x }
  surface.timeout = setTimeout(() => dismiss(surface), 15_000)
  return new Promise(resolve => {
    surface.finish = resolve
    if (surface.loaded) surface.window.webContents.send(CHANGED, surface.presentation)
  })
}

/** Request ids prevent late paint or exit callbacks from affecting the next menu. */
export function presentOverlayMenu(menu: BrowserWindow | null, id: unknown): void {
  const surface = menu && byWindow.get(menu)
  if (!menu || !surface?.presentation || surface.presentation.id !== id || menu.isDestroyed()) return
  if (surface.timeout !== null) clearTimeout(surface.timeout)
  surface.timeout = null
  menu.show()
}

export function closeOverlayMenu(menu: BrowserWindow | null, id: unknown): void {
  const surface = menu && byWindow.get(menu)
  if (surface?.presentation && surface.presentation.id === id) dismiss(surface)
}
