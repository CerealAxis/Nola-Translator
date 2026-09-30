import { expect, it } from 'vitest'

import { allocateCaptionLines } from '../../../src/renderer/overlay/line-budget'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

const source = { visible: true, fontSize: 28, lineHeight: 1.3 }
const translation = { visible: true, fontSize: 22, lineHeight: 1.35 }

it('splits the stage in half when both tracks are visible', () => {
  // 96px / 2 = 48px per side. Source line = 36.4px (fits 1), translation line = 29.7px (fits 1).
  expect(allocateCaptionLines(96, [source, translation], 0)).toEqual([1, 1])
  // 160px / 2 = 80px per side. Source fits 2 lines (72.8px); translation fits 2 lines (59.4px).
  expect(allocateCaptionLines(160, [source, translation], 0)).toEqual([2, 2])
})

it('gives a source-only track the whole stage when the translation is hidden', () => {
  const small = { ...source, fontSize: 17 }
  // line = 22.1px, 66 / 22.1 ≈ 2.98, fits 2 lines in the full stage.
  expect(allocateCaptionLines(66, [small, { ...translation, visible: false }], 0)).toEqual([2, 0])
})

it('deducts the gap once when both halves meet', () => {
  // 280px stage with a 6px gap: each half is (280 - 6) / 2 = 137px.
  // Source 36.4px fits 3 lines; translation 29.7px fits 4 lines.
  expect(allocateCaptionLines(280, [source, translation], 6)).toEqual([3, 4])
})

it('fills each half independently rather than sharing slack', () => {
  // The 400px stage gives 200px per half, so each track grows inside its own slice.
  const result = allocateCaptionLines(400, [source, translation], 6)
  expect(result[0]).toBeGreaterThan(1)
  expect(result[1]).toBeGreaterThan(1)
  expect(Math.abs(result[0] - result[1])).toBeLessThanOrEqual(1)
})

it('gives a track nothing when even its first line does not fit the stage', () => {
  // Nothing fits at all, so there is nothing to spill: the stage clips its overflow and the tracks
  // refuse to shrink, so handing out a line that does not fit would push the other track out of view.
  const small = { ...source, fontSize: 17 }
  expect(allocateCaptionLines(20, [small, { ...translation, visible: false }], 0)).toEqual([0, 0])
  expect(allocateCaptionLines(0, [source, translation], 6)).toEqual([0, 0])
})

it('spills leftover stage height onto a track that missed its own slice', () => {
  // Built from the shipped defaults (17/1.3 and 16/1.35) because that is the geometry a user
  // actually hits when they drag the overlay down. A 50px stage halves to 22px per side, and the
  // source line is 22.1px, so it misses its own slice by a hair while the translation fits. Without
  // the spill the user's own speech would vanish and only the translation would survive.
  const live = [
    { visible: true, fontSize: DEFAULT_SETTINGS.overlay.fontSize, lineHeight: DEFAULT_SETTINGS.overlay.lineHeight },
    {
      visible: true,
      fontSize: DEFAULT_SETTINGS.overlay.translationFontSize,
      lineHeight: DEFAULT_SETTINGS.overlay.translationLineHeight,
    },
  ]
  // 22.1 + 21.6 + the 6px gap is 49.7px, which still fits inside 50.
  expect(allocateCaptionLines(50, live, 6)).toEqual([1, 1])
  expect(allocateCaptionLines(49, live, 6)).toEqual([1, 0])
})

it('keeps the source rather than the translation when only one line fits', () => {
  // A 72px source line cannot share a 40px stage with a 29.7px translation, but it can have the
  // stage to itself, and the source is what the user is actually saying.
  const large = { ...source, fontSize: 72 }
  expect(allocateCaptionLines(40, [large, translation], 0)).toEqual([0, 1])
  // Below the translation line too, nothing fits and the overlay is genuinely out of room.
  expect(allocateCaptionLines(20, [large, translation], 0)).toEqual([0, 0])
})

it('does not hang on a zero line height from an unvalidated settings file', () => {
  // settings.json is merged as a raw spread, so fontSize or lineHeight can arrive as 0. The fill
  // loop adds `lineHeights[index]` each pass; at 0 it would never terminate.
  const zeroHeight = { visible: true, fontSize: 28, lineHeight: 0 }
  const zeroSize = { visible: true, fontSize: 0, lineHeight: 1.3 }
  // share = (400 - 6) / 2 = 197px; the healthy translation track at 29.7px per line still gets 6.
  expect(allocateCaptionLines(400, [zeroHeight, translation], 6)).toEqual([0, 6])
  expect(allocateCaptionLines(400, [zeroSize, translation], 6)).toEqual([0, 6])
})
