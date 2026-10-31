import { placeTourCard } from './tourLayout'

it('uses a corner to preserve the full card beside a large dialog', () => {
  const tip = placeTourCard({ x: 200, y: 160, width: 800, height: 500 }, { width: 400, height: 285 }, { width: 1180, height: 780 }, 16, 0)
  expect(tip).toEqual({ x: 16, y: 16 })
})

it('places the tip beside a small target without covering it', () => {
  const target = { x: 80, y: 120, width: 180, height: 160 }
  const tip = placeTourCard(target, { width: 320, height: 200 }, { width: 1180, height: 780 }, 16, 64)
  expect(tip.x).toBeGreaterThanOrEqual(target.x + target.width)
  expect(tip.y).toBeGreaterThanOrEqual(80)
})

it('keeps the tip inside a minimum-size window when the target occupies most of the page', () => {
  const card = { width: 320, height: 244 }
  const tip = placeTourCard({ x: 100, y: 90, width: 620, height: 380 }, card, { width: 760, height: 560 }, 16, 64)
  expect(tip.x).toBeGreaterThanOrEqual(16)
  expect(tip.y).toBeGreaterThanOrEqual(80)
  expect(tip.x + card.width).toBeLessThanOrEqual(744)
  expect(tip.y + card.height).toBeLessThanOrEqual(544)
})

it('uses space below a wide target when neither side fits', () => {
  const target = { x: 80, y: 100, width: 600, height: 80 }
  const tip = placeTourCard(target, { width: 320, height: 200 }, { width: 760, height: 560 }, 16, 64)
  expect(tip.y).toBeGreaterThanOrEqual(target.y + target.height)
})
