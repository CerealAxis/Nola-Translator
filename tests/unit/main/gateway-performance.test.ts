import { expect, it, vi } from 'vitest'
import { gatewayPerformanceSnapshot, measureCloudFetch } from '../../../src/main/gateway-performance'

it('records a cloud call at stream completion and clears counts on abort', async () => {
  let controller!: ReadableStreamDefaultController
  const request = measureCloudFetch('provider-model', async () => new Response(new ReadableStream({
    start(value) { controller = value },
  })))
  const gateway = { baseUrl: 'http://127.0.0.1:3000', authorizationHeader: () => ({ Authorization: 'Bearer test' }) }
  const cancel = new AbortController()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    end: Date.now(), calls: [], hardware: [], tasks: [{ at: Date.now() - 1000, active: 0, queued: 1 }],
  })))
  const snapshot = () => gatewayPerformanceSnapshot(gateway, new AbortController().signal)
  try {
    const response = await request('https://example.com')
    expect((await snapshot()).tasks.at(-1)).toMatchObject({ active: 1, queued: 1 })
    expect((await snapshot()).calls).toHaveLength(0)
    const reading = response.text()
    controller.close()
    await reading
    const complete = await snapshot()
    expect(complete.calls).toHaveLength(1)
    expect(complete.calls[0]).toMatchObject({ model: 'provider-model', duration: expect.any(Number) })
    expect(complete.tasks.at(-1)?.active).toBe(0)
    await request('https://example.com', { signal: cancel.signal })
    cancel.abort()
    const aborted = await snapshot()
    expect(aborted.calls).toHaveLength(2)
    expect(aborted.tasks.at(-1)?.active).toBe(0)
  } finally { vi.unstubAllGlobals() }
})
