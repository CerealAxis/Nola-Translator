import { useEffect, useRef } from 'react'
import { showToast } from '../../../src/renderer/components/ui/toast'
import { errorKey, type browserText } from '../i18n'

export function useErrorToasts(t: ReturnType<typeof browserText>, ...errors: Array<string | undefined>) {
  const previous = useRef(new Set<string>())
  useEffect(() => {
    const current = new Set(errors.filter((error): error is string => Boolean(error)))
    for (const error of current) {
      if (!previous.current.has(error)) {
        const type = error === 'tabAudioSilent' || error === 'tabAudioSilentTrySharing' ? 'warning' : 'error'
        showToast({ type, description: t(errorKey(error)) })
      }
    }
    previous.current = current
  })
}
