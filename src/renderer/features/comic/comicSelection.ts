import type { ComicSelection } from '../../../shared/comic'

type Point = [number, number]
export type ComicSelectionPart = { op: 'add' | 'subtract'; points: Point[] }

export function comicSelectionParts(selection: ComicSelection): ComicSelectionPart[] {
  return Array.isArray(selection[0]) ? [{ op: 'add', points: selection as Point[] }] : selection as ComicSelectionPart[]
}

export function comicSelectionContains(x: number, y: number, selection: ComicSelection): boolean {
  let selected = false
  for (const part of comicSelectionParts(selection)) {
    let inside = false
    for (let i = 0, j = part.points.length - 1; i < part.points.length; j = i++) {
      const [xi, yi] = part.points[i], [xj, yj] = part.points[j]
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
    }
    if (inside) selected = part.op === 'add'
  }
  return selected
}

export function clipComicPolygon(points: Point[], width: number, height: number): Point[] {
  let result = points
  const edges: [number, number, number][] = [[0, 0, 1], [0, width, -1], [1, 0, 1], [1, height, -1]]
  for (const [axis, boundary, sign] of edges) {
    if (!result.length) break
    const input = result; result = []
    for (let i = 0; i < input.length; i++) {
      const from = input[(i + input.length - 1) % input.length], to = input[i]
      const fromInside = (from[axis] - boundary) * sign >= 0, toInside = (to[axis] - boundary) * sign >= 0
      if (fromInside !== toInside) {
        const ratio = (boundary - from[axis]) / (to[axis] - from[axis])
        result.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio])
      }
      if (toInside) result.push(to)
    }
  }
  return result.map(([x, y]) => [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))])
}
