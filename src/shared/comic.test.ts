import { expect, it } from 'vitest'
import { COMIC_VISUAL_RESOURCE_IDS, isManagedComicVisualResource, comicArtboardSchema, comicConfigSchema, comicDrawingLayerSchema, comicMutationSchema, comicRegionSchema, comicStyleSchema } from './comic'

it('validates styled character ranges using Unicode code points at the IPC boundary', () => {
  const region = { id: '11111111-1111-4111-8111-111111111111', sourceText: 'hello', targetText: '你😀好', x: 0, y: 0, width: 40, height: 80,
    confidence: null, locked: false, ignored: false, qa: [], style: { fontSize: 18, color: '#000000', direction: 'horizontal', align: 'center' } }
  expect(comicRegionSchema.safeParse({ ...region, textRuns: [{ start: 1, end: 2, style: { color: '#ff0000' } }] }).success).toBe(true)
  for (const textRuns of [[{ start: 1, end: 4, style: {} }], [{ start: 0, end: 2, style: {} }, { start: 1, end: 3, style: {} }]]) {
    expect(comicRegionSchema.safeParse({ ...region, textRuns }).success).toBe(false)
  }
})

it('accepts existing styles and high-resolution automatic typography through IPC', () => {
  const saved = { fontSize: 24, color: '#000000', direction: 'vertical-rl', align: 'center' }
  expect(comicStyleSchema.parse(saved)).toEqual(saved)
  expect(comicStyleSchema.parse({ ...saved, fontSize: 480, autoFontSize: true })).toMatchObject({
    fontSize: 480, autoFontSize: true,
  })
  expect(comicStyleSchema.safeParse({ ...saved, fontSize: 2001 }).success).toBe(false)
  expect(comicStyleSchema.safeParse({ ...saved, autoFontSize: 'yes' }).success).toBe(false)
})

it('validates persistent typography without accepting file paths as font data', () => {
  const style = { fontSize: 24, color: '#000000', direction: 'horizontal', align: 'center',
    fontFamily: 'Noto Sans SC', fontWeight: 700, fontStyle: 'italic', strokeColor: '#ffffff',
    strokeWidth: 2, lineSpacing: 1.2 }
  expect(comicStyleSchema.parse(style)).toEqual(style)
  expect(comicStyleSchema.safeParse({ ...style, strokeWidth: -1 }).success).toBe(false)
  expect(comicStyleSchema.safeParse({ ...style, fontData: 'arbitrary' }).success).toBe(false)
  expect(comicDrawingLayerSchema.safeParse({ id: 'bad', strokes: [] }).success).toBe(false)
})

it('accepts the optional OCR engine and rejects unknown engines', () => {
  expect(comicConfigSchema.parse({}).ocr).toBeUndefined()
  expect(comicConfigSchema.parse({ ocr: 'auto' }).ocr).toBe('auto')
  expect(comicConfigSchema.parse({ ocr: 'manga-ocr' }).ocr).toBe('manga-ocr')
  expect(comicConfigSchema.safeParse({ ocr: 'unknown' }).success).toBe(false)
})

it('validates per-stage execution devices and individual repair-layer deletion', () => {
  const executionProviders = { detector: 'cuda', ocr: 'cpu', repair: 'dml' }
  expect(comicConfigSchema.parse({ executionProviders }).executionProviders).toEqual(executionProviders)
  expect(comicConfigSchema.safeParse({ executionProviders: { ocr: 'unknown' } }).success).toBe(false)
  expect(comicConfigSchema.safeParse({ executionProviders: { translation: 'cpu' } }).success).toBe(false)
  const uuid = '11111111-1111-4111-8111-111111111111'
  const command = { action: 'deleteRepairLayer', pageId: uuid, layerId: uuid }
  expect(comicMutationSchema.parse({ projectId: uuid, operationId: uuid, expectedRevision: 1, command }).command).toEqual(command)
})

it('routes every manga visual model to its managed backend installer', () => {
  for (const id of COMIC_VISUAL_RESOURCE_IDS) expect(isManagedComicVisualResource(id)).toBe(true)
  expect(isManagedComicVisualResource('pp-ocrv5-mobile-ch-onnx')).toBe(true)
  expect(isManagedComicVisualResource('qwen35-0.8b')).toBe(false)
  expect(isManagedComicVisualResource('../comic-rtdetr-onnx')).toBe(false)
})

