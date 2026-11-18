import type { ScreenBlurPatch, ScreenRegion, ScreenTextBlock } from '../../../shared/screen-translation'

export interface OverlayLayout { id: string; x: number; y: number; width: number; height: number; textWidth: number; textHeight: number; angle: number; fontSize: number; text: string; overflow: boolean; padding: number; ink?: string; patches?: ScreenBlurPatch[] }
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

export function layoutScreenOverlay(blocks: ScreenTextBlock[], viewport: { width: number; height: number }, preferredSize: number,
  showSource: boolean, measure: MeasureScreenText, padding: number, regions: ScreenRegion[] = []): OverlayLayout[] {
  const viewportWidth = Math.max(1, viewport.width), viewportHeight = Math.max(1, viewport.height)
  return visibleScreenBlocks(blocks).map(block => {
    const text = showSource ? `${block.text}\n${block.translation}` : block.translation!
    const quad = block.quad?.map(([x, y]) => [x * viewportWidth, y * viewportHeight])
    const angle = quad ? Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]) * 180 / Math.PI : block.angle
    const rotate = Math.abs(angle) >= 0.3
    const radians = rotate ? angle * Math.PI / 180 : 0
    const c = Math.cos(radians), s = Math.sin(radians)
    const edge = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
    const originX = rotate && quad ? quad[0][0] : block.x * viewportWidth
    const originY = rotate && quad ? quad[0][1] : block.y * viewportHeight
    let textWidth = Math.max(1, rotate && quad ? (edge(quad[0], quad[1]) + edge(quad[2], quad[3])) / 2 : block.width * viewportWidth)
    let textHeight = Math.max(1, rotate && quad ? (edge(quad[0], quad[3]) + edge(quad[1], quad[2])) / 2 : block.height * viewportHeight)
    const inset = Math.min(padding, textWidth / 12, textHeight / 12)
    const neededHeight = (size: number, width: number) =>
      screenTextLines(text, Math.max(1, width - inset * 2), size, measure) * size * 1.45 + inset * 2
    const tokens = text.match(/[^\s]+/gu) ?? []
    const longest = (size: number) => tokens.reduce((width, token) => Math.max(width, measure(token, size)), 0) + inset * 2
    const sourceSize = Math.round((block.lineHeight ?? block.height) * viewportHeight * 0.85)
    let high = preferredSize || Math.max(10, Math.min(100, sourceSize))
    let fontSize = Math.min(12, high)
    while (fontSize < high) {
      const trial = Math.ceil((fontSize + high) / 2)
      if (longest(trial) <= textWidth && neededHeight(trial, textWidth) <= textHeight) fontSize = trial
      else high = trial - 1
    }

    let x = 0, y = 0
    if (neededHeight(fontSize, textWidth) > textHeight || longest(fontSize) > textWidth) {
      const region = regions.find(item => item.id === block.regionId)
      const left = (region?.x ?? 0) * viewportWidth, top = (region?.y ?? 0) * viewportHeight
      const right = region ? (region.x + region.width) * viewportWidth : viewportWidth
      const bottom = region ? (region.y + region.height) * viewportHeight : viewportHeight
      const local = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([px, py]) => {
        const dx = px - originX, dy = py - originY
        return [dx * c + dy * s, -dx * s + dy * c]
      })
      const xMin = Math.min(...local.map(point => point[0])), xMax = Math.max(...local.map(point => point[0]))
      const yMin = Math.min(...local.map(point => point[1])), yMax = Math.max(...local.map(point => point[1]))
      textWidth = Math.max(1, Math.min(xMax - xMin, Math.max(textWidth, longest(fontSize))))
      textHeight = Math.max(1, Math.min(yMax - yMin, Math.max(textHeight, neededHeight(fontSize, textWidth))))
      x = Math.max(xMin, Math.min(0, xMax - textWidth))
      y = Math.max(yMin, Math.min(0, yMax - textHeight))
    }
    const centerX = originX + (x + textWidth / 2) * c - (y + textHeight / 2) * s
    const centerY = originY + (x + textWidth / 2) * s + (y + textHeight / 2) * c
    const width = Math.abs(textWidth * c) + Math.abs(textHeight * s)
    const height = Math.abs(textWidth * s) + Math.abs(textHeight * c)
    return { id: block.id, x: centerX - width / 2, y: centerY - height / 2, width, height,
      textWidth, textHeight, angle: rotate ? angle : 0, fontSize, text,
      overflow: neededHeight(fontSize, textWidth) > textHeight + 0.01, padding: inset,
      ink: block.ink, patches: block.patches }
  })
}
