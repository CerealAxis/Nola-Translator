// Artboard and editable text mapping adapted from Lumina (MIT), Copyright (c) 2026 Lumina contributors.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software
// and associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
import { writePsdBuffer, type Layer, type PixelData, type Psd } from 'ag-psd'
import type { ComicPage, ComicProject, ComicRegion } from '../shared/comic'

export interface ComicPsdRaster extends PixelData { fontSize?: number; text?: string }
export interface ComicPsdSource {
  image(pageId: string, kind: 'source' | 'clean' | 'rendered'): Promise<ComicPsdRaster>
  layer(pageId: string, kind: 'repair' | 'drawing' | 'text', layerId: string): Promise<ComicPsdRaster>
  font?(region: ComicRegion): Promise<string>
}

function cropRaster(raster: PixelData): { imageData: PixelData; x: number; y: number } {
  let left = raster.width, top = raster.height, right = -1, bottom = -1
  for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
    if (!raster.data[(y * raster.width + x) * 4 + 3]) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left) return { x: 0, y: 0, imageData: { width: 1, height: 1, data: new Uint8Array(4) } }
  const width = right - left + 1, height = bottom - top + 1
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) data.set(raster.data.subarray(((top + y) * raster.width + left) * 4,
    ((top + y) * raster.width + left + width) * 4), y * width * 4)
  return { x: left, y: top, imageData: { width, height, data } }
}

async function editableText(region: ComicRegion, left: number, top: number, fontSize: number, text: string, font: string, fontResolver?: ComicPsdSource['font']): Promise<NonNullable<Layer['text']>> {
  const style = region.style
  const angle = (style.angle ?? 0) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const cx = region.width / 2, cy = region.height / 2
  const color = (value: string) => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) })
  const descriptor: NonNullable<Layer['text']> = {
    text: text.replace(/\r?\n/g, '\r'),
    transform: [cos, sin, -sin, cos, left + region.x + cx - cos * cx + sin * cy,
      top + region.y + cy - sin * cx - cos * cy],
    antiAlias: 'smooth', shapeType: 'box', boxBounds: [0, 0, region.width, region.height],
    style: { font: { name: font }, fontSize,
      fauxBold: false, fauxItalic: style.fontStyle === 'italic',
      fillColor: color(style.color), fillFlag: true,
      ...(style.strokeWidth ? { strokeColor: color(style.strokeColor ?? '#ffffff'), strokeFlag: true, outlineWidth: style.strokeWidth } : {}),
      autoLeading: false, leading: fontSize * (style.lineSpacing ?? 1.1), autoKerning: true },
    paragraphStyle: { justification: style.align },
  }
  if (region.textRuns?.length) {
    if (text !== region.targetText) throw new Error('comicTextLayoutMismatch')
    const chars = Array.from(text), styles = chars.map((_, index) => Object.assign({}, ...region.textRuns!.filter(run => run.start <= index && index < run.end).map(run => run.style)))
    const groups: { text: string; style: Partial<ComicRegion['style']> }[] = []
    chars.forEach((char, index) => {
      if (char === '\n' && chars[index - 1] === '\r') return
      const normalized = char === '\n' ? '\r' : char, patch = styles[index], last = groups.at(-1)
      if (last && JSON.stringify(last.style) === JSON.stringify(patch)) last.text += normalized
      else groups.push({ text: normalized, style: patch })
    })
    const fontCache = new Map<string, Promise<string>>()
    descriptor.styleRuns = await Promise.all(groups.map(async group => {
      const merged = { ...style, ...group.style }
      const key = JSON.stringify([merged.fontFamily, merged.fontWeight, merged.fontStyle])
      let resolved = fontCache.get(key)
      if (!resolved) {
        resolved = fontResolver ? fontResolver({ ...region, style: merged }) : Promise.resolve(merged.fontFamily ?? font)
        fontCache.set(key, resolved)
      }
      return { length: group.text.length, style: { ...descriptor.style, font: { name: await resolved },
        fontSize: group.style.fontSize === undefined ? fontSize : Math.max(6, Math.round(group.style.fontSize * fontSize / style.fontSize)), fauxItalic: merged.fontStyle === 'italic', fillColor: color(merged.color),
        strokeFlag: !!merged.strokeWidth, outlineWidth: merged.strokeWidth ?? 0,
        strokeColor: color(merged.strokeColor ?? '#ffffff') } }
    }))
  }
  return descriptor
}