it('normalizes legacy null font/name values at the actual save-region IPC boundary', () => {
  const uuid = '11111111-1111-4111-8111-111111111111'
  const parsed = comicMutationSchema.parse({ projectId: uuid, operationId: uuid, expectedRevision: 1,
    command: { action: 'saveRegion', pageId: uuid, region: { id: uuid, name: null,
      sourceText: 'Hello', targetText: '你好', x: 0, y: 0, width: 40, height: 80,
      confidence: null, locked: false, ignored: false, qa: [], style: { fontFamily: null,
        fontSize: 18, color: '#000000', direction: 'horizontal', align: 'center' } } } })
  if (parsed.command.action !== 'saveRegion') throw new Error('Unexpected action')
  expect(parsed.command.region.name).toBeUndefined()
  expect(parsed.command.region.style.fontFamily).toBeUndefined()
  expect(JSON.stringify(parsed)).not.toContain('"name":null')
})

it('accepts automatic and explicit repair methods while preserving old configurations', () => {
  expect(comicConfigSchema.parse({}).repairMethod).toBeUndefined()
  for (const repairMethod of ['auto', 'telea', 'lama-manga']) {
    expect(comicConfigSchema.parse({ repairMethod }).repairMethod).toBe(repairMethod)
  }
  expect(comicConfigSchema.safeParse({ repairMethod: 'unknown' }).success).toBe(false)
})

it('accepts automatic and explicit detectors while preserving old configurations', () => {
  expect(comicConfigSchema.parse({}).detector).toBeUndefined()
  for (const detector of ['auto', 'ppocr', 'rtdetr']) {
    expect(comicConfigSchema.parse({ detector }).detector).toBe(detector)
  }
  expect(comicConfigSchema.safeParse({ detector: 'unknown' }).success).toBe(false)
})


it('validates workspace artboard metadata without generating legacy defaults', () => {
  expect(comicArtboardSchema.parse({ x: -1_000_000, y: 1_000_000 })).toEqual({ x: -1_000_000, y: 1_000_000 })
  expect(comicArtboardSchema.parse({ x: -12.5, y: 89.25, name: '  Chapter One  ', visible: false, locked: true, expanded: false })).toEqual({
    x: -12.5, y: 89.25, name: 'Chapter One', visible: false, locked: true, expanded: false,
  })
  expect(comicArtboardSchema.parse({ x: 0, y: 0, name: '\u0085Board\u001f' }).name).toBe('Board')
  expect(comicArtboardSchema.safeParse({ x: 0, y: 0, name: '\u0085\u001f' }).success).toBe(false)
  const name = '\u{1f600}'.repeat(200)
  expect(comicArtboardSchema.parse({ x: 0, y: 0, name }).name).toBe(name)
  expect(comicArtboardSchema.safeParse({ x: 0, y: 0, name: `${name}a` }).success).toBe(false)
})

it('rejects nonfinite coordinates, invalid flags and malformed artboard labels', () => {
  for (const artboard of [
    { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: -1_000_001, y: 0 }, { x: 0, y: 1_000_001 },
    { x: true, y: 0 }, { x: '0', y: 0 }, { x: 0 }, { x: 0, y: 0, width: 100 },
    { x: 0, y: 0, name: '' }, { x: 0, y: 0, name: '   ' }, { x: 0, y: 0, name: null },
    { x: 0, y: 0, name: 123 }, { x: 0, y: 0, name: 'a'.repeat(201) },
    { x: 0, y: 0, visible: 1 }, { x: 0, y: 0, locked: 0 }, { x: 0, y: 0, expanded: 'false' },
  ]) expect(comicArtboardSchema.safeParse(artboard).success).toBe(false)
})

it('accepts only the complete set-artboard command at the IPC boundary', () => {
  const uuid = '11111111-1111-4111-8111-111111111111'
  const request = { projectId: uuid, operationId: uuid, expectedRevision: 4 }
  const command = { action: 'setArtboard', pageId: uuid, artboard: { x: 40.5, y: -23, name: 'Board', visible: false, locked: true, expanded: false } }
  expect(comicMutationSchema.parse({ ...request, command }).command).toEqual(command)
  for (const invalid of [
    { action: 'setArtboardPosition', pageId: uuid, x: 0, y: 0 },
    { action: 'setArtboard', pageId: uuid, x: 0, y: 0 },
    { ...command, x: 0 }, { ...command, pageId: 'invalid' },
    { ...command, artboard: { x: 0, y: 0, locked: 1 } },
  ]) expect(comicMutationSchema.safeParse({ ...request, command: invalid }).success).toBe(false)
})
