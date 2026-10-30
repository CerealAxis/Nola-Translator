"use client"

import { Toast as BaseToast } from '@base-ui/react/toast'
import { CheckCircle2, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { Button } from './button'
import { useI18n } from '@/i18n'

export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading'
export interface ToastAction { children: string; onClick: () => void }
export type ToastPayload =
  | { type: ToastType; description: string; duration?: number }
  | { type: ToastType; title: string; description: string; actionProps: ToastAction; duration?: number }

export interface ToastData {}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  info: 6000,
  warning: 8000,
  error: 10000,
  loading: 8000,
}

const manager = BaseToast.createToastManager<ToastData>()

export function toastTimeoutFor(payload: ToastPayload): number {
  const duration = payload.duration
  return duration !== undefined && Number.isFinite(duration) && duration > 0
    ? Math.min(duration, 12000)
    : DEFAULT_DURATION[payload.type]
}

export function showToast(payload: ToastPayload): string {
  const { duration: _duration, ...content } = payload
  return manager.add({ ...content, timeout: toastTimeoutFor(payload), data: {}, priority: payload.type === 'error' ? 'high' : 'low' })
}

export function updateToast(id: string, payload: ToastPayload): string {
  const { duration: _duration, ...content } = payload
  manager.update(id, { ...content, timeout: toastTimeoutFor(payload), data: {}, priority: payload.type === 'error' ? 'high' : 'low' })
  return id
}

export function closeToast(id: string): void { manager.close(id) }

function ToastViewport() {
  const { t } = useI18n()
  const { toasts } = BaseToast.useToastManager<ToastData>()
  return <BaseToast.Portal>
    <BaseToast.Viewport className="nola-toast-viewport z-toast" data-slot="toast-viewport">
      {toasts.map(toast => <BaseToast.Root key={toast.id} toast={toast} className="nola-toast" data-slot="toast" data-type={toast.type ?? 'info'}>
        <BaseToast.Content className="nola-toast-content">
          {toast.type === 'success' ? <CheckCircle2 className="nola-toast-icon" aria-hidden="true" /> : null}
          {toast.type === 'info' ? <Info className="nola-toast-icon" aria-hidden="true" /> : null}
          {toast.type === 'warning' ? <TriangleAlert className="nola-toast-icon" aria-hidden="true" /> : null}
          {toast.type === 'error' ? <CircleX className="nola-toast-icon" aria-hidden="true" /> : null}
          {toast.type === 'loading' ? <LoaderCircle className="nola-toast-icon nola-toast-icon-loading" aria-hidden="true" /> : null}
          <div className="nola-toast-copy">
            {toast.title ? <BaseToast.Title className="nola-toast-title" /> : null}
            {toast.description ? <BaseToast.Description className="nola-toast-description" /> : null}
          </div>
          {toast.actionProps ? <BaseToast.Action className="nola-toast-action" render={<Button size="sm" variant="outline" />} /> : null}
          <BaseToast.Close render={<Button size="icon" variant="link" className="nola-toast-close text-nola-ui-muted-foreground!" aria-label={t('common.close')}><X aria-hidden="true" /></Button>} />
        </BaseToast.Content>
      </BaseToast.Root>)}
    </BaseToast.Viewport>
  </BaseToast.Portal>
}

export function ToastProvider() {
  return <BaseToast.Provider toastManager={manager}><ToastViewport /></BaseToast.Provider>
}
