import type { ScreenAppearance, ScreenConfig, ScreenTextBlock } from '../shared/screen-translation'

export interface OcrBlock { id: string; text: string; confidence: number; quad: number[][]; appearance?: ScreenAppearance }
type Candidate = { block: ScreenTextBlock; first: number; lastText: string; seen: number; failures: number }

/** Keep text revisions independent of video frames so animation cannot starve translations. */
export class ScreenPipeline {
  private readonly regions = new Map<string, Map<string, Candidate>>()
  private readonly cache = new Map<string, string>()
  private readonly pending = new Map<string, Candidate>()
  private readonly active = new Set<Candidate>()
  private readonly abort = new AbortController()
  private revision = 0
  private stopped = false
  private lastRegion?: string

  constructor(private readonly config: ScreenConfig,
    private readonly translate: (text: string, signal: AbortSignal) => Promise<string>,
    private readonly changed: () => void,
    private readonly failed: () => void) {}

  blocks(): ScreenTextBlock[] { return [...this.regions.values()].flatMap(region => [...region.values()].map(item => ({ ...item.block }))) }

  hideRegion(regionId: string): void {
    for (const item of this.regions.get(regionId)?.values() ?? []) item.block.appearancePending = true
    this.changed()
  }

  update(regionId: string, input: OcrBlock[], width: number, height: number, now = Date.now()): void {
    if (this.stopped) return
    const region = this.config.regions.find(item => item.id === regionId)
    if (!region) return
    const previous = this.regions.get(regionId) ?? new Map<string, Candidate>()
    const next = new Map<string, Candidate>()
    const used = new Set<Candidate>()
    for (const item of input.filter(item => item.text.trim() && item.confidence >= 0.45)) {
      const xs = item.quad.map(point => point[0]), ys = item.quad.map(point => point[1])
      const x = Math.max(0, Math.min(...xs) / width), y = Math.max(0, Math.min(...ys) / height)
      const w = Math.min(1 - x, (Math.max(...xs) - Math.min(...xs)) / width)
      const h = Math.min(1 - y, (Math.max(...ys) - Math.min(...ys)) / height)
      if (!(w > 0 && h > 0)) continue
      const text = item.text.trim()
      const old = [...previous.values()].find(value => !used.has(value)
        && Math.abs(value.block.x - (region.x + x * region.width)) < region.width * 0.035
        && Math.abs(value.block.y - (region.y + y * region.height)) < region.height * 0.035)
      if (old) used.add(old)
      const angle = Math.atan2(item.quad[1][1] - item.quad[0][1], item.quad[1][0] - item.quad[0][0]) * 180 / Math.PI
      const block: ScreenTextBlock = {
        id: old?.block.id ?? `${regionId}:${++this.revision}`, regionId, text,
        revision: old?.block.text === text ? old.block.revision : ++this.revision,
        x: region.x + x * region.width, y: region.y + y * region.height,
        width: w * region.width, height: h * region.height, angle,
        quad: item.quad.map(point => [region.x + point[0] / width * region.width, region.y + point[1] / height * region.height]),
        appearance: item.appearance ? { ...item.appearance, patches: item.appearance.patches.map(patch => ({ ...patch,
          x: region.x + patch.x * region.width, y: region.y + patch.y * region.height,
          width: patch.width * region.width, height: patch.height * region.height })) } : undefined,
        status: 'stabilizing',
      }
      let candidate: Candidate
      if (old?.block.text === text) {
        candidate = old
        candidate.seen++
        candidate.block = { ...candidate.block, x: block.x, y: block.y, width: block.width, height: block.height, angle, quad: block.quad, appearance: block.appearance, hidden: false, appearancePending: false }
      } else {
        if (old) this.pending.delete(old.block.id)
        candidate = { block, first: old && (old.block.status === 'stabilizing' || old.block.status === 'translating') ? old.first : now, lastText: text, seen: 1, failures: 0 }
      }
      next.set(candidate.block.id, candidate)
      if (candidate.block.status === 'stabilizing' && (candidate.seen >= 2 || now - candidate.first >= 1200)) {
        const key = `${this.config.model}\0${this.config.sourceLanguage}\0${this.config.targetLanguage}\0${text}`
        const cached = this.cache.get(key)
        if (cached !== undefined) { candidate.block.translation = cached; candidate.block.status = 'ready' }
        else { candidate.block.status = 'translating'; this.pending.set(candidate.block.id, candidate) }
      }
    }
    for (const [id, item] of previous) if (!next.has(id) || this.pending.get(id) === item && next.get(id) !== item) this.pending.delete(id)
    this.regions.set(regionId, next)
    this.changed()
    this.drain()
  }

