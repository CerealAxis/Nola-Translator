import { expect, it } from 'vitest'
import { createScreenTextProbe, matchesScreenTextProbe, type ScreenTextProbe } from '../../../src/shared/screen-visual-probe'

function pixels(background: number, shift = 0, changed = false) {
  const width = 160, height = 80, data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    const ink = y >= 20 && y < 40 && (x >= 20 + shift && x < 24 + shift || x >= 36 + shift && x < 40 + shift)
      || changed && x >= 24 && x < 36 && y >= 34 && y < 38
    data.set(ink ? [255, 255, 255, 255] : [background, (x + y + background) % 120, 30, 255], offset)
  }
  return { data, width, height }
}
const quad = [[20, 20], [40, 20], [40, 40], [20, 40]]
function probe(): ScreenTextProbe {
  const visual = createScreenTextProbe(pixels(20), quad)
  expect(visual).toBeDefined()
  return { ...visual!, id: 'probe', regionId: 'region', sourceHash: 'first' }
}

it('retains glyph identity across continuously changing scene pixels', () => {
  const visual = probe()
  for (let background = 0; background < 180; background += 3) expect(matchesScreenTextProbe(pixels(background), visual)).toBe(true)
})

it('rejects changed strokes, moved text and different capture dimensions', () => {
  const visual = probe()
  expect(matchesScreenTextProbe(pixels(40, 0, true), visual)).toBe(false)
  expect(matchesScreenTextProbe(pixels(40, 4), visual)).toBe(false)
  expect(matchesScreenTextProbe({ ...pixels(40), width: 80, height: 160 }, visual)).toBe(false)
})

it('does not invent glyph evidence for a flat region or invalid geometry', () => {
  const flat = pixels(0); flat.data.fill(255)
  expect(createScreenTextProbe(flat, quad)).toBeUndefined()
  expect(createScreenTextProbe(flat, [[0, 0], [Infinity, 0], [20, 20], [0, 20]])).toBeUndefined()
})
