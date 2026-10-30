import { closeToast, showToast, updateToast } from '../ui/toast'
import type { ToastPayload, ToastType } from '../ui/toast'
import { getBridge } from '@/store'

export const NOTIFY_DURATION = {
  error: 10000,
  retryable: 12000,
  loading: 8000,
  success: 4000,
  info: 6000,
  warning: 8000,
} as const

export type NotifyVariant = ToastType | 'default' | 'accent' | 'danger'

export interface NotifyAction { label: string; onPress: () => void }

export type NotifyOptions = {
  cause?: unknown
  duration?: number
} & (
  | { description?: string; action?: never }
  | { description: string; action: NotifyAction }
)

export function describeError(cause: unknown): string | undefined {
  if (cause === null || cause === undefined) return undefined
  if (typeof cause === 'string') return cause
  return cause instanceof Error ? cause.message : String(cause)
}

function toastType(variant: NotifyVariant): ToastType {
  if (variant === 'default' || variant === 'accent') return 'info'
  if (variant === 'danger') return 'error'
  return variant
}

function payload(message: string, variant: NotifyVariant, options: NotifyOptions): ToastPayload {
  const type = toastType(variant)
  const duration = options.duration
  // A description explicitly opts into the CardHeader title + body layout. Without it,
  // the message is intentionally a body-only notification, matching the shadcn Toast API.
  return options.action
    ? { type, title: message, description: options.description, actionProps: { children: options.action.label, onClick: options.action.onPress }, duration }
    : options.description
      ? { type, title: message, description: options.description, duration }
      : { type, description: message, duration }
}

/** A failure notice that dismisses automatically. */
export function notifyError(message: string, options: NotifyOptions = {}): string {
  const duration = options.duration ?? NOTIFY_DURATION.error
  return showToast(payload(message, 'error', { ...options, duration }))
}

/** An unavailable local model can be made usable by loading it in Model Gateway. */
export function notifyGatewayModelUnavailable(message: string, description: string, actionLabel: string): string {
  return notifyError(message, {
    description,
    action: {
      label: actionLabel,
      onPress: () => {
        const bridge = getBridge()
        if (bridge?.app.openMainPage) void bridge.app.openMainPage('#/model-gateway').catch(error => console.error('[gateway.navigation]', error))
        else window.location.hash = '#/model-gateway'
      },
    },
  })
}

export function notifyRetryableFailure(message: string, options: NotifyOptions = {}): string {
  return showToast(payload(message, 'error', { ...options, duration: options.duration ?? NOTIFY_DURATION.retryable }))
}

export function notifySuccess(message: string, options: NotifyOptions = {}): string {
  return showToast(payload(message, 'success', { ...options, duration: options.duration ?? NOTIFY_DURATION.success }))
}

export function notifyInfo(message: string, options: NotifyOptions = {}): string {
  return showToast(payload(message, 'info', { ...options, duration: options.duration ?? NOTIFY_DURATION.info }))
}

export function notifyLoading(message: string, options: NotifyOptions = {}): string {
  return showToast(payload(message, 'loading', { ...options, duration: options.duration ?? NOTIFY_DURATION.loading }))
}

export function notifyWarning(message: string, options: NotifyOptions = {}): string {
  return showToast(payload(message, 'warning', { ...options, duration: options.duration ?? NOTIFY_DURATION.warning }))
}

export function dismissNotice(id: string): void { closeToast(id) }

export function notifyUpdate(id: string, message: string, options: NotifyOptions & { variant: NotifyVariant }): string {
  return updateToast(id, payload(message, options.variant, options))
}
