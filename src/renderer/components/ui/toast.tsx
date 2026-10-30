"use client"

import { Toast as BaseToast } from '@base-ui/react/toast'
import { CheckCircle2, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { Button } from './button'
import { useI18n } from '@/i18n'

export type ToastVariant = 'default' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'error' | 'loading'
export interface ToastAction { children: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger' }
export interface ToastData { actionVariant?: ToastAction['variant'] }
export interface ToastOptions { description?: string; actionProps?: ToastAction; timeout?: number; variant?: ToastVariant }

const DEFAULT_TOAST_TIMEOUT = 6000

const manager = BaseToast.createToastManager<ToastData>()
const toastExpirationTimers = new Map<string, ReturnType<typeof setTimeout>>()

function resetToastExpiration(id: string, timeout: number): void {
  const existingTimer = toastExpirationTimers.get(id)
  if (existingTimer) clearTimeout(existingTimer)
  toastExpirationTimers.set(id, setTimeout(() => {
    toastExpirationTimers.delete(id)
    manager.close(id)
  }, timeout))
}

function scheduleToastExpiration(id: string, timeout: number): void {
  clearToastExpiration(id)
  if (timeout > 0) resetToastExpiration(id, timeout)
}

function clearToastExpiration(id: string): void {
  const timer = toastExpirationTimers.get(id)
  if (timer) clearTimeout(timer)
  toastExpirationTimers.delete(id)
}

function toastType(variant: ToastVariant | undefined): 'success' | 'info' | 'warning' | 'error' | 'loading' | undefined {
  switch (variant) {
    case 'accent':
    case 'info': return 'info'
    case 'success': return 'success'
    case 'warning': return 'warning'
    case 'danger':
    case 'error': return 'error'
    case 'loading': return 'loading'
    default: return undefined
  }
}

function nativeActionProps(action: ToastAction | undefined): { children: string; onClick: () => void } | undefined {
  if (!action) return undefined
  return { children: action.children, onClick: action.onPress }
}

export function createToast(message: string, options: ToastOptions = {}): string {
  const timeout = options.timeout ?? DEFAULT_TOAST_TIMEOUT
  let id = ''
  id = manager.add({
    title: message,
    description: options.description,
    timeout,
    type: toastType(options.variant),
    actionProps: nativeActionProps(options.actionProps),
    data: { actionVariant: options.actionProps?.variant },
    priority: options.variant === 'danger' || options.variant === 'error' ? 'high' : 'low',
    onClose: () => clearToastExpiration(id),
  })
  scheduleToastExpiration(id, timeout)
  return id
}

export function updateToast(id: string, message: string, options: ToastOptions & { variant: ToastVariant }): string {
  const timeout = options.timeout ?? DEFAULT_TOAST_TIMEOUT
  manager.update(id, {
    title: message,
    description: options.description,
    timeout,
    type: toastType(options.variant),
    actionProps: nativeActionProps(options.actionProps),
    data: { actionVariant: options.actionProps?.variant },
    priority: options.variant === 'danger' || options.variant === 'error' ? 'high' : 'low',
    onClose: () => clearToastExpiration(id),
  })
  scheduleToastExpiration(id, timeout)
  return id
}

export function closeToast(id: string): void { clearToastExpiration(id); manager.close(id) }

function ToastViewport() {
  const { t } = useI18n()
  const { toasts } = BaseToast.useToastManager<ToastData>()
  return <BaseToast.Portal>
      <BaseToast.Viewport className="nola-toast-viewport z-toast" data-slot="toast-viewport">
        {toasts.map(toast => {
          return <BaseToast.Root key={toast.id} toast={toast} className="nola-toast" data-slot="toast">
            <BaseToast.Content className="nola-toast-content">
              {toast.type === 'success' ? <CheckCircle2 className="nola-toast-icon" aria-hidden="true" /> : null}
              {toast.type === 'info' ? <Info className="nola-toast-icon" aria-hidden="true" /> : null}
              {toast.type === 'warning' ? <TriangleAlert className="nola-toast-icon" aria-hidden="true" /> : null}
              {toast.type === 'error' ? <CircleX className="nola-toast-icon nola-toast-icon-error" aria-hidden="true" /> : null}
              {toast.type === 'loading' ? <LoaderCircle className="nola-toast-icon nola-toast-icon-loading" aria-hidden="true" /> : null}
              <div className="nola-toast-copy"><BaseToast.Title className="nola-toast-title" />{toast.description ? <BaseToast.Description className="nola-toast-description" /> : null}</div>
              <BaseToast.Action className="nola-toast-action" render={<Button size="sm" variant={toast.data?.actionVariant === 'primary' ? 'default' : toast.data?.actionVariant ?? 'outline'} />} />
            <BaseToast.Close render={<Button size="icon" variant="secondary" className="nola-toast-close" aria-label={t('common.close')}><X aria-hidden="true" /></Button>} />
            </BaseToast.Content>
          </BaseToast.Root>
        })}
      </BaseToast.Viewport>
    </BaseToast.Portal>
}

export function ToastProvider() {
  return <BaseToast.Provider toastManager={manager}><ToastViewport /></BaseToast.Provider>
}
