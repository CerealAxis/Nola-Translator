import type { ActiveFeature, FeatureActivitySnapshot } from '../shared/feature-activity'

export interface FeatureLease {
  running(): void
  stopping(): void
  release(): void
}

/** Track independent features; only duplicate starts of the same feature are excluded. */
export class FeatureActivity {
  private readonly active = new Map<ActiveFeature, { owner: ActiveFeature; phase: 'starting' | 'running' | 'stopping'; token: symbol; stop: () => Promise<void> }>()
  private stopping: Promise<void> | null = null
  constructor(private readonly changed: (snapshot: FeatureActivitySnapshot) => void = () => {}) {}
  snapshot(): FeatureActivitySnapshot {
    const activities = [...this.active.values()].map(({ owner, phase }) => ({ owner, phase }))
    return { owner: activities[0]?.owner ?? null, phase: activities[0]?.phase ?? 'idle', activities }
  }
  has(owner: ActiveFeature): boolean { return this.active.has(owner) }
  isStopping(owner: ActiveFeature): boolean { return this.active.get(owner)?.phase === 'stopping' }
  assertAvailable(owner: ActiveFeature): void {
    if (this.active.get(owner)?.phase === 'stopping') throw new Error(`FEATURE_CONFLICT:${owner}`)
  }
  acquire(owner: ActiveFeature, stop: () => Promise<void>): FeatureLease {
    if (this.active.has(owner)) throw new Error(`FEATURE_CONFLICT:${owner}`)
    const token = Symbol(owner)
    this.active.set(owner, { owner, phase: 'starting', token, stop })
    this.publish()
    return {
      running: () => { const current = this.active.get(owner); if (current?.token === token && current.phase !== 'stopping') { current.phase = 'running'; this.publish() } },
      stopping: () => { const current = this.active.get(owner); if (current?.token === token) { current.phase = 'stopping'; this.publish() } },
      release: () => { if (this.active.get(owner)?.token === token && !this.stopping) { this.active.delete(owner); this.publish() } },
    }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    if (!this.active.size) return Promise.resolve()
    const current = [...this.active.values()].sort((a, b) => Number(a.owner === 'model-gateway') - Number(b.owner === 'model-gateway'))
    for (const item of current) item.phase = 'stopping'
    this.publish()
    const task = Promise.resolve().then(async () => {
      const errors: unknown[] = []
      for (const item of current) {
        try { await item.stop(); if (this.active.get(item.owner)?.token === item.token) this.active.delete(item.owner) }
        catch (error) { item.phase = 'running'; errors.push(error) }
        this.publish()
      }
      if (errors.length) throw errors[0]
    }).finally(() => { if (this.stopping === task) this.stopping = null })
    this.stopping = task
    return task
  }
  private publish(): void { this.changed(this.snapshot()) }
}
