import { useEffect, useState } from 'react'
import { getBridge } from '@/store'
import type { TtsModelCapabilities } from '../../../shared/tts/capabilities'

export function useTtsCapabilities(modelBinding: string, modelId?: string, catalog = false) {
  const identity = JSON.stringify([modelBinding, modelId, catalog])
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [state, setState] = useState<{ binding: string; capabilities?: TtsModelCapabilities; error?: unknown }>({ binding: modelBinding })
  useEffect(() => {
    let current = true
    setState({ binding: identity })
    const api = getBridge()?.voices
    if (!api || !modelBinding) return
    void api.capabilities(modelBinding, refreshRevision > 0, modelId, catalog).then(capabilities => {
      if (current) setState({ binding: identity, capabilities })
    }).catch(error => { if (current) setState({ binding: identity, error }) })
    return () => { current = false }
  }, [modelBinding, modelId, identity, refreshRevision, catalog])
  return { ...(state.binding === identity ? state : { binding: identity }), refresh: () => setRefreshRevision(value => value + 1) }
}
