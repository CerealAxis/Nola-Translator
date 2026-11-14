import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import type { ComicBridge, ComicDrawingLayer, ComicDrawingStroke } from '../../../shared/comic'
import { comicSelectionParts } from './comicSelection'

function path(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
}

function fill(layer: CanvasRenderingContext2D, sample: CanvasRenderingContext2D, stroke: ComicDrawingStroke) {
  const { width, height } = layer.canvas
  const x = Math.floor(stroke.points[0][0]), y = Math.floor(stroke.points[0][1])
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const pixels = sample.getImageData(0, 0, width, height).data
  const seed = (y * width + x) * 4, tolerance = stroke.tolerance ?? 24
  const mask = layer.createImageData(width, height)
  const color = stroke.color.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16))
  const matches = (index: number) => {
    const offset = index * 4
    return Math.abs(pixels[offset] - pixels[seed]) <= tolerance && Math.abs(pixels[offset + 1] - pixels[seed + 1]) <= tolerance && Math.abs(pixels[offset + 2] - pixels[seed + 2]) <= tolerance && Math.abs(pixels[offset + 3] - pixels[seed + 3]) <= tolerance
  }
  const paint = (index: number) => {
    const offset = index * 4
    mask.data[offset] = color[0]; mask.data[offset + 1] = color[1]; mask.data[offset + 2] = color[2]; mask.data[offset + 3] = 255
  }
  if (stroke.contiguous === false) {
    for (let index = 0; index < width * height; index++) if (matches(index)) paint(index)
  } else {
    const visited = new Uint8Array(width * height), queue = new Uint32Array(width * height)
    let head = 0, tail = 0
    const enqueue = (index: number) => { if (!visited[index]) { visited[index] = 1; queue[tail++] = index } }
    enqueue(y * width + x)
    while (head < tail) {
      const index = queue[head++]
      if (!matches(index)) continue
      paint(index)
      if (index % width) enqueue(index - 1)
      if (index % width < width - 1) enqueue(index + 1)
      if (index >= width) enqueue(index - width)
      if (index < width * (height - 1)) enqueue(index + width)
    }
  }
  const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height
  scratch.getContext('2d')!.putImageData(mask, 0, 0)
  layer.drawImage(scratch, 0, 0)
}