export async function buildComicPsd(project: ComicProject, pages: ComicPage[], source: ComicPsdSource): Promise<Psd> {
  if (!pages.length) throw new Error('pageNotFound')
  const columns = Math.min(4, pages.length), rows = Math.ceil(pages.length / columns), gap = 100
  const widths = Array.from({ length: columns }, (_, col) => Math.max(...pages.filter((_, i) => i % columns === col).map(page => page.width)))
  const heights = Array.from({ length: rows }, (_, row) => Math.max(...pages.slice(row * columns, (row + 1) * columns).map(page => page.height)))
  const width = widths.reduce((a, b) => a + b, 0) + gap * (columns - 1)
  const height = heights.reduce((a, b) => a + b, 0) + gap * (rows - 1)
  // PSD has a 30,000px dimension limit; bound decoded RGBA memory on laptops as well.
  if (width > 30000 || height > 30000 || width * height > 40_000_000) throw new Error('exportTooLarge')
  const composite = new Uint8Array(width * height * 4)
  let storedPixels = width * height
  const bitmapLayer = (raster: PixelData, left: number, top: number): Pick<Layer, 'imageData' | 'left' | 'top'> => {
    const cropped = cropRaster(raster)
    storedPixels += cropped.imageData.width * cropped.imageData.height
    if (storedPixels > 80_000_000) throw new Error('exportTooLarge')
    return { imageData: cropped.imageData, left: left + cropped.x, top: top + cropped.y }
  }
  const children: Layer[] = []
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i], col = i % columns, row = Math.floor(i / columns)
    const left = widths.slice(0, col).reduce((a, b) => a + b, 0) + gap * col
    const top = heights.slice(0, row).reduce((a, b) => a + b, 0) + gap * row
    const rendered = await source.image(page.id, 'rendered')
    if (rendered.width !== page.width || rendered.height !== page.height) throw new Error('comicImageUnavailable')
    for (let y = 0; y < page.height; y++) {
      composite.set(rendered.data.subarray(y * page.width * 4, (y + 1) * page.width * 4), ((top + y) * width + left) * 4)
    }
    const layers: Layer[] = [{ name: 'Background', ...bitmapLayer(await source.image(page.id, 'source'), left, top),
      hidden: page.backgroundVisible === false }]
    if (page.repairLayers?.length) {
      for (const layer of page.repairLayers) layers.push({ name: layer.name,
        ...bitmapLayer(await source.layer(page.id, 'repair', layer.id), left + layer.x, top + layer.y),
        opacity: layer.opacity, hidden: !layer.visible })
    } else if (page.hasClean) {
      layers.push({ name: 'Cleanup', ...bitmapLayer(await source.image(page.id, 'clean'), left, top) })
    }
    for (const layer of page.drawingLayers ?? []) layers.push({ name: layer.name,
      ...bitmapLayer(await source.layer(page.id, 'drawing', layer.id), left, top),
      hidden: !layer.visible, opacity: layer.opacity,
      protected: { composite: layer.locked, position: layer.locked } })
    for (const region of page.regions) {
      if (region.ignored || !region.targetText || region.targetText === region.sourceText) continue
      const raster = await source.layer(page.id, 'text', region.id)
      layers.push({ name: region.name ?? region.targetText.slice(0, 80), ...bitmapLayer(raster, left, top),
        hidden: region.visible === false, opacity: region.opacity ?? 1,
        protected: { composite: !!region.editLocked, position: !!region.editLocked },
        text: await editableText(region, left, top, raster.fontSize ?? region.style.fontSize,
          raster.text ?? region.targetText, await source.font?.(region) ?? region.style.fontFamily ?? 'NotoSansSC-Regular', source.font) })
    }
    children.push({ name: `${project.title} · ${page.name}`, left, top, right: left + page.width, bottom: top + page.height,
      opened: false, artboard: { rect: { left, top, right: left + page.width, bottom: top + page.height } },
      children: layers.reverse() })
  }
  return { width, height, children, imageData: { width, height, data: composite } }
}

export async function exportComicPsd(project: ComicProject, pages: ComicPage[], source: ComicPsdSource): Promise<Buffer> {
  return writePsdBuffer(await buildComicPsd(project, pages, source), { generateThumbnail: false,
    noBackground: true, trimImageData: false })
}

export function rgbaFromBgra(bitmap: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(bitmap.length)
  for (let i = 0; i < bitmap.length; i += 4) {
    const alpha = bitmap[i + 3]
    rgba[i] = alpha ? Math.min(255, Math.round(bitmap[i + 2] * 255 / alpha)) : 0
    rgba[i + 1] = alpha ? Math.min(255, Math.round(bitmap[i + 1] * 255 / alpha)) : 0
    rgba[i + 2] = alpha ? Math.min(255, Math.round(bitmap[i] * 255 / alpha)) : 0
    rgba[i + 3] = alpha
  }
  return rgba
}
