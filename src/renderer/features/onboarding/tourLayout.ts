export interface TourRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TourSize {
  width: number
  height: number
}

/** Keep the tip outside the spotlight where space permits, including above the title bar inset. */
export function placeTourCard(target: TourRect | null, card: TourSize, viewport: TourSize, gap: number, topInset: number): { x: number; y: number } {
  const clamp = (x: number, y: number) => ({
    x: Math.max(gap, Math.min(x, viewport.width - card.width - gap)),
    y: Math.max(topInset + gap, Math.min(y, viewport.height - card.height - gap)),
  })
  if (!target) return clamp((viewport.width - card.width) / 2, (viewport.height - card.height) / 2)
  const candidates = [
    clamp(target.x + target.width + gap, target.y),
    clamp(target.x - card.width - gap, target.y),
    clamp(target.x + target.width - card.width, target.y + target.height + gap),
    clamp(target.x, target.y - card.height - gap),
    clamp(target.x - card.width - gap, target.y - card.height - gap),
    clamp(target.x + target.width + gap, target.y - card.height - gap),
    clamp(target.x - card.width - gap, target.y + target.height + gap),
    clamp(target.x + target.width + gap, target.y + target.height + gap),
  ]
  const overlap = (position: { x: number; y: number }) =>
    Math.max(0, Math.min(position.x + card.width, target.x + target.width) - Math.max(position.x, target.x))
    * Math.max(0, Math.min(position.y + card.height, target.y + target.height) - Math.max(position.y, target.y))
  return candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best)
}

/** An even-odd path cuts a rounded opening without copying or lifting the underlying UI. */
export function spotlightPath(viewport: TourSize, target: TourRect | null, radius: number): string {
  const outside = `M0 0H${viewport.width}V${viewport.height}H0Z`
  if (!target) return outside
  const { x, y, width, height } = target
  const r = Math.min(radius, width / 2, height / 2)
  return `${outside} M${x + r} ${y}H${x + width - r}Q${x + width} ${y} ${x + width} ${y + r}V${y + height - r}Q${x + width} ${y + height} ${x + width - r} ${y + height}H${x + r}Q${x} ${y + height} ${x} ${y + height - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
}
