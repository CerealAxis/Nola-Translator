import type { ScreenRegion, ScreenTextBlock } from '../../../shared/screen-translation'

export interface OverlayLayout { id: string; x: number; y: number; width: number; height: number; textWidth: number; textHeight: number; angle: number; fontSize: number; text: string; overflow: boolean; padding: number }
export type MeasureScreenText = (text: string, fontSize: number) => number

export function visibleScreenBlocks(blocks: ScreenTextBlock[]): ScreenTextBlock[] {
  const visible: ScreenTextBlock[] = []
  for (const block of blocks.filter(item => item.status === 'ready' && !item.hidden && item.translation)) {
    const duplicate = visible.some(other => {
      const overlap = Math.max(0, Math.min(block.x + block.width, other.x + other.width) - Math.max(block.x, other.x))
        * Math.max(0, Math.min(block.y + block.height, other.y + other.height) - Math.max(block.y, other.y))
      return block.text === other.text && overlap > Math.min(block.width * block.height, other.width * other.height) * 0.8
    })
    if (!duplicate) visible.push(block)
  }
  return visible
}

export function screenTextLines(text: string, width: number, fontSize: number, measure: MeasureScreenText): number {
  let lines = 1, used = 0
  for (const token of text.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
    if (token === '\n') { lines++; used = 0; continue }
    const size = measure(token, fontSize)
    if (size <= width) {
      if (used && used + size > width) { lines++; used = size } else used += size
    } else for (const character of token) {
      const characterWidth = measure(character, fontSize)
      if (used && used + characterWidth > width) { lines++; used = characterWidth } else used += characterWidth
    }
  }
  return lines
}

/** Keep every translation anchored to its OCR box; adjacent text must never move it. */
export function layoutScreenOverlay(blocks: ScreenTextBlock[], viewport: { width: number; height: number }, preferredSize: number,
  showSource: boolean, measure: MeasureScreenText, padding: number, regions: ScreenRegion[] = []): OverlayLayout[] {
  const viewportWidth = Math.max(1, viewport.width), viewportHeight = Math.max(1, viewport.height)
  return visibleScreenBlocks(blocks).map(block => {
    const text = showSource ? `${block.text}\n${block.translation}` : block.translation!
    const quad = block.quad?.map(([x, y]) => [x * viewportWidth, y * viewportHeight])
    const angle = quad ? Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]) * 180 / Math.PI : block.angle
    const radians = angle * Math.PI / 180
    const sourceWidth = quad ? Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]) : block.width * viewportWidth
    const sourceHeight = quad ? Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]) : block.height * viewportHeight
    const originX = quad ? quad[0][0] : block.x * viewportWidth
    const originY = quad ? quad[0][1] : block.y * viewportHeight
    const textWidth = Math.max(1, sourceWidth)
    let textHeight = Math.max(1, sourceHeight)
    const inset = Math.min(padding, textHeight * 0.1, textWidth * 0.1)
    const neededHeight = (size: number) => screenTextLines(text, Math.max(1, textWidth - inset * 2), size, measure) * size * 1.45 + inset * 2
    const sourceLines = Math.max(1, block.text.split('\n').length)
    const minimumSize = preferredSize ? 12 : 10
    let fontSize = Math.max(minimumSize, Math.floor(Math.min(preferredSize || Infinity, (textHeight - inset * 2) / (sourceLines * 1.45))))
    while (fontSize > minimumSize && neededHeight(fontSize) > textHeight) fontSize--
    const c = Math.cos(radians), s = Math.sin(radians)
    const endX = originX + textWidth * c, endY = originY + textWidth * s
    // Extra lines grow from the same text origin, bounded by the screen edges.
    const region = regions.find(item => item.id === block.regionId)
    const left = (region?.x ?? 0) * viewportWidth, top = (region?.y ?? 0) * viewportHeight
    const right = region ? (region.x + region.width) * viewportWidth : viewportWidth
    const bottom = region ? (region.y + region.height) * viewportHeight : viewportHeight
    let availableHeight = Infinity
    for (const [x, y] of [[originX, originY], [endX, endY]]) {
      if (Math.abs(s) > 1e-6) availableHeight = Math.min(availableHeight, s > 0 ? (x - left) / s : (right - x) / -s)
      if (Math.abs(c) > 1e-6) availableHeight = Math.min(availableHeight, c > 0 ? (bottom - y) / c : (y - top) / -c)
    }
    textHeight = Math.max(1, Math.min(Math.max(textHeight, neededHeight(fontSize)), Math.max(1, availableHeight)))
    const centerX = originX + textWidth * c / 2 - textHeight * s / 2
    const centerY = originY + textWidth * s / 2 + textHeight * c / 2
    const width = Math.abs(textWidth * c) + Math.abs(textHeight * s)
    const height = Math.abs(textWidth * s) + Math.abs(textHeight * c)
    return { id: block.id, x: centerX - width / 2, y: centerY - height / 2, width, height,
      textWidth, textHeight, angle, fontSize, text, overflow: neededHeight(fontSize) > textHeight + 0.01, padding: inset }
  })
}
