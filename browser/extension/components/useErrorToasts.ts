import { useEffect, useRef } from 'react'
import { showToast } from '../../../src/renderer/components/ui/toast'
import { browserErrorDescription, type browserText } from '../i18n'
import { recordDiagnostic, type DiagnosticContext } from '../diagnostics'

export function useErrorToasts(context: DiagnosticContext, t: ReturnType<typeof browserText>, ...errors: Array<string | undefined>) {
  const previous = useRef(new Set<string>())
  useEffect(() => {
    const current = new Set(errors.filter((error): error is string => Boolean(error)))
    for (const error of current) {
      if (!previous.current.has(error)) {
        const type = error === 'tabAudioSilent' || error === 'tabAudioSilentTrySharing' ? 'warning' : 'error'
        if (type === 'error' && error !== 'restrictedPage') recordDiagnostic(context, error)
        showToast({ type, description: browserErrorDescription(t, error) })
      }
    }
    previous.current = current
  })
}
