/** PhotoCraft places a new board 100 document pixels beyond the rightmost board. */
export const COMIC_ARTBOARD_GAP = 100

export interface ComicArtboardPage {
  id: string
  width: number
  height: number
  artboard?: { x: number; y: number; width?: number; height?: number } | null
}
export interface ComicArtboardRect { pageId: string; x: number; y: number; width: number; height: number }
export interface ComicArtboardBounds { x: number; y: number; width: number; height: number }

/**
 * Lay pages out in one document-pixel workspace. The legacy fallback is based on
 * original page order, so moving one explicit board does not reposition its peers.
 */
export function layoutComicArtboards(pages: readonly ComicArtboardPage[]): { artboards: ComicArtboardRect[]; bounds: ComicArtboardBounds } {
  const positioned = pages.map(page => page.artboard ? {
    pageId: page.id, x: page.artboard.x, y: page.artboard.y,
    width: page.artboard.width ?? page.width, height: page.artboard.height ?? page.height,
  } : undefined)
  const artboards: ComicArtboardRect[] = []
  let legacyX = 0
  pages.forEach((page, index) => {
    artboards.push(positioned[index] ?? { pageId: page.id, x: legacyX, y: 0, width: page.width, height: page.height })
    legacyX += page.width + COMIC_ARTBOARD_GAP
  })
  if (!artboards.length) return { artboards, bounds: { x: 0, y: 0, width: 0, height: 0 } }
  const x = Math.min(...artboards.map(item => item.x)), y = Math.min(...artboards.map(item => item.y))
  const right = Math.max(...artboards.map(item => item.x + item.width)), bottom = Math.max(...artboards.map(item => item.y + item.height))
  return { artboards, bounds: { x, y, width: right - x, height: bottom - y } }
}