export function ComicDrawingPreview({ layers, width, height, preview }: { layers: ComicDrawingLayer[]; width: number; height: number; preview?: { api: ComicBridge; projectId: string; pageId: string; revision: number; renderScale: number } }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { t } = useI18n()
  const scale = preview && Number.isFinite(preview.renderScale) ? Math.max(0, Math.min(1, preview.renderScale)) : 1
  const pixelWidth = Math.max(1, Math.round(width * scale)), pixelHeight = Math.max(1, Math.round(height * scale))
  useEffect(() => {
    const canvas = ref.current, parent = canvas?.parentElement
    if (!canvas || !parent) return
    if (preview && scale < 1) {
      let live = true
      const renderPreview = async () => {
        const result = canvas.getContext('2d')!
        result.clearRect(0, 0, pixelWidth, pixelHeight)
        for (const layer of layers) {
          if (!layer.visible) continue
          const source = await preview.api.layerImage(preview.projectId, preview.pageId, 'drawing', layer.id, Math.max(10000, Math.min(4000000, pixelWidth * pixelHeight)))
          if (!live) return
          const image = new Image(); image.src = source; await image.decode()
          if (!live) return
          result.save(); result.globalAlpha = layer.opacity; result.drawImage(image, 0, 0, pixelWidth, pixelHeight); result.restore()
        }
      }
      const timer = window.setTimeout(() => { void renderPreview().catch(error => { if (live) { canvas.getContext('2d')?.clearRect(0, 0, pixelWidth, pixelHeight); notifyError(t('suite.actionFailed'), { cause: error }) } }) }, 120)
      return () => { live = false; window.clearTimeout(timer) }
    }
    const render = () => {
      const image = parent.querySelector('img')
      if (!image || !image.complete || !image.naturalWidth) return
      const result = canvas.getContext('2d')!
      result.clearRect(0, 0, width, height)
      const hasFill = layers.some(layer => layer.visible && layer.strokes.some(stroke => stroke.mode === 'fill'))
      const sample = hasFill ? document.createElement('canvas') : undefined
      if (sample) { sample.width = width; sample.height = height; sample.getContext('2d')!.drawImage(image, 0, 0, width, height) }
      for (const layer of layers) {
        if (!layer.visible) continue
        const surface = document.createElement('canvas'); surface.width = width; surface.height = height
        const ctx = surface.getContext('2d')!
        for (const stroke of layer.strokes) {
          ctx.save()
          const clipped = stroke.clip?.length ? document.createElement('canvas') : undefined
          if (clipped) { clipped.width = width; clipped.height = height }
          const target = clipped?.getContext('2d') ?? ctx
          target.save()
          target.globalAlpha = clipped ? 1 : stroke.opacity ?? 1
          if (stroke.mode === 'fill') {
            const combined = document.createElement('canvas'); combined.width = width; combined.height = height
            const combinedCtx = combined.getContext('2d', { willReadFrequently: true })!
            combinedCtx.drawImage(sample!, 0, 0); combinedCtx.drawImage(surface, 0, 0)
            fill(target, combinedCtx, stroke)
          } else {
            target.globalCompositeOperation = !clipped && stroke.mode === 'erase' ? 'destination-out' : 'source-over'
            const hardness = stroke.hardness ?? 1
            const softened = hardness < 1 ? document.createElement('canvas') : undefined
            if (softened) { softened.width = width; softened.height = height }
            const brush = softened?.getContext('2d') ?? target
            brush.strokeStyle = stroke.color; brush.lineWidth = stroke.size; brush.lineCap = 'round'; brush.lineJoin = 'round'
            path(brush, stroke.points); if (stroke.points.length === 1) brush.lineTo(stroke.points[0][0] + 0.01, stroke.points[0][1])
            brush.stroke()
            if (softened) {
              target.filter = `blur(${Math.max(0.25, stroke.size / 2 * (1 - hardness) / 2)}px)`
              target.drawImage(softened, 0, 0)
            }
          }
          target.restore()
          if (clipped && stroke.clip) {
            const mask = document.createElement('canvas'); mask.width = width; mask.height = height
            const maskCtx = mask.getContext('2d')!
            for (const part of comicSelectionParts(stroke.clip)) {
              maskCtx.globalCompositeOperation = part.op === 'add' ? 'source-over' : 'destination-out'
              maskCtx.fillStyle = '#fff'; path(maskCtx, part.points); maskCtx.closePath(); maskCtx.fill()
            }
            const clipCtx = clipped.getContext('2d')!
            clipCtx.globalCompositeOperation = 'destination-in'; clipCtx.drawImage(mask, 0, 0)
            ctx.globalAlpha = stroke.opacity ?? 1
            ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over'
            ctx.drawImage(clipped, 0, 0)
          }
          ctx.restore()
        }
        result.save(); result.globalAlpha = layer.opacity; result.drawImage(surface, 0, 0); result.restore()
        if (sample) { const sampleCtx = sample.getContext('2d')!; sampleCtx.save(); sampleCtx.globalAlpha = layer.opacity; sampleCtx.drawImage(surface, 0, 0); sampleCtx.restore() }
      }
    }
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render) }
    const observer = new MutationObserver(() => {
      const image = parent.querySelector('img')
      if (image) { image.removeEventListener('load', schedule); image.addEventListener('load', schedule); schedule() }
    })
    observer.observe(parent, { childList: true, subtree: true })
    const image = parent.querySelector('img')
    image?.addEventListener('load', schedule); schedule()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); parent.querySelector('img')?.removeEventListener('load', schedule) }
  }, [layers, width, height, preview?.api, preview?.projectId, preview?.pageId, preview?.revision, scale, pixelWidth, pixelHeight, t])
  return <canvas ref={ref} className="comic-canvas__overlay" width={pixelWidth} height={pixelHeight} aria-hidden="true" />
}
