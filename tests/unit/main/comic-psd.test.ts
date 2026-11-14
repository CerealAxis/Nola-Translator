import { expect, it } from 'vitest'
import { initializeCanvas, readPsd } from 'ag-psd'
import { buildComicPsd, exportComicPsd, rgbaFromBgra, type ComicPsdSource } from '../../../src/main/comic-psd'
import type { ComicProject, ComicPage } from '../../../src/shared/comic'

const pixel = (width: number, height: number, color = [0, 0, 0, 255]) => ({ width, height,
  data: Uint8Array.from({ length: width * height * 4 }, (_, i) => color[i % 4]) })
const page: ComicPage = { id: 'page', name: '001.png', chapterId: 'chapter', width: 10, height: 14,
  regions: [{ id: 'text', sourceText: 'Hello', targetText: '你好', x: 2, y: 3, width: 6, height: 8,
    confidence: 1, locked: false, ignored: false, qa: [], style: { fontSize: 8, color: '#112233', direction: 'horizontal', align: 'center' } }],
  repairLayers: [{ id: 'repair', name: 'Repair', x: 2, y: 3, width: 6, height: 8, visible: true, opacity: .5 }],
  drawingLayers: [{ id: 'draw', name: 'Paint', visible: false, locked: false, opacity: 1, strokes: [] }],
  status: 'rendered', hasClean: true, hasRendered: true }
const project = { title: 'Book', pages: [page] } as ComicProject
const source: ComicPsdSource = { image: async (_id, kind) => pixel(10, 14, kind === 'rendered' ? [255, 0, 0, 255] : [255, 255, 255, 255]),
  layer: async (_id, kind) => kind === 'repair' ? pixel(6, 8) : { ...pixel(10, 14), fontSize: 7 } }
initializeCanvas(() => { throw new Error('Raster-only PSD tests must not require a DOM canvas') },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }))

it('writes readable PSD artboards, true raster text and editable descriptors in stacking order', async () => {
  const bytes = await exportComicPsd(project, [page], source)
  expect(bytes.subarray(0, 4).toString()).toBe('8BPS')
  const result = readPsd(bytes, { useImageData: true, skipThumbnail: true })
  expect([result.width, result.height]).toEqual([10, 14])
  const layers = result.children![0].children!
  expect(layers.map(layer => layer.name)).toEqual(['你好', 'Paint', 'Repair', 'Background'])
  expect(layers[0].text!.text).toBe('你好')
  expect(layers[0].text!.style!.fontSize).toBe(7)
  expect(layers[0].imageData!.width).toBe(10)
  expect(layers[1].hidden).toBe(true)
  expect(layers[2].opacity).toBeCloseTo(.5, 2)
  expect(Array.from(result.imageData!.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
})

it('arranges mixed page sizes without overlapping artboards and enforces PSD limits', async () => {
  const second = { ...page, id: 'other', width: 15, height: 7, regions: [], repairLayers: [], drawingLayers: [] }
  const document = await buildComicPsd(project, [page, second], { ...source, image: async id => id === 'other' ? pixel(15, 7) : pixel(10, 14) })
  expect(document.width).toBe(125)
  expect(document.children![1].artboard!.rect!.left).toBe(110)
  await expect(buildComicPsd(project, [{ ...page, width: 30001 }], source)).rejects.toThrow('exportTooLarge')
})

it('converts premultiplied Windows bitmaps to straight RGBA without leaking invisible colors', () => {
  expect(Array.from(rgbaFromBgra(Uint8Array.from([0, 32, 64, 128, 99, 99, 99, 0]))))
    .toEqual([128, 64, 0, 128, 0, 0, 0, 0])
})

it('crops transparent text layers while retaining their position and fitted metadata', async () => {
  const raster = pixel(10, 14, [0, 0, 0, 0])
  raster.data.set([0, 0, 0, 255], (4 * 10 + 2) * 4)
  const document = await buildComicPsd(project, [{ ...page, repairLayers: [], drawingLayers: [] }], {
    ...source, layer: async () => ({ ...raster, fontSize: 9, text: '显示译文' }),
    font: async () => 'NotoSansSC-Bold',
  })
  const text = document.children![0].children![0]
  expect([text.left, text.top, text.imageData!.width, text.imageData!.height]).toEqual([2, 4, 1, 1])
  expect(text.text!.text).toBe('显示译文')
  expect(text.text!.style!.font!.name).toBe('NotoSansSC-Bold')
  expect(text.text!.style!.fontSize).toBe(9)
})

it('exports sparse Unicode character styles as editable UTF-16 PSD runs', async () => {
  const region = { ...page.regions[0], targetText: 'A😀文\r\nB', textRuns: [
    { start: 1, end: 3, style: { color: '#ff0000', fontWeight: 700, fontSize: 12 } },
    { start: 5, end: 6, style: { fontStyle: 'italic' as const } },
  ] }
  const styledPage = { ...page, regions: [region] }
  const bytes = await exportComicPsd(project, [styledPage], { ...source,
    font: async r => r.style.fontWeight === 700 ? 'NotoSansSC-Bold' : 'NotoSansSC-Regular' })
  const text = readPsd(bytes, { useImageData: true, skipThumbnail: true }).children![0].children![0].text!
  expect(text.text).toBe('A😀文\nB')
  expect(text.styleRuns!.map(run => run.length)).toEqual([1, 3, 1, 1])
  expect(text.styleRuns![1].style.font!.name).toBe('NotoSansSC-Bold')
  expect(text.styleRuns![1].style.fontSize).toBe(11)
  expect(text.styleRuns![1].style.fillColor).toMatchObject({ r: 255, g: 0, b: 0 })
  expect(text.styleRuns![3].style.fauxItalic).toBe(true)
})
