import type { LatencySnapshot } from '../../shared/latency'

export function subscribeLatency(listener: (snapshot: LatencySnapshot) => void, onFailure: () => void): () => void {
  const bridge = window.nolaTranslator
  let received = false
  let active = true
  const unsubscribe = bridge?.onLatencySnapshot?.(snapshot => {
    received = true
    if (active) listener(snapshot)
  })
  if (!bridge?.getLatencySnapshot) onFailure()
  void bridge?.getLatencySnapshot?.().then(snapshot => {
    if (active && !received && snapshot) listener(snapshot)
  }).catch(error => {
    console.error('[latency] snapshot failed', error)
    if (active && !received) onFailure()
  })
  return () => { active = false; unsubscribe?.() }
}
