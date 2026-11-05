import type { ScreenRegion } from '../../../shared/screen-translation'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export function drawnRegion(id: string, start: { x: number; y: number }, end: { x: number; y: number }): ScreenRegion {
  const x = clamp(Math.min(start.x, end.x), 0, 0.995), y = clamp(Math.min(start.y, end.y), 0, 0.995)
  return { id, x, y, width: clamp(Math.abs(end.x - start.x), 0.005, 1 - x), height: clamp(Math.abs(end.y - start.y), 0.005, 1 - y) }
}
export function movedRegion(region: ScreenRegion, dx: number, dy: number): ScreenRegion {
  return { ...region, x: clamp(region.x + dx, 0, 1 - region.width), y: clamp(region.y + dy, 0, 1 - region.height) }
}
export function resizedRegion(region: ScreenRegion, dx: number, dy: number): ScreenRegion {
  return { ...region, width: clamp(region.width + dx, 0.005, 1 - region.x), height: clamp(region.height + dy, 0.005, 1 - region.y) }
}

export function resizeRegionEdge(region: ScreenRegion, dx: number, dy: number, edge: string): ScreenRegion {
  const left = edge.includes('w') ? clamp(region.x + dx, 0, region.x + region.width - 0.005) : region.x
  const top = edge.includes('n') ? clamp(region.y + dy, 0, region.y + region.height - 0.005) : region.y
  const right = edge.includes('e') ? clamp(region.x + region.width + dx, left + 0.005, 1) : region.x + region.width
  const bottom = edge.includes('s') ? clamp(region.y + region.height + dy, top + 0.005, 1) : region.y + region.height
  return { ...region, x: left, y: top, width: right - left, height: bottom - top }
}
