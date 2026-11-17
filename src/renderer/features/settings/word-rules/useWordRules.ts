import { useEffect, useState } from 'react'
import { getBridge } from '@/store'
import { emptyWordRules, type WordRulesDocument } from '../../../../shared/word-rules'

export function useWordRules() {
  const [document, setDocument] = useState<WordRulesDocument>(emptyWordRules)
  const [failed, setFailed] = useState(false)
  const api = getBridge()?.wordRules
  useEffect(() => {
    if (!api) return
    let live = true
    const load = () => {
      void api
        .snapshot()
        .then((value) => {
          if (live) {
            setDocument((previous) => (value.revision >= previous.revision ? value : previous))
            setFailed(false)
          }
        })
        .catch(() => {
          if (live) setFailed(true)
        })
    }
    load()
    const dispose = api.onChanged(load)
    return () => {
      live = false
      dispose()
    }
  }, [api])
  const refresh = async () => {
    if (!api) return
    try {
      const value = await api.snapshot()
      setDocument((previous) => (value.revision >= previous.revision ? value : previous))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }
  return { document, failed, api, refresh }
}
