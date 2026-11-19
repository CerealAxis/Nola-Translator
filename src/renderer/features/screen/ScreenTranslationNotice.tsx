import { useEffect, useRef } from 'react'
import { notifyError, notifyGatewayIssue } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { getBridge } from '@/store'
import { SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from '../../../shared/error-catalog'
import type { ScreenSnapshot } from '../../../shared/screen-translation'

export function ScreenTranslationNotice() {
  const { t } = useI18n()
  const api = getBridge()?.screenTranslation
  const lastIssue = useRef<{ error?: string; shortcut?: string }>({})

  useEffect(() => {
    if (!api) return
    let active = true
    let changed = false
    const accept = (value: ScreenSnapshot, notify: boolean) => {
      const reason = value.error ?? (value.shortcutError ? 'shortcutConflict' : undefined)
      if (!reason || value.gameId || value.failure?.gameId) return
      const kind = value.error ? 'error' : 'shortcut'
      const id = value.error ? value.errorId ?? `${value.sessionId}:${value.epoch}:${reason}`
        : value.shortcutErrorId ?? 'shortcutConflict'
      if (id === lastIssue.current[kind]) return
      lastIssue.current[kind] = id
      if (!notify) return

      const failure = value.failure
      const code = (failure?.supportCode ?? supportErrorCodeForCause(reason)) as keyof typeof SUPPORT_ERROR_CATALOG
      if (reason === 'gatewayNotReady' || reason === 'ocrNotReady' || reason === 'translationModelMissing' || reason === 'translationModelNotReady') {
        const missing = reason === 'gatewayNotReady' ? undefined : reason === 'ocrNotReady' ? 'ocr' : 'mt'
        notifyGatewayIssue(t, { missing, binding: failure?.modelBinding,
          state: failure?.gatewayState ?? (missing ? 'running' : undefined),
          serviceFailure: failure?.serviceFailed ? code : undefined, supportCode: code })
        return
      }
      const message = reason === 'startFailed' ? t('errors.startFailed') : t(`screen.errors.${reason}`)
      const catalogMessage = SUPPORT_ERROR_CATALOG[code]?.messageKey
      const detail = catalogMessage && code !== supportErrorCodeForCause(reason) ? t(catalogMessage) : undefined
      notifyError(message, { description: detail && !/\{\w+\}/.test(detail) ? detail : undefined, supportCode: code })
    }
    const unsubscribe = api.onChanged(value => { changed = true; if (active) accept(value, true) })
    void api.snapshot().then(value => { if (active && !changed) accept(value, false) }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [api, t])

  return null
}
