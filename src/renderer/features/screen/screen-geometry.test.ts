import { expect, it } from 'vitest'
import { drawnRegion, movedRegion, resizedRegion, resizeRegionEdge } from './region-geometry'
import { layoutScreenOverlay, screenTextLines, visibleScreenBlocks } from './overlay-layout'
import type { ScreenTextBlock } from '../../../shared/screen-translation'

it('supports reverse dragging and constrains moves and resizes to the selected source', () => {
  const region = drawnRegion('region', { x: 0.8, y: 0.7 }, { x: 0.2, y: 0.3 })
  expect(region.x).toBe(0.2); expect(region.y).toBe(0.3)
  expect(region.width).toBeCloseTo(0.6); expect(region.height).toBeCloseTo(0.4)
  const moved = movedRegion(region, 1, -1)
  expect(moved.x).toBeCloseTo(0.4); expect(moved.y).toBe(0)
  const resized = resizedRegion(moved, 1, -1)
  expect(resized.width).toBeCloseTo(0.6); expect(resized.height).toBe(0.005)
})

const block = (id: string, text: string, y: number): ScreenTextBlock => ({ id, text: '原文', translation: text, revision: 1, regionId: 'region', x: 0.6, y, width: 0.1, height: 0.03, angle: 0, status: 'ready' })
const measure = (text: string, size: number) => text.length * size * 0.65

it('measures word-boundary wrapping without undercounting spaced English lines', () => {
  expect(screenTextLines('ABCDEFGHIJK ABCDEFGHIJK ABCDEFGHIJK ABCDEFGHIJK', 20, 1, text => text.length)).toBe(4)
})

it('keeps translations at their source positions even when nearby blocks overlap', () => {
  const input = [block('one', 'A complete translation with many words.', 0.4), block('two', 'Next line', 0.45)]
  const layout = layoutScreenOverlay(input, { width: 800, height: 600 }, 24, false, measure, 8)
  expect(layout).toHaveLength(2)
  for (const [index, item] of layout.entries()) {
    expect(item.x).toBeCloseTo(input[index].x * 800)
    expect(item.y).toBeCloseTo(input[index].y * 600)
    expect(item.textWidth).toBeCloseTo(input[index].width * 800)
    expect(item.fontSize).toBeGreaterThanOrEqual(12)
    expect(item.text).toBe(input[index].translation)
  }
  const alone = layoutScreenOverlay([input[1]], { width: 800, height: 600 }, 24, false, measure, 8)[0]
  expect(layout[1]).toEqual(alone)
})

it('fits extra lines from the same origin and bounds dense translations to the screen', () => {
  const input = { ...block('long', 'Long text '.repeat(10), 0.2), x: 0.1, width: 0.7, height: 0.05 }
  const [layout] = layoutScreenOverlay([input], { width: 420, height: 320 }, 36, false, measure, 8)
  expect(layout.overflow).toBe(false)
  expect(layout.fontSize).toBeGreaterThanOrEqual(12)
  expect(layout.x).toBeCloseTo(42); expect(layout.y).toBeCloseTo(64)
  expect(layout.height).toBeGreaterThan(input.height * 320)
  const [dense] = layoutScreenOverlay([{ ...input, translation: 'X'.repeat(50000) }], { width: 420, height: 320 }, 36, false, measure, 8)
  expect(dense.overflow).toBe(true)
  expect(dense.y + dense.height).toBeLessThanOrEqual(320)
  expect(dense.text).toHaveLength(50000)
})

it('maps a rotated OCR quadrilateral through its own edge rather than rotating an axis-aligned origin', () => {
  const rotated = block('rotated', 'A rotated line of text', 134.96 / 400)
  rotated.x = 35.85 / 700
  rotated.quad = [[35.85 / 700, 297.22 / 400], [643.78 / 700, 134.96 / 400], [657.21 / 700, 188.02 / 400], [49.28 / 700, 350.28 / 400]]
  const [layout] = layoutScreenOverlay([rotated], { width: 700, height: 400 }, 18, false, measure, 8)
  expect(layout.angle).toBeCloseTo(-14.94, 1)
  expect(layout.textWidth).toBeCloseTo(Math.hypot(643.78 - 35.85, 134.96 - 297.22))
  expect(layout.x).toBeCloseTo(35.85)
  expect(layout.y).toBeCloseTo(134.96)
  expect(layout.width).toBeGreaterThan(0)
  expect(layout.overflow).toBe(false)
})


it('keeps long translations inside the selected rectangle and reports insufficient space', () => {
  const item = { ...block('long', 'A long translation '.repeat(50), .2), x: .1, width: .3, height: .05 }
  const selected = { id: 'region', x: .1, y: .2, width: .3, height: .1 }
  const [layout] = layoutScreenOverlay([item], { width: 1000, height: 600 }, 0, false, measure, 8, [selected])
  expect(layout.y + layout.height).toBeLessThanOrEqual(180.01)
  expect(layout.overflow).toBe(true)
})

it('deduplicates the same detected text from overlapping areas', () => {
  const first = block('first', 'Translated', .2)
  expect(visibleScreenBlocks([first, { ...first, id: 'second', regionId: 'other' }])).toHaveLength(1)
  expect(visibleScreenBlocks([first, { ...first, id: 'second', y: .6 }])).toHaveLength(2)
})

it('resizes from the top left while preserving the opposite corner', () => {
  const result = resizeRegionEdge({ id: 'area', x: .2, y: .2, width: .3, height: .3 }, -.1, .1, 'nw')
  expect(result.x).toBeCloseTo(.1); expect(result.y).toBeCloseTo(.3)
  expect(result.x + result.width).toBeCloseTo(.5)
  expect(result.y + result.height).toBeCloseTo(.5)
})
