import type { GatewayPerformanceSnapshot, PerformanceCall, PerformanceTasks } from '../shared/gateway-performance'
import type { BackendSupervisor } from './backend-supervisor'

const retention = 30 * 60_000
const limit = 30_000
const calls: PerformanceCall[] = []
const tasks: PerformanceTasks[] = [{ at: Date.now(), active: 0, queued: 0 }]
let active = 0
const wallTime = () => performance.timeOrigin + performance.now()

function append<T>(history: T[], entry: T) {
  history.push(entry)
  if (history.length > limit + 512) history.splice(0, 512)
}

function begin(model: string) {
  const start = performance.now()
  append(tasks, { at: wallTime(), active: ++active, queued: 0 })
  let recorded = false
  return () => {
    if (recorded) return
    recorded = true
    const at = wallTime()
    append(calls, { at, model, duration: performance.now() - start })
    append(tasks, { at, active: --active, queued: 0 })
  }
}

export async function measureCloudCall<T>(model: string, request: () => Promise<T>): Promise<T> {
  const finish = begin(model)
  try { return await request() }
  finally { finish() }
}

export function measureCloudFetch(model: string, request: typeof fetch): typeof fetch {
  return async (input, init) => {
    const finish = begin(model)
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const done = () => { signal?.removeEventListener('abort', done); finish() }
    if (signal?.aborted) done()
    else signal?.addEventListener('abort', done, { once: true })
    try {
      const response = await request(input, init)
      if (!response.body) { done(); return response }
      const reader = response.body.getReader()
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read()
            if (next.done) { done(); controller.close() }
            else controller.enqueue(next.value)
          } catch (error) {
            done()
            controller.error(error)
          }
        },
        cancel(reason) { done(); return reader.cancel(reason) },
      })
      return new Response(body, response)
    } catch (error) {
      done()
      throw error
    }
  }
}

export async function gatewayPerformanceSnapshot(host: Pick<BackendSupervisor, 'baseUrl' | 'authorizationHeader'>,
  signal: AbortSignal): Promise<GatewayPerformanceSnapshot> {
  const response = await fetch(new URL('/api/v2/gateway/performance', host.baseUrl), {
    headers: host.authorizationHeader(), signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
  })
  if (!response.ok) throw new Error(`Gateway performance endpoint returned HTTP ${response.status}`)
  const snapshot: GatewayPerformanceSnapshot = await response.json()
  const end = wallTime()
  const cutoff = end - retention
  const firstCall = calls.findIndex(point => point.at >= cutoff)
  calls.splice(0, firstCall < 0 ? calls.length : firstCall)
  const firstTask = tasks.findIndex(point => point.at >= cutoff)
  tasks.splice(0, Math.max(0, (firstTask < 0 ? tasks.length : firstTask) - 1))

  const changes = [
    ...snapshot.tasks.map(point => ({ point, source: 0 })),
    ...tasks.map(point => ({ point, source: 1 })),
  ].sort((left, right) => left.point.at - right.point.at)
  const running = [0, 0]
  let queued = 0
  return {
    ...snapshot, end, calls: [...snapshot.calls, ...calls].sort((a, b) => a.at - b.at),
    tasks: changes.map(({ point, source }) => {
      running[source] = point.active
      if (source === 0) queued = point.queued
      return { at: point.at, active: running[0] + running[1], queued }
    }),
  }
}
