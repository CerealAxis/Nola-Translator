import { describe, expect, it } from 'vitest'
import { layoutComicArtboards } from './comicArtboards'

describe('comic artboard workspace', () => {
  it('places legacy pages at the rightmost edge plus 100 and aligns their top', () => {
    expect(layoutComicArtboards([{ id: 'a', width: 100, height: 200 }, { id: 'b', width: 300, height: 100 }, { id: 'c', width: 50, height: 150 }])).toEqual({
      artboards: [{ pageId: 'a', x: 0, y: 0, width: 100, height: 200 }, { pageId: 'b', x: 200, y: 0, width: 300, height: 100 }, { pageId: 'c', x: 600, y: 0, width: 50, height: 150 }],
      bounds: { x: 0, y: 0, width: 650, height: 200 },
    })
  })
  it('preserves explicit negative positions and includes hidden boards in bounds', () => {
    const pages = [{ id: 'a', width: 100, height: 200, artboard: { x: -250, y: -80, width: 150, height: 120, visible: false } }, { id: 'b', width: 30, height: 70 }]
    expect(layoutComicArtboards(pages)).toEqual({ artboards: [{ pageId: 'a', x: -250, y: -80, width: 150, height: 120 }, { pageId: 'b', x: 200, y: 0, width: 30, height: 70 }], bounds: { x: -250, y: -80, width: 480, height: 150 } })
  })
  it('keeps default positions stable when any page has an explicit position', () => {
    const stable = layoutComicArtboards([{ id: 'a', width: 100, height: 100 }, { id: 'b', width: 100, height: 100, artboard: { x: 200, y: 0 } }, { id: 'c', width: 100, height: 100 }])
    expect(stable.artboards.map(board => board.x)).toEqual([0, 200, 400])
    const collision = layoutComicArtboards([{ id: 'a', width: 100, height: 100 }, { id: 'b', width: 100, height: 100, artboard: { x: 50, y: 0 } }])
    expect(collision.artboards.map(board => board.x)).toEqual([0, 50])
    const movedFirst = layoutComicArtboards([{ id: 'a', width: 100, height: 100, artboard: { x: 900, y: -50 } }, { id: 'b', width: 100, height: 100 }, { id: 'c', width: 100, height: 100 }])
    expect(movedFirst.artboards.map(board => [board.x, board.y])).toEqual([[900, -50], [200, 0], [400, 0]])
  })
  it('returns an empty scene without fabricated bounds', () => {
    expect(layoutComicArtboards([])).toEqual({ artboards: [], bounds: { x: 0, y: 0, width: 0, height: 0 } })
  })
})
