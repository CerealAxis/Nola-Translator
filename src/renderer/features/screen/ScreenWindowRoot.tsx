import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShortcutKeys } from '@/components/primitives/ShortcutKeys'
import { EDITOR_SHORTCUT_DEFAULTS, matchesShortcut, shortcutFromEvent } from '../../../shared/keyboard-shortcuts'
import { cn } from '@/lib/utils'
import { MAX_SCREEN_REGIONS, type ScreenFrame, ScreenRegion, ScreenSnapshot, ScreenTranslationBridge, ScreenWindowBootstrap } from '../../../shared/screen-translation'
import { drawnRegion, movedRegion, resizeRegionEdge } from './region-geometry'
import { layoutScreenOverlay, visibleScreenBlocks, type OverlayLayout } from './overlay-layout'
import './screen.css'

export function ScreenWindowRoot({ api }: { api: ScreenTranslationBridge }) {
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
  if (bootstrap.role === 'capture') return <ScreenCapture api={api} snapshot={snapshot} />
  if (bootstrap.role === 'editor') return <ScreenRegionEditor api={api} snapshot={snapshot} />
  if (bootstrap.role === 'regions') return <div className="screen-region-highlights">{snapshot.config.regions.map(region => <div key={region.id} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />)}</div>
  return <ScreenOverlay snapshot={snapshot} />
}

function ScreenCapture({ api, snapshot }: { api: ScreenTranslationBridge; snapshot: ScreenSnapshot }) {
  const current = useRef(snapshot)
  current.current = snapshot
  useEffect(() => {
    let regionOffset = 0
    let disposed = false, stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const video = document.createElement('video')
    video.muted = true
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const capture = async () => {
      if (disposed) return
      const state = current.current
      try {
        if (video.videoWidth && video.videoHeight && state.status === 'running') {
          const frame: ScreenFrame = { sessionId: state.sessionId, epoch: state.epoch, width: video.videoWidth, height: video.videoHeight, regions: [] }
          let bytes = 0
          const count = state.config.regions.length
          for (let index = 0; index < Math.min(count, 8); index++) {
            const region = state.config.regions[(regionOffset + index) % count]
            const sx = Math.floor(region.x * video.videoWidth), sy = Math.floor(region.y * video.videoHeight)
            const sw = Math.max(1, Math.floor(region.width * video.videoWidth)), sh = Math.max(1, Math.floor(region.height * video.videoHeight))
            const scale = Math.min(1, 1920 / sw, 1080 / sh)
            canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale))
            context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))
            const hash = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
            const image = canvas.toDataURL('image/png')
            if (bytes + image.length > 32 * 1024 * 1024 && frame.regions.length) break
            bytes += image.length
            frame.regions.push({ regionId: region.id, hash, image })
          }
          regionOffset = count ? (regionOffset + frame.regions.length) % count : 0
          if (!disposed) await api.frame(frame)
        }
      } catch { if (!disposed) await api.captureError().catch(() => {}) }
      finally { if (!disposed) timer = setTimeout(() => { void capture() }, current.current.config.intervalMs) }
    }
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: { ideal: 5, max: 10 } } })
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (!disposed) void api.captureError().catch(() => {}) })
        video.srcObject = stream
        await video.play()
        await capture()
      } catch { if (!disposed) await api.captureError().catch(() => {}) }
    })()
    return () => { disposed = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); video.pause(); video.srcObject = null }
  }, [api, snapshot.config.sourceId])
  return null
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
        (text, size) => { context.font = `${size}px ${font}`; return context.measureText(text).width }, padding, config.regions))
    }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [blocks, config.fontSize, config.showSource])
  return <div className="screen-overlay" data-slot="screen-overlay" aria-hidden="true">
    {snapshot.status === 'running' && visibleScreenBlocks(blocks).filter(block => !block.appearancePending).flatMap(block => block.appearance?.patches ?? []).map((patch, index) => <img key={index} className="screen-overlay__patch" src={patch.image} alt="" style={{ left: `${patch.x * 100}%`, top: `${patch.y * 100}%`, width: `${patch.width * 100}%`, height: `${patch.height * 100}%`, opacity: config.opacity }} />)}
    {snapshot.status === 'running' && layout.map(block => <div key={block.id} className="screen-overlay__block" data-overflow={block.overflow || undefined}
      style={{ left: block.x, top: block.y, width: block.width, height: block.height,
        '--screen-font-size': `${block.fontSize}px`, '--screen-opacity': `${config.opacity * 100}%`, '--screen-text-padding': `${block.padding}px`,
      } as CSSProperties}>
      <div className="screen-overlay__text" style={{ color: blocks.find(item => item.id === block.id)?.appearance?.color, background: blocks.find(item => item.id === block.id)?.appearancePending || blocks.find(item => item.id === block.id)?.appearance?.patches.length ? 'transparent' : blocks.find(item => item.id === block.id)?.appearance?.background, width: block.textWidth, height: block.textHeight, transform: `translate(-50%, -50%) rotate(${block.angle}deg)` }}>
        <p lang={config.targetLanguage} dir="auto">{block.text}</p>
      </div>
    </div>)}
  </div>
}
