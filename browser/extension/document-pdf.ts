import './pdf-compat'
import { AnnotationMode, getDocument, GlobalWorkerOptions, OPS, Util, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from './pdf-worker.ts?worker&url'
import type { DocumentSection, DocumentUnit, DocumentValues, OpenDocument } from './document-formats'
import { exportPdf } from './document-pdf-export'
import { fitPdfTranslation, isNearPdfFormula, isPdfTextLine } from './document-pdf-layout'

GlobalWorkerOptions.workerSrc = workerUrl

interface TextLine { text: string; x: number; y: number; width: number; height: number }
interface TextBlock { id: number; lines: TextLine[] }

function pageView(page: PDFPageProxy, blocks: TextBlock[]): NonNullable<DocumentSection['page']> {
  const { width, height } = page.getViewport({ scale: 1 })
  const render = (canvas: HTMLCanvasElement, scale: number) => {
    const viewport = page.getViewport({ scale: Math.min(scale, 1900 / Math.max(width, height)) })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    return page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE })
  }
  return {
    width, height, render,
    renderTranslated(canvas, values, scale) {
      const task = render(canvas, scale)
      const backgroundCanvas = document.createElement('canvas')
      backgroundCanvas.width = canvas.width
      backgroundCanvas.height = canvas.height
      const viewport = page.getViewport({ scale: Math.min(scale, 1900 / Math.max(width, height)) })
      const textOperators = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
      const backgroundTask = page.render({ canvas: backgroundCanvas, viewport, annotationMode: AnnotationMode.DISABLE,
        operationsFilter: (index, operatorList) => !textOperators.has(operatorList.fnArray[index]),
      })
      const promise = Promise.all([task.promise, backgroundTask.promise]).then(() => {
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        const factor = canvas.width / width
        for (const block of blocks) {
          const translated = values.get(block.id)
          if (!translated || translated === block.lines.map(line => line.text).join(' ')) continue
          const x = Math.min(...block.lines.map(line => line.x)) * factor
          const y = Math.min(...block.lines.map(line => line.y)) * factor
          const right = Math.max(...block.lines.map(line => line.x + line.width)) * factor
          const bottom = Math.max(...block.lines.map(line => line.y + line.height)) * factor
          const rect = { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue
          // Sample the original text colour before reconstructing the background under each line.
          const pixel = context.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.max(1, Math.min(canvas.width - Math.floor(x), Math.ceil(rect.width))), Math.max(1, Math.min(canvas.height - Math.floor(y), Math.ceil(rect.height))))
          const background = backgroundCanvas.getContext('2d')!.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), 1, 1).data
          let colour = [0, 0, 0], contrast = 0
          for (let i = 0; i < pixel.data.length; i += 16) {
            const distance = Math.abs(pixel.data[i] - background[0]) + Math.abs(pixel.data[i + 1] - background[1]) + Math.abs(pixel.data[i + 2] - background[2])
            if (distance > contrast) { contrast = distance; colour = [pixel.data[i], pixel.data[i + 1], pixel.data[i + 2]] }
          }
          for (const line of block.lines) {
            const lx = Math.max(0, Math.floor(line.x * factor - 1)), ly = Math.max(0, Math.floor(line.y * factor - 1))
            const lw = Math.min(canvas.width - lx, Math.ceil(line.width * factor + 3)), lh = Math.min(canvas.height - ly, Math.ceil(line.height * factor + 4))
            if (lw > 0 && lh > 0) context.drawImage(backgroundCanvas, lx, ly, lw, lh, lx, ly, lw, lh)
          }
          const fitted = fitPdfTranslation(translated, rect.width, rect.height, block.lines[0].height * factor * 0.9, (text, size) => {
            context.font = `${size}px sans-serif`
            return context.measureText(text).width
          })
          context.save()
          context.translate(rect.x, rect.y)
          context.scale(1, fitted.verticalScale)
          context.font = `${fitted.size}px sans-serif`
          context.fillStyle = `rgb(${colour.join(',')})`; context.textBaseline = 'top'
          fitted.lines.forEach((line, index) => context.fillText(line, 0, index * fitted.size * 1.15, rect.width))
          context.restore()
        }
      })
      return { promise, cancel: () => { task.cancel(); backgroundTask.cancel() } }
    },
  }
}

async function scanImage(view: NonNullable<DocumentSection['page']>) {
  const canvas = document.createElement('canvas')
  for (const edge of [1700, 1300, 1000, 750]) {
    await view.render(canvas, edge / Math.max(view.width, view.height)).promise
    const image = canvas.toDataURL('image/png')
    if (image.length < 4000000) return image
  }
  throw new Error('imageTooLarge')
}


export async function openPdf(file: File): Promise<OpenDocument> {
  const task = getDocument({
    data: await file.arrayBuffer(),
    standardFontDataUrl: new URL('pdf-standard-fonts/', window.location.href).href,
    useWasm: false,
    enableXfa: false,
  })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 500) throw new Error('documentLimit')
    const sections: DocumentSection[] = []
    let id = 0
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const blocks: TextBlock[] = []
      const view = pageView(page, blocks)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const units: DocumentUnit[] = []
      const lines: TextLine[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const transform = Util.transform(viewport.transform, item.transform)
        const size = Math.hypot(transform[2], transform[3])
        // Rotated labels and mathematical symbols stay on the original page.
        if (Math.abs(transform[1]) > 0.1 || Math.abs(transform[2]) > 0.1 || !size) continue
        const x = transform[4], y = transform[5] - size, width = item.width, height = size
        const previous = lines.at(-1)
        if (previous && Math.abs(previous.y - y) < size * 0.4 && x >= previous.x && x - (previous.x + previous.width) < size * 2) {
          previous.text += (x - (previous.x + previous.width) > size * 0.2 ? ' ' : '') + item.str
          previous.width = Math.max(previous.width, x + width - previous.x)
          previous.height = Math.max(previous.height, height)
        } else lines.push({ text: item.str, x, y, width, height })
      }
      let pending: TextLine[] = []
      const finish = () => {
        if (!pending.length) return
        const source = pending.map(line => line.text.trim()).join(' ').trim()
        if (source && isPdfTextLine(source)) {
          if (++id > 25000) throw new Error('documentLimit')
          units.push({ id, source }); blocks.push({ id, lines: pending })
        }
        pending = []
      }
      for (const line of lines) {
        if (!isPdfTextLine(line.text) || isNearPdfFormula(line, lines)) { finish(); continue }
        const previous = pending.at(-1)
        if (previous && (line.y <= previous.y || line.y - previous.y > Math.max(line.height, previous.height) * 2 || Math.abs(line.x - previous.x) > Math.max(line.height * 3, previous.width * 0.3) || Math.abs(line.height - previous.height) > 3)) finish()
        pending.push(line)
      }
      finish()
      if (!units.length) {
        delete view.renderTranslated
        units.push({ id: ++id, source: '', image: () => scanImage(view) })
      }
      sections.push({
        name: String(number), page: view, units,
        markup(values) {
          const root = document.createElement('div')
          for (const unit of units) {
            const paragraph = document.createElement('p')
            paragraph.textContent = values.get(unit.id) ?? unit.source
            root.append(paragraph)
          }
          return root.innerHTML
        },
      })
    }
    return { format: 'pdf', sections, export: (values, language) => exportPdf(sections, values, language), dispose: () => { void task.destroy() } }
  } catch (error) { await task.destroy(); throw error }
}
