import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type {
  ComicMaskStroke,
  ComicPage,
  ComicRegion,
} from '../../../shared/comic'
import {
  comicRegionStyle,
  useComicImage,
  comicApi,
  comicSaving,
  comicTextQuad,
  comicWithTextQuad,
} from './comic-data'
import { validComicQuad } from '../../../shared/comic'
import { useComicPrototypeText } from './comic-prototype-copy'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

export type ComicCanvasTool =
  'select' | 'add' | 'repair' | 'restore' | 'perspective'
interface CanvasProps {
  projectId: string
  page: ComicPage
  original?: boolean
  editable?: boolean
  selected: string[]
  tool?: ComicCanvasTool
  brushSize?: number
  onSelect: (id: string, multiple: boolean) => void
  onRegion: (region: ComicRegion) => void
  onMask: (stroke: ComicMaskStroke) => void
}
type Gesture = {
  pointerId: number
  start: [number, number]
  kind: 'move' | 'resize' | 'add' | 'repair' | 'restore' | 'perspective'
  corner?: number
  region?: ComicRegion
  points: [number, number][]
}

export function ComicBubbleCanvas({
  projectId,
  page,
  original = false,
  editable = false,
  selected,
  tool = 'select',
  brushSize = 24,
  onSelect,
  onRegion,
  onMask,
}: CanvasProps) {
  const p = useComicPrototypeText()
  const { t } = useI18n()
  useEffect(() => {
    if (typeof FontFace === 'undefined' || !document.fonts) return
    let active = true
    const families = [
      ...new Set(
        page.regions
          .map((region) => region.style.fontFamily)
          .filter((family): family is string => !!family),
      ),
    ]
    for (const family of families) {
      if (document.fonts.check(`12px ${JSON.stringify(family)}`)) continue
      void comicApi()
        .readFont(family)
        .then(async (url) => {
          const font = await new FontFace(
            family,
            `url(${JSON.stringify(url)})`,
          ).load()
          if (active) document.fonts.add(font)
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [page.regions])
  const root = useRef<HTMLDivElement>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
  useEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setDisplayWidth(element.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraftState] = useState<ComicRegion | null>(null)
  const draftRef = useRef<ComicRegion | null>(null)
  const setDraft = (value: ComicRegion | null) => {
    draftRef.current = value
    setDraftState(value)
  }
  const liveText =
    editable && (!!draft || comicSaving(projectId) || !page.hasRendered)
  const kind = original
    ? 'source'
    : liveText
      ? page.hasClean
        ? 'clean'
        : 'source'
      : page.hasRendered
        ? 'rendered'
        : page.hasClean
          ? 'clean'
          : 'source'
  const image = useComicImage(projectId, page, kind)
  const [points, setPoints] = useState<[number, number][]>([])
  const point = (event: PointerEvent): [number, number] => {
    const rect = root.current!.getBoundingClientRect()
    return [
      Math.max(
        0,
        Math.min(
          page.width,
          ((event.clientX - rect.left) / rect.width) * page.width,
        ),
      ),
      Math.max(
        0,
        Math.min(
          page.height,
          ((event.clientY - rect.top) / rect.height) * page.height,
        ),
      ),
    ]
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const hit = (event.target as Element).closest<HTMLElement>(
      '[data-comic-region]',
    )
    if (hit && (tool === 'select' || tool === 'perspective'))
      onSelect(hit.dataset.comicRegion!, event.shiftKey)
    if (!editable) return
    const position = point(event)
    const region = page.regions.find(
      (item) => item.id === hit?.dataset.comicRegion,
    )
    const kind =
      tool === 'select' || tool === 'perspective'
        ? region
          ? (event.target as Element).closest('[data-comic-corner]')
            ? 'perspective'
            : (event.target as Element).hasAttribute('data-resize')
              ? 'resize'
              : 'move'
          : null
        : tool
    if (!kind) return
    event.preventDefault()
    root.current?.setPointerCapture(event.pointerId)
    gesture.current = {
      pointerId: event.pointerId,
      start: position,
      kind,
      corner: Number(
        (event.target as Element).closest<HTMLElement>('[data-comic-corner]')
          ?.dataset.comicCorner,
      ),
      region,
      points: [position],
    }
    if (kind === 'repair' || kind === 'restore') setPoints([position])
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const position = point(event),
      dx = position[0] - active.start[0],
      dy = position[1] - active.start[1]
    if (active.kind === 'repair' || active.kind === 'restore') {
      active.points.push(position)
      setPoints([...active.points])
      return
    }
    if (
      active.kind === 'perspective' &&
      active.region &&
      active.corner !== undefined
    ) {
      const quad = comicTextQuad(active.region)
      quad[active.corner] = position
      if (validComicQuad(quad)) setDraft(comicWithTextQuad(active.region, quad))
      return
    }
    if (active.kind === 'add') {
      setDraft({
        id: 'drawing',
        sourceText: '',
        targetText: '',
        x: Math.min(position[0], active.start[0]),
        y: Math.min(position[1], active.start[1]),
        width: Math.abs(dx),
        height: Math.abs(dy),
        confidence: null,
        ignored: false,
        locked: false,
        style: {
          autoFont: true,
          autoFontSize: true,
          autoLineSpacing: true,
          autoAlign: true,
          autoBlockAlign: true,
          fontSize: 23,
          color: '#222222',
          direction: 'vertical-rl',
          align: 'center',
        },
        qa: [],
      })
    } else if (active.region) {
      const region = active.region
      const next =
        active.kind === 'move'
          ? {
              ...region,
              x: Math.round(
                Math.max(0, Math.min(page.width - region.width, region.x + dx)),
              ),
              y: Math.round(
                Math.max(
                  0,
                  Math.min(page.height - region.height, region.y + dy),
                ),
              ),
            }
          : {
              ...region,
              width: Math.round(
                Math.max(
                  24,
                  Math.min(page.width - region.x, region.width + dx),
                ),
              ),
              height: Math.round(
                Math.max(
                  24,
                  Math.min(page.height - region.y, region.height + dy),
                ),
              ),
            }
      if (region.textQuad) {
        next.textQuad = region.textQuad.map(([x, y]) =>
          active.kind === 'move'
            ? [x + next.x - region.x, y + next.y - region.y]
            : [
                region.x + ((x - region.x) * next.width) / region.width,
                region.y + ((y - region.y) * next.height) / region.height,
              ],
        )
      }
      setDraft(next)
    }
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    const currentDraft = draftRef.current
    if (event.type !== 'pointercancel') {
      if (active.kind === 'repair' || active.kind === 'restore')
        onMask({
          id: crypto.randomUUID(),
          mode: active.kind === 'repair' ? 'erase' : 'restore',
          size: brushSize,
          points: active.points,
        })
      else if (
        currentDraft &&
        currentDraft.width >= 12 &&
        currentDraft.height >= 12
      )
        onRegion(
          active.kind === 'add'
            ? { ...currentDraft, id: crypto.randomUUID() }
            : currentDraft,
        )
    }
    setDraft(null)
    setPoints([])
  }
  const regions = page.regions.map((region) =>
    draft?.id === region.id ? draft : region,
  )
  if (draft?.id === 'drawing') regions.push(draft)
  return (
    <div
      ref={root}
      className="comic-bubble-canvas"
      data-tool={editable ? tool : 'view'}
      style={{ aspectRatio: `${page.width} / ${page.height}` }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {image.src ? (
        <img
          src={image.src}
          alt={`${page.name} · ${original ? p('source') : p('result')}`}
          draggable={false}
        />
      ) : (
        <div className="comic-bubble-canvas__loading" aria-busy={!image.failed}>
          {image.failed ? (
            <Button variant="outline" onClick={image.retry}>
              {t('suite.retry')}
            </Button>
          ) : (
            <Spinner />
          )}
        </div>
      )}
      {!original && (
        <svg
          className="comic-bubble-canvas__masks"
          viewBox={`0 0 ${page.width} ${page.height}`}
          aria-hidden="true"
        >
          {!!points.length && (
            <polyline
              points={points.map((position) => position.join(',')).join(' ')}
              fill="none"
              stroke="var(--nola-ui-primary)"
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".4"
            />
          )}
        </svg>
      )}
      {regions
        .filter((region) => editable && !region.ignored)
        .map((region, index) => (
          <button
            key={region.id}
            type="button"
            className="comic-bubble-canvas__region"
            data-comic-region={region.id}
            data-selected={editable && selected.includes(region.id)}
            aria-label={`${p('bubble')} ${index + 1}`}
            aria-pressed={editable && selected.includes(region.id)}
            style={comicRegionStyle(page, region, displayWidth)}
            onClick={(event) => {
              if (event.detail === 0) onSelect(region.id, event.shiftKey)
            }}
          >
            {!original && liveText && (
              <span
                className="comic-bubble-canvas__text"
                style={{
                  fontFamily: region.style.autoFont
                    ? (region.resolvedLayout?.fontFamily ??
                      region.style.fontFamily)
                    : region.style.fontFamily,
                  fontSize: `${((region.style.autoFontSize ? (region.resolvedLayout?.fontSize ?? region.style.fontSize) : region.style.fontSize) / page.width) * 100}cqw`,
                  color: region.style.color,
                  writingMode:
                    region.style.direction === 'vertical-rl'
                      ? 'vertical-rl'
                      : 'horizontal-tb',
                  textAlign: region.style.autoAlign
                    ? (region.resolvedLayout?.align ?? 'center')
                    : region.style.align,
                  lineHeight: region.style.autoLineSpacing
                    ? (region.resolvedLayout?.lineSpacing ?? 1.15)
                    : (region.style.lineSpacing ?? 1.4),
                  WebkitTextStroke: `${((region.style.strokeWidth ?? 0) / page.width) * 100}cqw ${region.style.strokeColor ?? '#ffffff'}`,
                }}
              >
                {region.targetText ?? ''}
              </span>
            )}
            {editable && (
              <>
                <span className="comic-bubble-canvas__number">{index + 1}</span>
                {selected.includes(region.id) && tool !== 'perspective' && (
                  <span className="comic-bubble-canvas__handle" data-resize />
                )}
              </>
            )}
          </button>
        ))}
      {editable &&
        tool === 'perspective' &&
        regions
          .filter((region) => selected.includes(region.id))
          .flatMap((region) =>
            comicTextQuad(region).map(([x, y], corner) => (
              <Button
                key={`${region.id}-${corner}`}
                variant="bare"
                size="icon-sm"
                className="comic-bubble-canvas__corner"
                data-comic-region={region.id}
                data-comic-corner={corner}
                aria-label={`${p('perspectiveCorner')} ${corner + 1}`}
                style={{
                  left: `${(x / page.width) * 100}%`,
                  top: `${(y / page.height) * 100}%`,
                }}
                onKeyDown={(event) => {
                  const deltas: Record<string, [number, number]> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  }
                  const delta = deltas[event.key]
                  if (!delta) return
                  event.preventDefault()
                  event.stopPropagation()
                  const quad = comicTextQuad(region),
                    step = event.shiftKey ? 10 : 1
                  quad[corner] = [
                    Math.max(0, Math.min(page.width, x + delta[0] * step)),
                    Math.max(0, Math.min(page.height, y + delta[1] * step)),
                  ]
                  if (validComicQuad(quad))
                    onRegion(comicWithTextQuad(region, quad))
                }}
              />
            )),
          )}
    </div>
  )
}

export function ComicFrontendImage({
  projectId,
  page,
  kind = 'rendered',
}: {
  projectId: string
  page: ComicPage
  kind?: 'source' | 'clean' | 'rendered'
}) {
  const image = useComicImage(projectId, page, kind, 400_000)
  return image.src ? (
    <img src={image.src} alt={page.name} />
  ) : image.failed ? null : (
    <Spinner />
  )
}
