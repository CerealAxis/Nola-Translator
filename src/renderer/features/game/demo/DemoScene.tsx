import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ChevronRight, Gamepad2, HelpCircle, SkipForward, Trash2, X } from 'lucide-react'
import artwork from '@/assets/lantern-letters.webp'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { notifyError, notifyInfo } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { characterNames, sampleLine, type SampleLanguage } from './session'
import { sceneText } from './scene-copy'
import './demo-scene.css'

type Line = { original: string; translation: string }
type Capture = 'ocr' | 'once'
export type Region = { x: number; y: number; width: number; height: number }
type Point = Pick<Region, 'x' | 'y'>
type Method = 'periodic' | 'image' | 'trigger'
type SceneProps = {
  onSelectionEnd?: () => void
  simplified?: boolean
  savedRegions?: Region[]
  onRegionsChange?: (regions: Region[]) => void
  source: 'hook' | 'ocr' | 'clipboard'
  gameName?: string
  active: boolean
  paused: boolean
  line: Line
  dialogue?: Line
  showOriginal: boolean
  showTranslation?: boolean
  embedded?: boolean
  embeddedLine?: string
  targetLanguage?: SampleLanguage
  zoom?: number
  fontSize: number
  originalFontSize?: number
  onAdvance: () => void
  onCapture: (kind: Capture, line?: Line) => void
  captureRequest: { id: number; kind: Capture | 'repeat' | 'read' } | null
}

const sceneWidth = 460
const sceneHeight = 208
const dialoguePanel: Region = { x: 22, y: 151, width: 416, height: 48 }
const dialogueArea: Region = { x: 32, y: 153, width: 277, height: 43 }
const questArea: Region = { x: 316, y: 168, width: 112, height: 28 }
const times = ['18:40', '19:15', '19:45', '20:10']
const appointment: Record<SampleLanguage, string> = {
  ja: '待ち合わせ', zh: '碰面时间', 'zh-Hant': '碰面時間', en: 'Meeting time', ko: '만나는 시간',
}
export type SceneToolCommand = 'once-in-place' | 'toggle-region-frame' | 'clear-regions' | 'previous-region' | 'next-region' | 'nearest-region' | 'release-region'
const sceneCommand = 'nola-game-preview-region-command'

export function dispatchDemoSceneTool(action: SceneToolCommand) {
  window.dispatchEvent(new CustomEvent(sceneCommand, { detail: action }))
}

function regionStyle({ x, y, width, height }: Region): CSSProperties {
  return { left: x / sceneWidth * 100 + '%', top: y / sceneHeight * 100 + '%',
    width: width / sceneWidth * 100 + '%', height: height / sceneHeight * 100 + '%' }
}

function scenePoint(event: PointerEvent<Element>): Point | undefined {
  const rect = event.currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = Math.min(rect.right, Math.max(rect.left, event.clientX)) - rect.left
  const y = Math.min(rect.bottom, Math.max(rect.top, event.clientY)) - rect.top
  return { x: x / rect.width * sceneWidth, y: y / rect.height * sceneHeight }
}

function box(from: Point, to: Point): Region {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) }
}

function covers(region: Region, text: Region) {
  const x = text.x + text.width / 2
  const y = text.y + text.height / 2
  return region.x <= x && region.y <= y && region.x + region.width >= x && region.y + region.height >= y
}