  stop(): void {
    this.stopped = true
    this.abort.abort()
    this.pending.clear()
    this.regions.clear()
  }

  private drain(): void {
    while (!this.stopped && this.active.size < 2 && this.pending.size) {
      const [id, candidate] = [...this.pending].find(([, item]) => item.block.regionId !== this.lastRegion) ?? this.pending.entries().next().value!
      this.lastRegion = candidate.block.regionId
      this.pending.delete(id)
      if (this.regions.get(candidate.block.regionId)?.get(id) !== candidate) continue
      this.active.add(candidate)
      const revision = candidate.block.revision
      void this.translate(candidate.block.text, this.abort.signal).then(translation => {
        if (!translation.trim()) throw new Error('Empty screen translation')
        if (this.stopped || this.regions.get(candidate.block.regionId)?.get(id) !== candidate || candidate.block.revision !== revision) return
        const key = `${this.config.model}\0${this.config.sourceLanguage}\0${this.config.targetLanguage}\0${candidate.block.text}`
        this.cache.set(key, translation)
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!)
        candidate.block.translation = translation
        candidate.block.status = 'ready'
      }).catch(() => {
        if (this.stopped || this.regions.get(candidate.block.regionId)?.get(id) !== candidate) return
        if (++candidate.failures < 2) this.pending.set(id, candidate)
        else { candidate.block.status = 'error'; this.failed() }
      }).finally(() => { this.active.delete(candidate); if (!this.stopped) { this.changed(); this.drain() } })
    }
  }
}

/** Join aligned dialogue lines while keeping separated menu columns and controls independent. */
export function mergeScreenLines(input: OcrBlock[], imageWidth: number): OcrBlock[] {
  const box = (block: OcrBlock) => ({ left: Math.min(...block.quad.map(point => point[0])), right: Math.max(...block.quad.map(point => point[0])), top: Math.min(...block.quad.map(point => point[1])), bottom: Math.max(...block.quad.map(point => point[1])) })
  const result: OcrBlock[] = []
  for (const block of [...input].sort((a, b) => box(a).top - box(b).top || box(a).left - box(b).left)) {
    const b = box(block)
    const previous = [...result].reverse().find(item => {
      const a = box(item), lineHeight = b.bottom - b.top
      return Math.abs(a.left - b.left) <= imageWidth * 0.015 && b.top >= a.bottom - lineHeight * 0.15
        && b.top - a.bottom < lineHeight * 0.65 && Math.min(a.right - a.left, b.right - b.left) >= Math.max(a.right - a.left, b.right - b.left) * 0.5
        && Math.abs(item.quad[0][1] - item.quad[1][1]) < lineHeight * 0.2 && Math.abs(block.quad[0][1] - block.quad[1][1]) < lineHeight * 0.2
    })
    if (!previous) { result.push({ ...block, quad: block.quad.map(point => [...point]) }); continue }
    const a = box(previous), left = Math.min(a.left, b.left), right = Math.max(a.right, b.right)
    previous.text += `\n${block.text}`
    previous.confidence = Math.min(previous.confidence, block.confidence)
    if (previous.appearance && block.appearance) previous.appearance = { ...previous.appearance, patches: [...previous.appearance.patches, ...block.appearance.patches] }
    previous.quad = [[left, a.top], [right, a.top], [right, b.bottom], [left, b.bottom]]
  }
  return result
}
