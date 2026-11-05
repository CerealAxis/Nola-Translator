import type { ExtensionBridge } from './bridge'
import { translate } from './provider-client'

type Lane = 'web' | 'video'
interface Job { run(): Promise<void>; cancel(): void; signal: AbortSignal }
export function createTextTranslation(bridge: ExtensionBridge) {
  const queues: Record<Lane, Job[]> = { video: [], web: [] }
  let active = 0
  let closed = false
  const lifetime = new AbortController()
  const runNext = () => {
    if (active >= 3 || closed) return
    const lane = queues.video.length ? 'video' : 'web'
    let job = queues[lane].shift()
    while (job?.signal.aborted) job = queues[lane].shift()
    if (!job) return
    active++
    void job.run().finally(() => { active--; runNext() })
    runNext()
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
  }
}
export type TextTranslation = ReturnType<typeof createTextTranslation>
