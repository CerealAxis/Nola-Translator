import { Blob as NodeBlob } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { afterEach, expect, it, vi } from 'vitest'
import { exportPdf } from './document-pdf-export'
import type { DocumentSection } from './document-formats'

afterEach(() => vi.unstubAllGlobals())

it('exports the translated rendering at each original page size', async () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX0AAAAASUVORK5CYII=', 'base64'))
  vi.stubGlobal('Blob', NodeBlob)
  const canvas = { toBlob: (done: (value: Blob) => void) => done(new Blob([png], { type: 'image/png' })) }
  vi.stubGlobal('document', { createElement: () => canvas })
  const renderTranslated = vi.fn(() => ({ promise: Promise.resolve(), cancel() {} }))
  const section = (width: number, height: number): DocumentSection => ({
    name: '', units: [], markup: () => '',
    page: { width, height, render: renderTranslated, renderTranslated },
  })
  const values = new Map([[1, '译文']])
  const result = await exportPdf([section(612, 792), section(792, 612)], values, 'zh-CN')
  const pdf = await PDFDocument.load(new Uint8Array(await result.arrayBuffer()))
  expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }, { width: 792, height: 612 }])
  expect(renderTranslated).toHaveBeenCalledTimes(2)
  expect(renderTranslated).toHaveBeenCalledWith(canvas, values, 2)
})

it('keeps a scan and includes its translation on a following page', async () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aX0AAAAASUVORK5CYII=', 'base64'))
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('document', { createElement: () => ({ toBlob: (done: (value: Blob) => void) => done(new Blob([png], { type: 'image/png' })) }) })
  const font = await readFile('src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(font).buffer })))
  const section: DocumentSection = {
    name: '', units: [{ id: 1, source: '' }], markup: () => '',
    page: { width: 612, height: 792, render: () => ({ promise: Promise.resolve(), cancel() {} }) },
  }
  const result = await exportPdf([section], new Map([[1, '这是扫描页的译文。']]), 'zh-CN')
  const pdf = await PDFDocument.load(new Uint8Array(await result.arrayBuffer()))
  expect(pdf.getPageCount()).toBe(2)
  expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 612, height: 792 }, { width: 612, height: 792 }])
}, 30000)
