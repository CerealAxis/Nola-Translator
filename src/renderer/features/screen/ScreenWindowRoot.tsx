import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShortcutKeys } from '@/components/primitives/ShortcutKeys'
import { EDITOR_SHORTCUT_DEFAULTS, matchesShortcut, shortcutFromEvent } from '../../../shared/keyboard-shortcuts'
import { cn } from '@/lib/utils'
import { MAX_SCREEN_REGIONS, type ScreenRegion, type ScreenSnapshot, type ScreenTranslationBridge, type ScreenWindowBootstrap } from '../../../shared/screen-translation'
import { drawnRegion, movedRegion, resizeRegionEdge } from './region-geometry'
import { layoutScreenOverlay, type OverlayLayout } from './overlay-layout'
import { ScreenToolbar } from './ScreenToolbar'
import type { GameTranslationBridge } from '../../../shared/game-translation'
import { GameOverlay } from '../game/GameOverlay'

export function ScreenWindowRoot({ api, gameApi }: { api: ScreenTranslationBridge; gameApi?: GameTranslationBridge }) {
  const query = new URLSearchParams(window.location.search)
  if (query.get('role') === 'game-overlay') return gameApi ? <GameOverlay api={gameApi} sessionId={query.get('sessionId') ?? ''} /> : null
  return <ScreenSurface api={api} />
}

function ScreenSurface({ api }: { api: ScreenTranslationBridge }) {
  const [bootstrap, setBootstrap] = useState<ScreenWindowBootstrap>()
  const [snapshot, setSnapshot] = useState<ScreenSnapshot>()
  useEffect(() => {
    let active = true
    let changed = false
    const dispose = api.onChanged(value => { changed = true; if (active) setSnapshot(value) })
    void api.windowBootstrap().then(value => { if (active) { setBootstrap(value); if (!changed) setSnapshot(value.snapshot) } })
    return () => { active = false; dispose() }
  }, [api])
  if (!bootstrap || !snapshot) return null
  if (bootstrap.role === 'editor') return <ScreenRegionEditor api={api} snapshot={snapshot} />
  if (bootstrap.role === 'toolbar') return <ScreenToolbar api={api} snapshot={snapshot} />
  if (bootstrap.role === 'regions') return <div className="screen-region-highlights">{snapshot.config.regions.map(region => <div key={region.id} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />)}</div>
  return <ScreenOverlay snapshot={snapshot} />
}