function GameDialogueScan({ line, targetLanguage }: { line: Line; targetLanguage: SampleLanguage }) {
  const maskId = useId()
  return <span className="game-demo-dialogue-scan">
    <svg className="game-demo-scan-definitions" width="0" height="0" aria-hidden="true">
      <defs><clipPath id={maskId} clipPathUnits="objectBoundingBox">
        <rect className="screen-scan-reveal" width="1" height="1" />
      </clipPath></defs>
    </svg>
    <span className="game-demo-scan-text" lang="ja">{line.original}</span>
    <span className="game-demo-scan-translation" style={{ clipPath: `url("#${maskId}")` }}>
      <span className="game-demo-scan-text screen-scan-blur" aria-hidden="true">{line.original}</span>
      <span className="game-demo-scan-text" lang={targetLanguage}>{line.translation}</span>
    </span>
    <span className="game-demo-scan-frame screen-scan-frame" aria-hidden="true" />
    <span className="game-demo-scan-line screen-scan-line" aria-hidden="true" />
  </span>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return <div className="game-demo-scene-field"><label htmlFor={id}>{label}</label>
    <Switch id={id} checked={checked} onCheckedChange={onChange}><SwitchThumb /></Switch></div>
}

function NumberField({ label, value, change, min, max, step }: { label: string; value: number; change: (v: number) => void; min: number; max: number; step: number }) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  return <div className="game-demo-scene-field"><label htmlFor={id}>{label}</label>
    <Input id={id} type="number" min={min} max={max} step={step} value={draft ?? value}
      onChange={event => {
        setDraft(event.currentTarget.value)
        if (event.currentTarget.validity.valid && Number.isFinite(event.currentTarget.valueAsNumber)) change(event.currentTarget.valueAsNumber)
      }} onBlur={() => setDraft(null)} /></div>
}

function clockSimilarity(before: string, after: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 68
  canvas.height = 20
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return Number(before === after)
  function pixels(text: string) {
    ctx!.fillStyle = 'white'
    ctx!.fillRect(0, 0, 68, 20)
    ctx!.fillStyle = 'black'
    ctx!.font = '600 15px system-ui'
    ctx!.fillText(text, 6, 16)
    return ctx!.getImageData(0, 0, 68, 20).data.filter((_, i) => i % 4 === 0)
  }
  const a = pixels(before), b = pixels(after)
  const avgA = a.reduce((sum, v) => sum + v, 0) / a.length
  const avgB = b.reduce((sum, v) => sum + v, 0) / b.length
  let varA = 0, varB = 0, cov = 0
  for (let i = 0; i < a.length; i++) {
    varA += (a[i] - avgA) ** 2
    varB += (b[i] - avgB) ** 2
    cov += (a[i] - avgA) * (b[i] - avgB)
  }
  const c1 = (255 * .01) ** 2
  const c2 = (255 * .03) ** 2 * a.length
  return ((2 * avgA * avgB + c1) * (2 * cov + c2)) / ((avgA ** 2 + avgB ** 2 + c1) * (varA + varB + c2))
}

