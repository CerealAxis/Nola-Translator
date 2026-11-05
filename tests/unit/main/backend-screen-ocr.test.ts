import { afterEach, expect, it, vi } from 'vitest'
import { BackendScreenOcr } from '../../../src/main/backend-direct-model'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { BackendSupervisor } from '../../../src/main/backend-supervisor'

const clients: BackendScreenOcr[] = []
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers(); vi.unstubAllGlobals() })
const backend = { ready: true, baseUrl: 'http://127.0.0.1:9876', authorizationHeader: () => ({ Authorization: 'Bearer fixture' }) } as unknown as BackendSupervisor
const resource = { resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'OCR', description: 'OCR model', languages: ['zh'], installed: false, installedBytes: 0, state: 'running', cancellable: true }
function create() {
  const changed = vi.fn(), ensureBackend = vi.fn(async () => {})
  const client = new BackendScreenOcr({ backend: () => backend, ensureBackend, settings: () => DEFAULT_SETTINGS, changed })
  clients.push(client)
  return { client, changed, ensureBackend }
}
it('reports download progress to model management without a screen session', async () => {
  vi.useFakeTimers()
  let reads = 0
  const fetch = vi.fn(async (_url: URL, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'POST' ? {}
    : ++reads === 1 ? { installed: false, state: 'running', resource }
      : { installed: true, state: 'idle', resource: { ...resource, installed: true, state: 'idle' } })))
  vi.stubGlobal('fetch', fetch)
  const { client, changed } = create()
  await client.install()
  await vi.advanceTimersByTimeAsync(1000)
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({ installed: true, state: 'idle' })
  const calls = fetch.mock.calls.length
  await vi.advanceTimersByTimeAsync(3000)
  expect(fetch).toHaveBeenCalledTimes(calls)
  const post = fetch.mock.calls[0][1]!
  expect(JSON.parse(post.body as string)).toHaveProperty('network')
  expect(fetch.mock.calls.map(([url]) => url.pathname)).not.toContain('/api/v2/screen/ocr/load')
})
it('reports interrupted resource polling as a model-management failure', async () => {
  vi.useFakeTimers()
  let reads = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (++reads > 1) throw new Error('Connection refused')
    return new Response(JSON.stringify({ installed: false, state: 'running', resource }))
  }))
  const { client, changed } = create()
  await client.status()
  await vi.advanceTimersByTimeAsync(1000)
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({ state: 'failed', errorCode: 'backendUnavailable', cancellable: false })
})
it('does not restart the backend when releasing a model after backend exit', async () => {
  const ensureBackend = vi.fn()
  const client = new BackendScreenOcr({ backend: () => undefined, ensureBackend, settings: () => DEFAULT_SETTINGS, changed: vi.fn() })
  clients.push(client)
  await client.release()
  expect(ensureBackend).not.toHaveBeenCalled()
})

it('loads, infers and releases the selected language pack while management can address a different pack', async () => {
  const fetch = vi.fn(async (url: URL, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'POST' && url.pathname === '/api/v2/screen/ocr'
    ? { width: 100, height: 50, blocks: [] } : { installed: true, state: 'idle' })))
  vi.stubGlobal('fetch', fetch)
  const { client } = create()
  await client.load('pp-ocrv5-mobile-latin-onnx')
  await client.status('pp-ocrv5-mobile-korean-onnx')
  await client.infer({ image: 'data:image/png;base64,fixture', language: 'fr' }, new AbortController().signal)
  await client.release()
  expect(fetch.mock.calls.map(([url]) => url.searchParams.get('resource_id'))).toEqual([
    'pp-ocrv5-mobile-latin-onnx', 'pp-ocrv5-mobile-korean-onnx', 'pp-ocrv5-mobile-latin-onnx', 'pp-ocrv5-mobile-latin-onnx',
  ])
})
