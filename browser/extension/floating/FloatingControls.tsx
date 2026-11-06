import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Languages, Pin, PinOff, Settings2, X } from 'lucide-react'
import { Button } from '../../../src/renderer/components/ui/button'
import { Alert, AlertDescription } from '../../../src/renderer/components/ui/alert'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../../src/renderer/components/ui/popover'
import { browserText, errorKey } from '../i18n'
import { NolaLogo } from '../logo'
import type { Preferences } from '../preferences'

export function floatingDock(x: number, y: number, width: number, height: number) {
  return { floatingSide: x < width / 2 ? 'left' as const : 'right' as const, floatingPosition: Math.max(0, Math.min(1, y / Math.max(1, height))) }
}
interface Props {
  preferences: Preferences
  active: boolean
  error?: string
  onTranslate(): void
  onRestore(): void
  onPosition(position: ReturnType<typeof floatingDock>, commit: boolean): void
  onLock(): void
  onHide(scope: 'page' | 'site' | 'all'): void
}
export function FloatingControls({ preferences, active, error, onTranslate, onRestore, onPosition, onLock, onHide }: Props) {
  const [menu, setMenu] = useState(false)
  const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panelError, setPanelError] = useState<string>()
  const [showError, setShowError] = useState(false)
  useEffect(() => { setShowError(Boolean(error)) }, [error])
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = () => { setMenu(false); setShowError(false); setPanelError(undefined) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    const outside = (event: globalThis.PointerEvent) => { if (container.current && !event.composedPath().includes(container.current)) close() }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside) }
  }, [])
  const drag = useRef<{ x: number; y: number; moved: boolean; original: ReturnType<typeof floatingDock> } | undefined>(undefined)
  const suppressClick = useRef(false)
  const t = browserText(preferences.uiLanguage)
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false, original: { floatingSide: preferences.floatingSide, floatingPosition: preferences.floatingPosition } }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current) return
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return
    current.moved = true; suppressClick.current = true; setDragging(true)
    onPosition(floatingDock(event.clientX, event.clientY, innerWidth, innerHeight), false)
  }
  const up = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.moved) onPosition(floatingDock(event.clientX, event.clientY, innerWidth, innerHeight), true)
    drag.current = undefined; setDragging(false)
    setTimeout(() => { suppressClick.current = false }, 0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const toggleTranslation = () => { if (active) onRestore(); else onTranslate() }
  const expanded = hovered || menu || Boolean(panelError) || showError
  const openPanel = () => {
    setPanelError(undefined)
    void chrome.runtime.sendMessage({ type: 'openTranslationPanel' }).then(result => {
      if (!(result as { ok?: boolean })?.ok) setPanelError('openPanelFromToolbar')
    }).catch(() => setPanelError('openPanelFromToolbar'))
  }
  return <div ref={container} className="nola-floating-controls" data-side={preferences.floatingSide} data-expanded={expanded} data-pinned={preferences.floatingLocked} data-dragging={dragging} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false) }}>
    <div className="nola-floating-rail">
      <Button className="nola-floating-tool" variant="outline" size="icon" aria-label={t(active ? 'restorePage' : 'translatePage')} title={t(active ? 'restorePage' : 'translatePage')} onClick={toggleTranslation} data-active={active}><Languages /></Button>
      <div className="nola-floating-main">
        <Button className="nola-floating-trigger" variant="outline" size="icon" aria-label={t(preferences.floatingClickAction === 'panel' ? 'floatingOpenPanel' : active ? 'restorePage' : 'translatePage')} title={t(preferences.floatingClickAction === 'panel' ? 'floatingOpenPanel' : active ? 'restorePage' : 'translatePage')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { if (drag.current?.moved) onPosition(drag.current.original, false); drag.current = undefined; setDragging(false); suppressClick.current = false }} onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return }
          if (preferences.floatingClickAction === 'translate') toggleTranslation()
          else openPanel()
        }}><NolaLogo /></Button>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger render={<Button className="nola-floating-dismiss-trigger" variant="bare" size="icon-xs" aria-label={t('close')} title={t('close')} />}><X /></PopoverTrigger>
          {menuContainer && <PopoverContent container={menuContainer} side={preferences.floatingSide === 'right' ? 'left' : 'right'} align="start" className="nola-floating-popover"><PopoverTitle className="sr-only">{t('close')}</PopoverTitle>
            <Button variant="bare" onClick={() => { setMenu(false); onHide('site') }}>{t('floatingHideSite')}</Button>
            <Button variant="bare" onClick={() => { setMenu(false); onHide('all') }}>{t('floatingHideAll')}</Button>
          </PopoverContent>}
        </Popover>
        <Button className="nola-floating-pin" variant="bare" size="icon-xs" aria-label={t(preferences.floatingLocked ? 'unpinFloating' : 'pinFloating')} title={t(preferences.floatingLocked ? 'unpinFloating' : 'pinFloating')} onClick={onLock}>{preferences.floatingLocked ? <PinOff /> : <Pin />}</Button>
      </div>
      <Button className="nola-floating-tool" variant="outline" size="icon" aria-label={t('settings')} title={t('settings')} onClick={() => window.open(chrome.runtime.getURL('options.html#floatingButton'), '_blank')}><Settings2 /></Button>
    </div>
    <div ref={setMenuContainer} style={{ display: 'contents' }} />
    {(panelError || showError && error) && <div className="nola-floating-notice"><Alert variant="danger"><AlertDescription>{t(errorKey(panelError || error!))}</AlertDescription></Alert><Button variant="outline" size="sm" onClick={() => window.open(chrome.runtime.getURL('options.html#apiProviders'), '_blank')}>{t('apiProviders')}</Button></div>}
  </div>
}
