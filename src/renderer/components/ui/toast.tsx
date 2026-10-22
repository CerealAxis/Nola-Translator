import { Toast as BaseToast } from '@base-ui/react/toast'
import { X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

export type ToastVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger'
export interface ToastAction { children: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger' }
export interface ToastData { variant: ToastVariant; action?: ToastAction }
export interface ToastOptions { description?: string; actionProps?: ToastAction; timeout?: number; variant?: ToastVariant }

const manager = BaseToast.createToastManager<ToastData>()

export function createToast(message: string, options: ToastOptions = {}): string {
  return manager.add({
    title: message,
    description: options.description,
    timeout: options.timeout,
    priority: options.variant === 'danger' ? 'high' : 'low',
    data: { variant: options.variant ?? 'default', action: options.actionProps },
  })
}

export function updateToast(id: string, message: string, options: ToastOptions & { variant: ToastVariant }): string {
  manager.update(id, {
    title: message,
    description: options.description,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    priority: options.variant === 'danger' ? 'high' : 'low',
    data: { variant: options.variant, action: options.actionProps },
  })
  return id
}

export function closeToast(id: string): void { manager.close(id) }

function ToastViewport() {
  const { t } = useI18n()
  const { toasts } = BaseToast.useToastManager<ToastData>()
  return <BaseToast.Portal>
      <BaseToast.Viewport className="nola-toast-viewport z-toast" data-slot="toast-viewport">
        {toasts.map(toast => {
          const variant = toast.data?.variant ?? 'default'
          const action = toast.data?.action
          return <BaseToast.Root key={toast.id} toast={toast} className={cn('nola-toast', `nola-toast-${variant}`)} data-slot="toast">
            <BaseToast.Content className="nola-toast-content">
              <div className="nola-toast-copy"><BaseToast.Title className="nola-toast-title" />{toast.description ? <BaseToast.Description className="nola-toast-description" /> : null}</div>
              {action ? <BaseToast.Action className="nola-toast-action" render={<Button size="sm" variant={action.variant === 'danger' ? 'danger' : action.variant === 'primary' ? 'default' : 'secondary'} onClick={action.onPress} />}>{action.children}</BaseToast.Action> : null}
              <BaseToast.Close render={<Button size="icon" variant="tertiary" className="nola-toast-close" aria-label={t('common.close')}><X aria-hidden="true" /></Button>} />
            </BaseToast.Content>
          </BaseToast.Root>
        })}
      </BaseToast.Viewport>
    </BaseToast.Portal>
}

export function ToastProvider() {
  return <BaseToast.Provider toastManager={manager}><ToastViewport /></BaseToast.Provider>
}