export function DemoScene({ onSelectionEnd, savedRegions, onRegionsChange, simplified = false, source, gameName, active, paused, line, dialogue, showOriginal, showTranslation = true, embedded = false, embeddedLine, targetLanguage = 'zh', zoom = 1, fontSize, originalFontSize, onAdvance, onCapture, captureRequest }: SceneProps) {
  const { language } = useI18n()
  const s = sceneText(language)
  const id = useId()
  const [kind, setKind] = useState<Capture | null>(null)
  const [regions, setRegions] = useState<Region[]>(savedRegions ?? [])
  useEffect(() => { if (savedRegions) setRegions(savedRegions) }, [savedRegions])
  const [once, setOnce] = useState<Region | null>(null)
  const [placeOnce, setPlaceOnce] = useState(false)
  const [temporaryRegion, setTemporaryRegion] = useState<Region | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [draft, setDraft] = useState<Region | null>(null)
  const [multi, setMulti] = useState(false)
  const [inPlace, setInPlace] = useState(false)
  const [borders, setBorders] = useState(true)
  const [method, setMethod] = useState<Method>('periodic')
  const [period, setPeriod] = useState(1.5)
  const [direction, setDirection] = useState<'auto' | 'horizontal' | 'vertical'>('auto')
  const [merge, setMerge] = useState(true)
  const [distance, setDistance] = useState(.4)
  const [stability, setStability] = useState(.5)
  const [triggerStability, setTriggerStability] = useState(.95)
  const [similarity, setSimilarity] = useState(.95)
  const [textDifference, setTextDifference] = useState(3)
  const [triggerDelay, setTriggerDelay] = useState(0)
  const [frame, setFrame] = useState(0)
  const drag = useRef<{ start: Point; pointerId: number } | null>(null)
  const pointer = useRef<Point>({ x: sceneWidth / 2, y: sceneHeight / 2 })
  const handled = useRef<number | null>(null)
  const dialogueButton = useRef<HTMLButtonElement>(null)
  const time = times[frame % times.length]
  const dialogueLine = dialogue ?? sampleLine(0, 'ja', targetLanguage)
  const separator = merge && distance * 11 >= 3 ? ' ' : '\n'
  const dialogueOcr = { original: characterNames.ja + separator + dialogueLine.original, translation: characterNames[targetLanguage] + separator + dialogueLine.translation }
  const questLine = { original: appointment.ja + ' ' + time, translation: appointment[targetLanguage] + ' ' + time }
  const gameText = [{ region: dialogueArea, line: dialogueOcr }, { region: questArea, line: questLine }]

  function recognize(areas: Region[], capture: Capture, reportEmpty = true) {
    const matched = gameText.filter(item => areas.some(area => covers(area, item.region)))
    if (direction === 'vertical') matched.sort((a, b) => b.region.x - a.region.x)
    if (matched.length) onCapture(capture, {
      original: matched.map(item => item.line.original).join('\n'),
      translation: matched.map(item => item.line.translation).join('\n'),
    })
    else if (reportEmpty) notifyInfo(s('noText'))
  }
  const recognizeNow = useRef(recognize)
  useEffect(() => { recognizeNow.current = recognize })

  useEffect(() => {
    drag.current = null
    setKind(null)
    setDraft(null)
    setTemporaryRegion(null)
  }, [source])

  useEffect(() => {
    const onTool = (event: Event) => {
      const command = (event as CustomEvent<SceneToolCommand>).detail
      if (command === 'once-in-place') {
        drag.current = null
        setPlaceOnce(true)
        setKind('once')
        setDraft(null)
        setTemporaryRegion(null)
        return
      }
      if (source !== 'ocr') return
      if (command === 'toggle-region-frame') setBorders(current => !current)
      else if (command === 'clear-regions') { setRegions([]); setFocus(null) }
      else if (command === 'release-region') setFocus(null)
      else if (regions.length) {
        if (command === 'nearest-region') {
          const distances = regions.map(r => Math.hypot(r.x + r.width / 2 - pointer.current.x, r.y + r.height / 2 - pointer.current.y))
          setFocus(distances.indexOf(Math.min(...distances)))
        } else if (command === 'next-region') {
          setFocus(current => ((current ?? -1) + 1) % regions.length)
        } else if (command === 'previous-region') {
          setFocus(current => ((current ?? 0) - 1 + regions.length) % regions.length)
        }
      }
    }
    window.addEventListener(sceneCommand, onTool)
    return () => window.removeEventListener(sceneCommand, onTool)
  }, [regions, source])

  useEffect(() => {
    if (!captureRequest || captureRequest.id === handled.current) return
    handled.current = captureRequest.id
    drag.current = null
    setDraft(null)
    setPlaceOnce(false)
    setTemporaryRegion(null)
    if (captureRequest.kind === 'repeat') {
      setKind(null)
      if (once) recognizeNow.current([once], 'once')
      else notifyInfo(s('noLast'))
    } else if (captureRequest.kind === 'read') {
      if (!regions.length) setKind('ocr')
      else { setKind(null); recognizeNow.current(regions, 'ocr') }
    } else setKind(captureRequest.kind)
  }, [captureRequest, once, regions, s])

  useEffect(() => {
    if (kind) dialogueButton.current?.focus({ preventScroll: false })
  }, [kind])

  const previousFrame = useRef(frame)
  useEffect(() => {
    if (previousFrame.current === frame) return
    if (!active || paused || source !== 'ocr' || !regions.length || kind) {
      previousFrame.current = frame
      return
    }
    const delay = method === 'periodic' ? period * 1000 : method === 'trigger' ? triggerDelay * 1000 : 0
    const timer = window.setTimeout(() => {
      const before = times[previousFrame.current % times.length]
      previousFrame.current = frame
      if (method === 'image' && (stability >= 1 || clockSimilarity(before, time) > similarity)) return
      if (method === 'trigger' && triggerStability >= 1) return
      if ([...time].filter((digit, i) => before[i] !== digit).length < textDifference) return
      const selected = focus === null ? regions : regions.slice(focus, focus + 1)
      if (selected.some(region => covers(region, questArea))) recognizeNow.current(selected, 'ocr', false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [frame, active, paused, source, kind, regions, method, period, focus, triggerDelay, stability, triggerStability, similarity, textDifference, time])

  function cancel() {
    onSelectionEnd?.()
    drag.current = null
    setDraft(null)
    setKind(null)
  }
  function confirm() {
    if (!kind || !draft) return
    const areas = kind === 'ocr' && multi ? [...regions, draft] : [draft]
    if (kind === 'once') {
      setOnce(draft)
      if (placeOnce) setTemporaryRegion(draft)
    } else { setRegions(areas); onRegionsChange?.(areas); setFocus(null) }
    recognize(areas, kind)
    cancel()
  }
  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== drag.current?.pointerId) return
    const point = scenePoint(event)
    const region = point && box(drag.current.start, point)
    drag.current = null
    setDraft(region && region.width >= 2 && region.height >= 2 ? region : null)
  }
  const showRegions = source === 'ocr' && borders
  const inlineRegions = temporaryRegion ? [temporaryRegion] : active && source === 'ocr' && inPlace ? regions : []
  const showInPlace = !kind && inlineRegions.length > 0
  const inlineDialogue = showInPlace && inlineRegions.some(area => covers(area, dialogueArea))
  const inlineQuest = showInPlace && inlineRegions.some(area => covers(area, questArea))
  const embedLine = embedded && source === 'hook' && active
  const legacyEmbedded = embedLine && embeddedLine === undefined
  const animateDialogue = !active && !kind && !showInPlace && !line.original && !line.translation && showTranslation
    && dialogueLine.original !== dialogueLine.translation
  const gameNameLabel = gameName || 'Lantern Letters'
  const drawOriginal = showOriginal && !!line.original
  const drawTranslation = (showTranslation || legacyEmbedded) && !!line.translation
  return <div className="game-demo-scene-content" onKeyDown={event => {
    if (event.key === 'Escape' && kind) { event.stopPropagation(); cancel() }
  }}>
    <Card data-slot="game-demo-scene" aria-label={s('preview')}><CardContent>
      <div className="screen-scene-window">
        <div className="screen-scene-titlebar game-demo-titlebar"><Gamepad2 aria-hidden="true" /><span>{gameNameLabel}</span>
          {active && !kind && source !== 'clipboard' && <div className="game-demo-titlebar-action">
            <Button variant="bare" size="icon-xs" disabled={paused}
              aria-label={s(source === 'ocr' ? 'nextTime' : 'next')} tooltip={s(source === 'ocr' ? 'nextTime' : 'next')}
              onClick={() => source === 'ocr' ? setFrame(value => value + 1) : onAdvance()}><SkipForward /></Button>
          </div>}
        </div>
        <div className="screen-scene-game game-demo-scene-canvas" data-game-title={gameNameLabel} data-screenshot-error={s('shotFailed')} style={{ '--game-scene-zoom': zoom } as CSSProperties}
          onPointerMove={event => { const point = scenePoint(event); if (point) pointer.current = point }}>
          <img className="game-demo-artwork" src={artwork} alt={s('scene')} draggable={false} />
          <div className="game-demo-dialogue-panel" style={regionStyle(dialoguePanel)} aria-hidden="true" />
          {(source === 'ocr' || kind || inlineQuest) && <div className="game-demo-game-text game-demo-quest" style={regionStyle(questArea)}
            lang={inlineQuest ? targetLanguage : 'ja'}>
            <span className={inlineQuest ? 'game-demo-in-place' : undefined}>{inlineQuest ? questLine.translation : questLine.original}</span>
          </div>}
          <div className="game-demo-game-text game-demo-game-dialogue" style={regionStyle(dialogueArea)}
            lang={inlineDialogue || embedLine && embeddedLine !== undefined ? targetLanguage : 'ja'}>
            <b>{inlineDialogue ? characterNames[targetLanguage] : characterNames.ja}</b>
            {animateDialogue ? <GameDialogueScan key={targetLanguage + dialogueLine.original} line={dialogueLine} targetLanguage={targetLanguage} />
              : <span className={inlineDialogue ? 'game-demo-in-place' : undefined}>
                {inlineDialogue ? dialogueLine.translation
                  : (embedLine ? embeddedLine ?? dialogueLine.original : dialogueLine.original)}
              </span>}
          </div>
          <svg className="game-demo-scene-layer" viewBox={`0 0 ${sceneWidth} ${sceneHeight}`} preserveAspectRatio="none" aria-hidden="true" data-selecting={Boolean(kind)}
            onPointerDown={event => {
              if (!kind || event.button !== 0 || drag.current) return
              const start = scenePoint(event)
              if (!start) return
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { start, pointerId: event.pointerId }
              setDraft(null)
            }}
            onPointerMove={event => {
              if (drag.current?.pointerId !== event.pointerId) return
              const point = scenePoint(event)
              if (point) setDraft(box(drag.current.start, point))
            }} onPointerUp={finishDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>
            {showRegions && regions.map((region, i) => <rect key={i} {...region} data-focused={focus === i} className="game-demo-region" />)}
            {kind && draft && <rect {...draft} className="game-demo-region game-demo-region-draft" />}
          </svg>
          {!kind && !showInPlace && <div className="game-demo-captions">
            {(drawOriginal || drawTranslation) && <div className="game-demo-caption" data-embedded={legacyEmbedded} style={{ fontSize }}>
              {drawOriginal && <span style={originalFontSize ? { fontSize: originalFontSize } : undefined}>{line.original}</span>}
              {drawTranslation && <strong lang={targetLanguage}>{line.translation}</strong>}
            </div>}
          </div>}
          {temporaryRegion && !kind && <Button className="game-demo-close-inline" variant="outline" size="icon-sm"
            aria-label={s('closeInline')} tooltip={s('closeInline')} onClick={() => setTemporaryRegion(null)}><X /></Button>}
          <div id="game-demo-subtitle-tools" hidden={!active || !!kind || source === 'hook' && !line.original && !line.translation && !(embedLine && embeddedLine)} />
        </div>
      </div>
    </CardContent></Card>
      {kind && <div className="game-demo-scene-actions" role="group" aria-label={s(kind === 'once' ? 'once' : 'ongoing')}>
        <span className="type-small">{s(kind === 'once' ? 'once' : 'ongoing')}</span>
        <Button variant="bare" size="icon-sm" aria-label={s('drag')} tooltip={s('drag')}><HelpCircle /></Button>
        <Button ref={dialogueButton} variant="outline" size="sm" aria-pressed={draft === dialogueArea} onClick={() => setDraft(dialogueArea)}>{s('dialogue')}</Button>
        <Button variant="outline" size="sm" aria-pressed={draft === questArea} onClick={() => setDraft(questArea)}>{s('quest')}</Button>
        <Button size="sm" disabled={!draft} onClick={confirm}>{s('confirm')}</Button>
        <Button variant="outline" size="sm" onClick={cancel}>{s('cancel')}</Button>
      </div>}
      {source === 'ocr' && !simplified && <details className="game-demo-sheet">
        <summary><ChevronRight aria-hidden="true" />{s('regions')}</summary>
        <div className="game-demo-region-settings">
          <div className="game-demo-scene-field"><label htmlFor={id + '-direction'}>{s('direction')}</label>
            <Select value={direction} items={(['auto', 'horizontal', 'vertical'] as const).map(value => ({ value, label: s(value) }))}
              onValueChange={value => { if (value) setDirection(value) }}>
              <SelectTrigger id={id + '-direction'} size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(['auto', 'horizontal', 'vertical'] as const).map(value => <SelectItem key={value} value={value}>{s(value)}</SelectItem>)}</SelectContent>
            </Select></div>
          <Toggle label={s('merge')} checked={merge} onChange={setMerge} />
          {merge && <NumberField label={s('distance')} value={distance} change={setDistance} min={0} max={3} step={.01} />}
          <Toggle label={s('multi')} checked={multi} onChange={value => {
            setMulti(value)
            if (!value) { setRegions(current => current.slice(-1)); setFocus(null) }
          }} />
          <Toggle label={s('inPlace')} checked={inPlace} onChange={setInPlace} />
          <Toggle label={s('borders')} checked={borders} onChange={setBorders} />
          <div className="game-demo-scene-field"><label htmlFor={id + '-method'}>{s('execution')}</label>
            <Select value={method} items={(['periodic', 'image', 'trigger'] as const).map(value => ({ value, label: s(value) }))}
              onValueChange={value => { if (value) setMethod(value) }}>
              <SelectTrigger id={id + '-method'} size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(['periodic', 'image', 'trigger'] as const).map(value => <SelectItem key={value} value={value}>{s(value)}</SelectItem>)}</SelectContent>
            </Select></div>
          {method === 'periodic' && <NumberField label={s('period')} value={period} change={setPeriod} min={.1} max={100} step={.1} />}
          {method === 'trigger' && <NumberField label={s('delay')} value={triggerDelay} change={setTriggerDelay} min={0} max={100} step={.1} />}
          {method !== 'periodic' && <NumberField label={s('stability')} value={method === 'image' ? stability : triggerStability}
            change={method === 'image' ? setStability : setTriggerStability} min={0} max={1} step={.001} />}
          {method === 'image' && <NumberField label={s('similarity')} value={similarity} change={setSimilarity} min={0} max={1} step={.001} />}
          <NumberField label={s('textDifference')} value={textDifference} change={setTextDifference} min={0} max={100000} step={1} />
          <Button variant="outline" size="sm" disabled={!regions.length} onClick={() => dispatchDemoSceneTool('clear-regions')}><Trash2 />{s('clear')}</Button>
        </div>
      </details>}
  </div>
}

function paintHtmlBox(ctx: CanvasRenderingContext2D, box: HTMLElement, scene: DOMRect, exclude?: string) {
  const bounds = box.getBoundingClientRect()
  const x = bounds.left - scene.left
  const y = bounds.top - scene.top
  const style = getComputedStyle(box)
  ctx.save()
  ctx.fillStyle = style.backgroundColor
  ctx.beginPath()
  ctx.roundRect(x, y, bounds.width, bounds.height, parseFloat(style.borderTopLeftRadius) || 0)
  ctx.fill()
  ctx.clip()
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parent = node.parentElement
    if (!parent || (exclude && parent.closest(exclude))) continue
    const font = getComputedStyle(parent)
    ctx.font = [font.fontWeight, font.fontSize, font.fontFamily].join(' ')
    ctx.fillStyle = font.color
    ctx.globalAlpha = Number(font.opacity)
    ctx.filter = font.filter
    ctx.textBaseline = 'middle'
    let offset = 0
    for (const character of node.data) {
      range.setStart(node, offset)
      offset += character.length
      range.setEnd(node, offset)
      const glyph = range.getBoundingClientRect()
      if (glyph.top >= bounds.bottom) break
      if (glyph.bottom > bounds.top && glyph.width) ctx.fillText(character, glyph.left - scene.left, glyph.top - scene.top + glyph.height / 2)
    }
  }
  ctx.restore()
}

