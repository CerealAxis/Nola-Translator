import { useEffect, useRef, useState } from 'react'
import { getBridge } from '@/store'
import { notifyError } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { ttsText } from '@/i18n/tts-ui'
import { voiceRefKey, type TtsVoiceRef } from '../../../shared/tts/voice-ref'
import type { TtsUsage, TtsVoiceCompatibility } from '../../../shared/tts/voice-library-api'

export function useVoiceCompatibility(binding: string, languages: string[], refs: TtsVoiceRef[], refreshKey = '', usage: TtsUsage = 'synthesis') {
  const { language: uiLanguage } = useI18n()
  const failureReported = useRef(false)
  const identity = JSON.stringify([binding, [...new Set(languages)], refs, refreshKey, usage])
  const [state, setState] = useState<{ identity: string; results: Map<string, TtsVoiceCompatibility>; failed?: boolean }>({ identity: '', results: new Map() })
  useEffect(() => {
    let active = true
    const api = getBridge()?.voices
    const targets = [...new Set(languages.filter(Boolean))]
    if (!api || !binding || !targets.length || !refs.length) {
      setState({ identity, results: new Map() })
      return
    }
    void Promise.all(targets.flatMap(language => Array.from({ length: Math.ceil(refs.length / 2000) }, (_, index) =>
      api.compatibility(binding, language, refs.slice(index * 2000, (index + 1) * 2000), usage)))).then(batches => {
      const results = new Map<string, TtsVoiceCompatibility>()
      for (const item of batches.flat()) {
        const key = voiceRefKey(item.ref)
        if (!results.has(key) || !item.compatible) results.set(key, item)
      }
      if (active) { failureReported.current = false; setState({ identity, results }) }
    }).catch(cause => {
      if (active) {
        setState({ identity, results: new Map(), failed: true })
        if (!failureReported.current) { failureReported.current = true; notifyError(ttsText(uiLanguage, 'compatibilityFailed'), { cause }) }
      }
    })
    return () => { active = false }
  }, [identity])
  return { results: state.identity === identity ? state.results : new Map<string, TtsVoiceCompatibility>(),
    pending: state.identity !== identity, failed: state.identity === identity && state.failed }
}
