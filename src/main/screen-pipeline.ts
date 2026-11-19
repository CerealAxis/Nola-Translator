import type { ScreenBlurPatch, ScreenConfig, ScreenRegion, ScreenTextBlock } from '../shared/screen-translation'

export interface OcrBlock {
  text: string;
  quad: number[][];
  lineHeight?: number;
  ink?: string;
  patches?: ScreenBlurPatch[];
}
interface RegionRevision {
  lastText: string;
  abort: AbortController;
  blocks: ScreenTextBlock[];
  keys: string[];
}

export class ScreenPipeline {
  private readonly regions = new Map<string, RegionRevision>()
  private readonly cache = new Map<string, string>()
  private readonly pending: Array<{ region: RegionRevision; index: number }> = []
  private revision = 0
  private translating = false
  private stopped = false

  constructor(private readonly config: ScreenConfig,
    private readonly translate: (text: string, signal: AbortSignal) => Promise<string>,
    private readonly changed: () => void,
    private readonly failed: (error: unknown) => void,
    private readonly signature: (text: string) => string = () => '') {}

  blocks(): ScreenTextBlock[] {
    return [...this.regions.values()].flatMap(region => region.blocks.map(block => ({ ...block })))
  }

  update(region: ScreenRegion, input: OcrBlock[], width: number, height: number, force = false): void {
    if (this.stopped) return
    const entries = input.filter(item => item.text.trim() && item.quad.length === 4)
    const boxes = entries.map(bounds)
    const vertical = boxes.reduce((ratio, box) => box.min > 0 ? ratio + Math.log(box.width / box.height) : ratio, 0) < 0
    const space = /^(?:zh|ja)(?:-|$)/i.test(this.config.sourceLanguage) ? '' : ' '
    const merged = mergeScreenLines(entries, vertical, space)
    const text = sortLines(merged.map(bounds), vertical, space).map(line => line.text).join('\n')
    const previous = this.regions.get(region.id)
    const unchanged = previous && !force && text && editDistanceBelow(previous.lastText, text, this.config.textChangeThreshold)
    if (!text && !previous?.blocks.length) return
    const blocks = merged.map((block, index): ScreenTextBlock => {
      const quad = block.quad.map(([x, y]) => [region.x + x / width * region.width, region.y + y / height * region.height])
      const [left, top, right, bottom] = bounds({ ...block, quad }).edges
      const angle = Math.atan2((block.quad[1][1] - block.quad[0][1]) / height * region.height,
        (block.quad[1][0] - block.quad[0][0]) / width * region.width) * 180 / Math.PI
      const patches = block.patches?.map(patch => ({ ...patch,
        x: region.x + patch.x * region.width, y: region.y + patch.y * region.height,
        width: patch.width * region.width, height: patch.height * region.height,
      }))
      return { id: `${region.id}:${index}`, regionId: region.id, revision: this.revision + 1, text: block.text,
        x: left, y: top, width: right - left, height: bottom - top, angle, quad, status: 'translating',
        lineHeight: (block.lineHeight ?? sourceLineHeight(block)) / height * region.height,
        ink: block.ink, patches }
    })
    if (unchanged && previous) {
      previous.lastText = text
      if (blocks.length === previous.blocks.length && blocks.every((block, i) => block.text === previous.blocks[i].text)) {
        previous.blocks.forEach((block, i) => {
          const { x, y, width, height, angle, quad, lineHeight, patches, ink } = blocks[i]
          Object.assign(block, { x, y, width, height, angle, quad, lineHeight, patches, ink })
        })
        this.changed()
      }
      return
    }
    this.revision++
    this.replace(region.id, text, blocks)
  }

  refreshRules(): void {
    for (const [id, region] of this.regions) {
      if (region.blocks.some((block, index) => this.key(block.text) !== region.keys[index])) {
        this.replace(id, region.lastText, region.blocks.map(block => ({ ...block, revision: ++this.revision })))
      }
    }
  }

  stop(): void {
    this.stopped = true
    for (const region of this.regions.values()) region.abort.abort()
    this.pending.length = 0
    this.regions.clear()
  }

  private key(text: string): string {
    return JSON.stringify([this.signature(text), text])
  }

  private replace(id: string, text: string, blocks: ScreenTextBlock[]): void {
    const previous = this.regions.get(id)
    previous?.abort.abort()
    if (previous) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i].region === previous) this.pending.splice(i, 1)
      }
    }
    const region = { lastText: text, abort: new AbortController(), blocks, keys: blocks.map(block => this.key(block.text)) }
    this.regions.set(id, region)
    blocks.forEach((block, index) => {
      block.translation = this.cache.get(region.keys[index])
      block.status = block.translation === undefined ? 'translating' : 'ready'
      if (block.status === 'translating') this.pending.push({ region, index })
    })
    this.changed()
    if (!this.translating) void this.drain()
  }

  private async drain(): Promise<void> {
    this.translating = true
    try {
      let task = this.pending.shift()
      while (task) {
        const { region, index } = task
        const { signal } = region.abort
        const block = region.blocks[index], key = region.keys[index]
        if (!signal.aborted) {
          try {
            const cached = this.cache.get(key)
            const result = cached ?? await this.translate(block.text, signal)
            if (!signal.aborted) {
              this.cache.set(key, result)
              if (this.cache.size > 256) {
                const earliest = this.cache.keys().next()
                if (!earliest.done) this.cache.delete(earliest.value)
              }
              block.translation = result
              block.status = 'ready'
            }
          } catch (error) {
            if (!signal.aborted) { block.status = 'error'; this.failed(error) }
          }
          if (!signal.aborted) this.changed()
        }
        task = this.pending.shift()
      }
    } finally {
      this.translating = false
    }
  }
}