function paintDialogueScan(ctx: CanvasRenderingContext2D, scene: HTMLElement, bounds: DOMRect) {
  const reveal = scene.querySelector<HTMLElement>('.game-demo-scan-translation')
  const mask = scene.querySelector<SVGRectElement>('.game-demo-scan-definitions .screen-scan-reveal')
  if (!reveal || !mask) return
  const transform = getComputedStyle(mask).transform
  const visible = transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).d
  const rect = reveal.getBoundingClientRect()
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height * visible)
  ctx.clip()
  paintHtmlBox(ctx, reveal, bounds)
  ctx.restore()
}

export async function captureDemoSceneScreenshot(scale = 1): Promise<Blob> {
  const scene = document.querySelector<HTMLElement>('.game-demo-scene-canvas')
  const image = scene?.querySelector<HTMLImageElement>('.game-demo-artwork')
  const bounds = scene?.getBoundingClientRect()
  if (!scene || !image || !bounds?.width || !bounds.height) throw new Error('Game scene unavailable')
  await image.decode()
  const canvas = document.createElement('canvas')
  const ratio = Number.isFinite(scale) && scale > 0 ? scale : 1
  canvas.width = Math.max(1, Math.round(bounds.width * ratio))
  canvas.height = Math.max(1, Math.round(bounds.height * ratio))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.scale(canvas.width / bounds.width, canvas.height / bounds.height)
  const artworkBounds = image.getBoundingClientRect()
  const cover = Math.max(artworkBounds.width / image.naturalWidth, artworkBounds.height / image.naturalHeight)
  const width = image.naturalWidth * cover
  const height = image.naturalHeight * cover
  const [x, y] = getComputedStyle(image).objectPosition.split(' ').map(parseFloat)
  ctx.drawImage(image,
    artworkBounds.left - bounds.left + (artworkBounds.width - width) * x / 100,
    artworkBounds.top - bounds.top + (artworkBounds.height - height) * y / 100,
    width, height)
  scene.querySelectorAll<HTMLElement>('.game-demo-dialogue-panel, .game-demo-game-text')
    .forEach(box => paintHtmlBox(ctx, box, bounds, '.game-demo-scan-translation'))
  paintDialogueScan(ctx, scene, bounds)
  scene.querySelectorAll<SVGRectElement>('.game-demo-region').forEach(region => {
    const rect = region.getBoundingClientRect()
    const style = getComputedStyle(region)
    const x = rect.left - bounds.left
    const y = rect.top - bounds.top
    ctx.fillStyle = style.fill
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = parseFloat(style.strokeWidth)
    ctx.setLineDash(style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[, ]+/).map(parseFloat))
    ctx.fillRect(x, y, rect.width, rect.height)
    ctx.strokeRect(x, y, rect.width, rect.height)
  })
  scene.querySelectorAll<HTMLElement>('.game-demo-caption').forEach(caption => {
    if (getComputedStyle(caption).visibility !== 'hidden') paintHtmlBox(ctx, caption, bounds)
  })
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'))
}

export async function saveDemoSceneScreenshot(scale = 1): Promise<void> {
  const scene = document.querySelector<HTMLElement>('.game-demo-scene-canvas')
  try {
    const blob = await captureDemoSceneScreenshot(scale)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const title = scene?.dataset.gameTitle?.replace(/[<>:"/\\|?*]/g, '-')
    link.download = (title || 'Game') + '-' + Date.now() + '.png'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    notifyError(scene?.dataset.screenshotError || 'Could not save the current scene')
  }
}
