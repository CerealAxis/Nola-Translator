import type { DocumentSection, DocumentValues } from './document-formats'

export async function exportPdf(sections: DocumentSection[], values: DocumentValues, language: string): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  let scanFont: Awaited<ReturnType<typeof pdf.embedFont>> | undefined

  // shortcut: rasterize laid-out pages until translated text can be embedded over the original PDF.
  for (const section of sections) {
    const view = section.page
    if (!view) throw new Error('documentExportFailed')
    await (view.renderTranslated ? view.renderTranslated(canvas, values, 2) : view.render(canvas, 2)).promise
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('documentExportFailed')), 'image/png')
    })
    const image = await pdf.embedPng(new Uint8Array(await imageBlob.arrayBuffer()))
    const page = pdf.addPage([view.width, view.height])
    page.drawImage(image, { x: 0, y: 0, width: view.width, height: view.height })
    if (!view.renderTranslated) {
      if (!scanFont) {
        const [{ default: fontkit }, { default: fontUrl }] = await Promise.all([
          import('@pdf-lib/fontkit'), import('../../src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf?url'),
        ])
        pdf.registerFontkit(fontkit)
        const response = await fetch(fontUrl)
        if (!response.ok) throw new Error('documentExportFailed')
        // shortcut: embed the full CJK font until CFF2 subsetting is supported.
        scanFont = await pdf.embedFont(await response.arrayBuffer())
      }
      const supported = new Set(scanFont.getCharacterSet())
      const margin = 48, size = 12, leading = 19
      const width = Math.max(view.width, 2 * margin + size)
      const height = Math.max(view.height, 2 * margin + leading)
      let translatedPage = pdf.addPage([width, height])
      let y = height - margin
      const write = (line: string) => {
        if (y < margin) { translatedPage = pdf.addPage([width, height]); y = height - margin }
        if (line.trim()) translatedPage.drawText(line.trim(), { x: margin, y, size, font: scanFont })
        y -= leading
      }
      for (const unit of section.units) {
        for (const paragraph of (values.get(unit.id) ?? unit.source).split(/\r?\n/u)) {
          if (Array.from(paragraph).some(character => !supported.has(character.codePointAt(0)!))) throw new Error('documentExportGlyph')
          let line = ''
          for (const { segment } of new Intl.Segmenter(language, { granularity: 'word' }).segment(paragraph.replaceAll('\t', '    '))) {
            for (const character of segment) {
              if (scanFont.widthOfTextAtSize(line + character, size) > width - 2 * margin && line) { write(line); line = '' }
              line += character
            }
          }
          write(line)
        }
      }
    }
  }

  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}