// Luna compares each recognized region against its immediately preceding OCR text.
export function editDistanceBelow(left: string, right: string, limit: number): boolean {
  if (left === right) return true
  if (Math.abs(left.length - right.length) >= limit) return false
  if (Math.max(left.length, right.length) < limit) return true
  let previous = Array.from({ length: right.length + 1 }, (_, i) => Math.min(i, limit))
  let current = previous.slice()
  for (let i = 1; i <= left.length; i++) {
    const start = Math.max(1, i - limit + 1), end = Math.min(right.length, i + limit - 1)
    current[start - 1] = Math.min(i, limit)
    for (let j = start; j <= end; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + Number(left[i - 1] !== right[j - 1]))
    }
    if (end < right.length) current[end + 1] = limit
    ;[previous, current] = [current, previous]
  }
  return previous[right.length] < limit
}

function bounds(block: OcrBlock) {
  const xs = block.quad.map(point => point[0]), ys = block.quad.map(point => point[1])
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys)
  const width = right - left, height = bottom - top
  return { ...block, edges: [left, top, right, bottom], width, height, min: Math.min(width, height) }
}

function sourceLineHeight({ quad: [a, b, c, d] }: OcrBlock): number {
  return (Math.hypot(d[0] - a[0], d[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2
}

function sortLines(boxes: ReturnType<typeof bounds>[], vertical: boolean, space: string) {
  const axis = vertical ? 0 : 1
  const center = (box: ReturnType<typeof bounds>, dim: number) => (box.edges[dim] + box.edges[dim + 2]) / 2
  const remaining = new Set(boxes)
  const lines = []
  for (const box of remaining) {
    remaining.delete(box)
    const row = [box]
    const mid = center(box, axis)
    for (const other of remaining) {
      const otherMid = center(other, axis)
      if (mid > other.edges[axis] && mid < other.edges[axis + 2]
          && otherMid > box.edges[axis] && otherMid < box.edges[axis + 2]) {
        row.push(other)
        remaining.delete(other)
      }
    }
    row.sort((a, b) => center(a, 1 - axis) - center(b, 1 - axis))
    lines.push({ mid: center(row[0], axis), ...bounds({ text: row.map(item => item.text).join(space),
      quad: row.flatMap(item => item.quad) }) })
  }
  return lines.sort((a, b) => vertical ? b.mid - a.mid : a.mid - b.mid)
}

// Group neighboring OCR boxes by Luna's relative distance and preserve the first box's angle.
export function mergeScreenLines(input: OcrBlock[], vertical: boolean, space: string): OcrBlock[] {
  const groups = input.map(item => [bounds(item)])
  const distance = (a: number[], b: number[]) =>
    Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0))
  const size = (group: ReturnType<typeof bounds>[]) => group.reduce((sum, box) => sum + box.min, 0) / group.length
  for (let i = 0; i < groups.length; i++) {
    for (let j = 0; j < groups.length; j++) {
      if (i === j) continue
      const threshold = 0.4 * Math.min(size(groups[i]), size(groups[j]))
      if (!groups[i].some(a => groups[j].some(b => distance(a.edges, b.edges) <= threshold))) continue
      groups[i].push(...groups[j])
      groups.splice(j, 1)
      if (j < i) i--
      j = -1
    }
  }
  return groups.map(group => {
    if (group.length === 1) {
      const { text, quad, ink, patches } = group[0]
      return { text, quad, ink, patches }
    }
    const lines = sortLines(group, vertical, space)
    const text = lines.map((line, index) => {
      if (!index) return line.text
      const previous = lines[index - 1], edge = vertical ? 3 : 2
      const tolerance = vertical ? Math.min(previous.width, line.width) : Math.min(previous.height, line.height)
      return (previous.edges[edge] < line.edges[edge] - tolerance ? '\n' : space) + line.text
    }).join('')
    const [a, b] = group[0].quad
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const points = group.flatMap(item => item.quad.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]))
    const [left, top, right, bottom] = bounds({ text, quad: points }).edges
    const quad = [[left, top], [right, top], [right, bottom], [left, bottom]]
      .map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])
    return { text, quad, lineHeight: group.reduce((sum, block) => sum + sourceLineHeight(block), 0) / group.length,
      ink: group[0].ink, patches: group.flatMap(block => block.patches ?? []) }
  })
}