type Drag = { id: string; pointerId: number; kind: 'draw' | 'move' | 'resize'; edge?: string; start: { x: number; y: number }; original?: ScreenRegion }
export function ScreenRegionEditor({ api, snapshot }: { api: ScreenTranslationBridge; snapshot: ScreenSnapshot }) {
  const { t } = useI18n()
  const [regions, setRegions] = useState(snapshot.config.regions)
  const [selected, setSelected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const drag = useRef<Drag | undefined>(undefined)
  const surface = useRef<HTMLDivElement>(null)
  const cancel = () => { if (!busy) { setBusy(true); void api.command({ action: 'cancelEdit' }).catch(() => setBusy(false)) } }
  const remove = () => { setRegions(previous => previous.filter(region => region.id !== selected)); setSelected(undefined) }
  const bindings = { ...EDITOR_SHORTCUT_DEFAULTS, ...snapshot.config.editorShortcuts }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (busy || event.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); setBusy(true); void api.command({ action: 'regions', regions }).catch(() => setBusy(false)) }
      else if (matchesShortcut(bindings.cancel, event)) { event.preventDefault(); cancel() }
      else if (matchesShortcut(bindings.remove, event) || bindings.remove === 'Delete' && shortcutFromEvent(event) === 'Backspace') { event.preventDefault(); remove() }
      else if (selected) {
        const motion = ([['fastLeft', -0.01, 0], ['fastRight', 0.01, 0], ['fastUp', 0, -0.01], ['fastDown', 0, 0.01],
          ['left', -0.001, 0], ['right', 0.001, 0], ['up', 0, -0.001], ['down', 0, 0.001]] as const).find(([key]) => matchesShortcut(bindings[key], event))
        if (!motion) return
        event.preventDefault()
        setRegions(previous => previous.map(region => region.id === selected ? movedRegion(region, motion[1], motion[2]) : region))
      }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); if (drag.current && surface.current?.hasPointerCapture(drag.current.pointerId)) surface.current.releasePointerCapture(drag.current.pointerId) }
  }, [selected, busy, regions, snapshot.config.editorShortcuts])
  const point = (event: PointerEvent) => {
    const bounds = surface.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || busy) return
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-region-id]')
    const id = element?.dataset.regionId
    const original = regions.find(region => region.id === id)
    if (!original && regions.length >= MAX_SCREEN_REGIONS) return
    const start = point(event)
    const selectedId = id ?? crypto.randomUUID()
    drag.current = { id: selectedId, pointerId: event.pointerId, edge: (event.target as HTMLElement).dataset.resize, kind: original ? (event.target as HTMLElement).dataset.resize ? 'resize' : 'move' : 'draw', start, original }
    setSelected(selectedId)
    if (!original) setRegions(previous => [...previous, drawnRegion(selectedId, start, start)])
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active) return
    const end = point(event)
    const next = active.kind === 'draw' ? drawnRegion(active.id, active.start, end)
      : active.kind === 'resize' ? resizeRegionEdge(active.original!, end.x - active.start.x, end.y - active.start.y, active.edge!)
        : movedRegion(active.original!, end.x - active.start.x, end.y - active.start.y)
    setRegions(previous => previous.map(region => region.id === active.id ? next : region))
  }
  const up = (event: PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = undefined }
  return <div ref={surface} className="screen-editor" data-slot="screen-region-editor" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {regions.map((region, index) => <div key={region.id} data-region-id={region.id} role="button" tabIndex={0} aria-label={`${t('screen.regions')} ${index + 1}`} aria-pressed={selected === region.id}
      onFocus={() => setSelected(region.id)} className={cn('screen-editor__region', selected === region.id && 'screen-editor__region--selected')}
      style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}>
      {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(edge => <span key={edge} data-resize={edge} className="screen-editor__resize" />)}
    </div>)}
    <div className="screen-editor__toolbar" onPointerDown={event => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{regions.length} / {MAX_SCREEN_REGIONS}</Badge>
        <Button variant="outline" disabled={!selected || busy} onClick={remove}><Trash2 data-icon="inline-start" />{t('screen.remove')}<ShortcutKeys value={bindings.remove} /></Button>
        <Button variant="outline" disabled={!regions.length || busy} onClick={() => { setRegions([]); setSelected(undefined) }}>{t('screen.clear')}</Button>
        <Button variant="outline" disabled={busy} onClick={cancel}><X data-icon="inline-start" />{t('screen.cancel')}<ShortcutKeys value={bindings.cancel} /></Button>
        <Button disabled={!regions.length || busy} onClick={() => { setBusy(true); void api.command({ action: 'regions', regions }).catch(() => setBusy(false)) }}><Check data-icon="inline-start" />{t('screen.confirm')}</Button>
      </div></div>
  </div>
}

function ScreenOverlay({ snapshot }: { snapshot: ScreenSnapshot }) {
  const { config, blocks } = snapshot
  const [layout, setLayout] = useState<OverlayLayout[]>([])
  useLayoutEffect(() => {
    const update = () => {
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!
      const style = getComputedStyle(document.documentElement)
      const font = style.getPropertyValue('--font-ui').trim() || 'sans-serif'
      const padding = Number.parseFloat(style.getPropertyValue('--space-1')) || 8
      setLayout(layoutScreenOverlay(blocks, { width: window.innerWidth, height: window.innerHeight }, config.fontSize, config.showSource,
        (text, size) => { context.font = `${size}px ${font}`; return context.measureText(text).width }, padding, snapshot.captureRegions ?? config.regions))
    }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [blocks, config.fontSize, config.showSource, snapshot.captureRegions, config.regions])
  return <div className="screen-overlay" data-slot="screen-overlay" aria-hidden="true">
    {snapshot.status === 'running' && <>
      {layout.flatMap(block => block.patches?.map((patch, index) => <img key={`${block.id}:${index}`}
        className="screen-overlay__blur" alt="" src={patch.image} style={{
          left: `${patch.x * 100}%`, top: `${patch.y * 100}%`, width: `${patch.width * 100}%`,
          height: `${patch.height * 100}%`, opacity: config.opacity,
        }} />) ?? [])}
      {layout.map(block => <div key={block.id} className="screen-overlay__block" data-overflow={block.overflow || undefined}
        style={{ left: block.x, top: block.y, width: block.width, height: block.height, color: block.ink,
          '--screen-font-size': `${block.fontSize}px`, '--screen-text-padding': `${block.padding}px`,
        } as CSSProperties}>
        <div className="screen-overlay__text" style={{ width: block.textWidth, height: block.textHeight,
          transform: `translate(-50%, -50%) rotate(${block.angle}deg)` }}>
          <p lang={config.targetLanguage} dir="auto">{block.text}</p>
        </div>
      </div>)}
    </>}
  </div>
}
