import type { ActiveFeature, FeatureActivitySnapshot } from '../shared/feature-activity'

export interface FeatureLease {
  running(): void
  stopping(): void
  release(): void
}

/** A synchronous reservation precedes every asynchronous startup and survives teardown. */
export class FeatureActivity {
  private current: { owner: ActiveFeature; phase: FeatureActivitySnapshot['phase']; token: symbol; stop: () => Promise<void> } | null = null
  private stopping: Promise<void> | null = null
  constructor(private readonly changed: (snapshot: FeatureActivitySnapshot) => void = () => {}) {}
  snapshot(): FeatureActivitySnapshot { return this.current ? { owner: this.current.owner, phase: this.current.phase } : { owner: null, phase: 'idle' } }
  assertAvailable(owner: ActiveFeature): void {
    if (this.current && (this.current.owner !== owner || this.current.phase === 'stopping')) throw new Error(`FEATURE_CONFLICT:${this.current.owner}`)
  }
  acquire(owner: ActiveFeature, stop: () => Promise<void>): FeatureLease {
    if (this.current) throw new Error(`FEATURE_CONFLICT:${this.current.owner}`)
    const token = Symbol(owner)
    this.current = { owner, phase: 'starting', token, stop }
    this.publish()
    return {
      running: () => { if (this.current?.token === token && this.current.phase !== 'stopping') { this.current.phase = 'running'; this.publish() } },
      stopping: () => { if (this.current?.token === token) { this.current.phase = 'stopping'; this.publish() } },
      release: () => { if (this.current?.token === token && !this.stopping) { this.current = null; this.publish() } },
    }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    if (!this.current) return Promise.resolve()
    const current = this.current
    current.phase = 'stopping'
    this.publish()
    const task = Promise.resolve().then(current.stop).then(() => {
      if (this.current?.token === current.token) { this.current = null; this.publish() }
    }).catch(error => {
      if (this.current?.token === current.token) { current.phase = 'running'; this.publish() }
      throw error
    }).finally(() => { if (this.stopping === task) this.stopping = null })
    this.stopping = task
    return task
  }
  private publish(): void { this.changed(this.snapshot()) }
}
