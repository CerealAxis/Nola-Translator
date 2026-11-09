import type { ExtensionBridge } from './bridge'
import { translate } from './provider-client'

type Lane = 'web' | 'video'
interface Job { run(): Promise<void>; cancel(): void; signal: AbortSignal }
export const TEXT_TRANSLATION_CONCURRENCY = 3
const lanes = ['video', 'web'] as const
export function createTextTranslation(bridge: ExtensionBridge) {
  const queues: Record<Lane, Job[]> = { video: [], web: [] }
  const active = { web: 0, video: 0 }
  let limits = { web: TEXT_TRANSLATION_CONCURRENCY, video: TEXT_TRANSLATION_CONCURRENCY }
  let shared = true
  let closed = false
  const lifetime = new AbortController()
  const runNext = () => {
    if (closed || shared && active.web + active.video >= Math.max(limits.web, limits.video)) return
    for (const lane of lanes) {
      if (active[lane] >= limits[lane]) continue
      let job = queues[lane].shift()
      while (job?.signal.aborted) job = queues[lane].shift()
      if (!job) continue
      active[lane]++
      void job.run().finally(() => { active[lane]--; runNext() })
      runNext()
      return
    }
  }
  return {
    translate(text: string, sourceLanguage: string, targetLanguage: string, lane: Lane, signal: AbortSignal): Promise<string> {
      signal = AbortSignal.any([signal, lifetime.signal])
      if (signal.aborted || closed) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return new Promise((resolve, reject) => {
        const abort = () => { const index = queues[lane].indexOf(job); if (index >= 0) queues[lane].splice(index, 1); signal.removeEventListener('abort', abort); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }
        const job: Job = { signal, cancel: abort, async run() {
          try { resolve(await translate(text, sourceLanguage, targetLanguage, lane === 'video' ? 'subtitle' : 'web', signal)) }
          catch (error) { reject(error) }
          finally { signal.removeEventListener('abort', abort) }
        } }
        signal.addEventListener('abort', abort, { once: true })
        queues[lane].push(job)
        runNext()
      })
    },
    close() { closed = true; lifetime.abort(); for (const lane of [queues.web, queues.video]) for (const job of [...lane]) job.cancel(); bridge.close() },
    configure(web: number, video: number, sameProvider: boolean) { limits = { web, video }; shared = sameProvider; runNext() },
  }
}
export type TextTranslation = Pick<ReturnType<typeof createTextTranslation>, 'translate' | 'close'>
