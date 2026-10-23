import { net } from 'electron'
import { GITHUB_PROXY_AUTO, GITHUB_PROXY_OFF, GITHUB_PROXY_NODES } from '../shared/github-proxies'
import { logDiagnostic, processFailure } from './session-log'

/**
 * How long a winning node keeps serving downloads. Long enough that one runtime install never probes
 * twice, short enough that a node which stopped answering is replaced within a session or two.
 */
const PROBE_TTL_MS = 30 * 60_000

/** Per-request budget, and therefore the deadline of the whole round: it is asked only once. */
const PROBE_TIMEOUT_MS = 3000

/** Keep this asset in sync with the llama.cpp release pinned by the runtime catalog generator. */
const PROBE_ASSET_URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b11532/llama-b11532-bin-win-cpu-x64.zip'
const PROBE_ASSET_FILENAME = 'llama-b11532-bin-win-cpu-x64.zip'

let cached: { node: string | null; at: number } | null = null
let inFlight: Promise<string | null> | null = null

/**
 * Asks every catalog node at the same time and takes the first one to serve the runtime archive.
 *
 * A proxy front page or error page can answer HTTP while the download route is broken, so the probe
 * checks the expected archive headers instead of treating every HTTP response as reachable. Leaving
 * on the first valid answer bounds the round by the winner instead of the slowest node.
 */
function probeFastestNode(): Promise<string> {
  const controller = new AbortController()
  // A backstop in case the transport ignores an aborted request: without it the requests that never
  // settle would keep the all-failed branch from ever running, and the caller would wait forever.
  const deadline = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const probed = new Promise<string>((resolve, reject) => {
    let remaining = GITHUB_PROXY_NODES.length
    if (remaining === 0) { reject(new Error('github proxy catalog is empty')); return }
    for (const node of GITHUB_PROXY_NODES) {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)])
      void net.fetch(`${node}${PROBE_ASSET_URL}`, { method: 'HEAD', signal }).then(response => {
        const contentType = response.headers.get('content-type') ?? ''
        const contentDisposition = response.headers.get('content-disposition') ?? ''
        const servesArchive = response.ok
          && contentType.includes('application/octet-stream')
          && contentDisposition.toLowerCase().includes(PROBE_ASSET_FILENAME)
        if (servesArchive) resolve(node)
        else if (--remaining === 0) reject(new Error(`no github proxy node served the runtime archive within ${PROBE_TIMEOUT_MS} ms`))
      }, () => {
        if (--remaining === 0) reject(new Error(`no github proxy node answered within ${PROBE_TIMEOUT_MS} ms`))
      })
    }
  })
  return probed.finally(() => { clearTimeout(deadline); controller.abort() })
}

/**
 * Turns the stored setting into the prefix a GitHub asset URL is built with.
 *
 * An explicit node is returned as typed; `auto` resolves to a reachable catalog node or null so the
 * caller can keep the official URL. Settings are read per call, so node changes apply immediately.
 */
export async function resolveGithubProxyNode(selected: string): Promise<string | null> {
  const value = selected.trim()
  if (value === GITHUB_PROXY_OFF) return null
  if (value !== GITHUB_PROXY_AUTO) return value
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.node
  // Downloads issued together share one round rather than each opening its own over a hundred sockets.
  if (!inFlight) {
    inFlight = probeFastestNode()
      .then(node => {
        cached = { node, at: Date.now() }
        logDiagnostic('github-proxy.probe.resolved', { node, candidates: GITHUB_PROXY_NODES.length })
        return node
      }, error => {
        // Losing every node is an ordinary outcome. Returning null lets the caller keep the direct URL.
        cached = { node: null, at: Date.now() }
        logDiagnostic('github-proxy.probe.direct-fallback', processFailure(error))
        return null
      })
      .finally(() => { inFlight = null })
  }
  return inFlight
}
