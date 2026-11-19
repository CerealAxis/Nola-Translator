import type { ComicModelInput } from './comic-model'
import type { ComicTask } from '../shared/comic'
import { normalizeThrownError } from '../shared/ipc-error'
import { logDiagnostic } from './session-log'

export type ComicRequest = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>
interface Claim { jobId: string; pageId: string; attemptId: string }
export class ComicTaskRunner {
  private running?: Promise<void>
  private stopped = false
  private requested = false
  private lifetime?: AbortController
  private current?: { id: string; controller: AbortController }
  constructor(private readonly request: ComicRequest, private readonly model: (input: ComicModelInput, signal: AbortSignal) => Promise<{ id: string; text: string }[]>, private readonly changed: () => void, private readonly active: (running: boolean) => void = () => {}) {}
  wake() {
    this.requested = true
    if (this.running) return
    this.stopped = false
    this.lifetime = new AbortController()
    this.active(true)
    this.running = this.drain(this.lifetime.signal).catch(error => { if (!this.stopped) console.error('[comic.queue]', error instanceof Error ? error.message : 'failed') }).finally(() => {
      this.running = undefined
      this.active(false)
      if (this.requested && !this.stopped) this.wake()
    })
  }
  cancel(id: string) { if (this.current?.id === id) this.current.controller.abort() }
  private async drain(signal: AbortSignal) {
    while (!this.stopped) {
      this.requested = false
      const claim = await this.request<Claim | null>('/jobs/claim', {}, signal)
      if (!claim || this.stopped) return
      const controller = new AbortController()
      this.current = { id: claim.jobId, controller }
      this.changed()
      const token = { pageId: claim.pageId, attemptId: claim.attemptId }
      try {
        const prepared = await this.request<ComicModelInput & Claim>(`/jobs/${claim.jobId}/prepare`, token, controller.signal)
        const translations = ['normal', 'visual', 'proof', 'translate'].includes(prepared.kind)
          ? await this.model(prepared, controller.signal) : []
        await this.request<ComicTask>(`/jobs/${claim.jobId}/complete`, { ...token, translations }, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) {
          logDiagnostic('comic.job.failed', { jobId: claim.jobId, attemptId: claim.attemptId,
            classification: normalizeThrownError(error), error })
        }
        await this.request(`/jobs/${claim.jobId}/complete`, { ...token, error: controller.signal.aborted ? 'cancelled' : error instanceof Error ? error.message.slice(0, 500) : 'comicFailed' }, AbortSignal.timeout(5000)).catch(() => {})
      } finally { this.current = undefined; this.changed() }
    }
  }
  async stop() {
    this.stopped = true
    this.lifetime?.abort()
    this.current?.controller.abort()
    await this.running
    await this.request('/jobs/interrupt', {}, AbortSignal.timeout(5000)).catch(() => {})
  }
}
