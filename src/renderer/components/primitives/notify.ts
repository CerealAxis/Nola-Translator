import { closeToast, showToast, updateToast } from '../ui/toast'
import type { ToastPayload, ToastType } from '../ui/toast'
import { getBridge } from '@/store'
import type { MainErrorNotification } from '@/bridge'

export const NOTIFY_DURATION = {
  error: 10000,
  retryable: 12000,
  loading: 8000,
  success: 4000,
  info: 6000,
  warning: 8000,
} as const

export type NotifyVariant = ToastType | 'default' | 'accent' | 'danger'

export interface NotifyAction { label: string; onPress: () => void; actionId?: MainErrorNotification['actionId'] }

export type NotifyOptions = {
  cause?: unknown
  duration?: number
} & (
  | { description?: string; action?: never }
  | { description?: string; action: NotifyAction }
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
    ? options.description
      ? { type, title: message, description: options.description, actionProps: { children: options.action.label, onClick: options.action.onPress }, duration }
      : { type, title: message, actionProps: { children: options.action.label, onClick: options.action.onPress }, duration }
    : options.description
      ? { type, title: message, description: options.description, duration }
      : { type, description: message, duration }
}

function overlayDocument(): boolean {
  const query = new URLSearchParams(window.location.search)
  return query.get('overlay') === '1' || query.get('overlayMenu') === '1'
}

function sendOverlayToast(notification: MainErrorNotification): string {
  const id = crypto.randomUUID()
  getBridge()?.app.notifyMainError?.(notification)
  return id
}

/** A failure notice that dismisses automatically. */
export function notifyError(message: string, options: NotifyOptions = {}): string {
  const duration = options.duration ?? NOTIFY_DURATION.error
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'error', duration,
    ...(options.action ? { actionLabel: options.action.label, actionId: options.action.actionId } : {}) })
  return showToast(payload(message, 'error', { ...options, duration }))
}

/** An unavailable local model can be made usable by loading it in Model Gateway. */
export function notifyGatewayModelUnavailable(message: string, description: string, actionLabel: string): string {
  if (overlayDocument()) return sendOverlayToast({ message, description, type: 'error', actionLabel, actionPage: '#/model-gateway' })
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
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'error', duration: options.duration ?? NOTIFY_DURATION.retryable })
  return showToast(payload(message, 'error', { ...options, duration: options.duration ?? NOTIFY_DURATION.retryable }))
}

export function notifySuccess(message: string, options: NotifyOptions = {}): string {
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'success', duration: options.duration ?? NOTIFY_DURATION.success })
  return showToast(payload(message, 'success', { ...options, duration: options.duration ?? NOTIFY_DURATION.success }))
}

export function notifyInfo(message: string, options: NotifyOptions = {}): string {
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'info', duration: options.duration ?? NOTIFY_DURATION.info })
  return showToast(payload(message, 'info', { ...options, duration: options.duration ?? NOTIFY_DURATION.info }))
}

export function notifyLoading(message: string, options: NotifyOptions = {}): string {
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'loading', duration: options.duration ?? NOTIFY_DURATION.loading })
  return showToast(payload(message, 'loading', { ...options, duration: options.duration ?? NOTIFY_DURATION.loading }))
}

export function notifyWarning(message: string, options: NotifyOptions = {}): string {
  if (overlayDocument()) return sendOverlayToast({ message, description: options.description, type: 'warning', duration: options.duration ?? NOTIFY_DURATION.warning })
  return showToast(payload(message, 'warning', { ...options, duration: options.duration ?? NOTIFY_DURATION.warning }))
}

/** Toasts raised while configuring the floating captions use the same independent surface. */
export function notifyOverlayError(message: string, options: NotifyOptions = {}): string {
  return sendOverlayToast({ message, description: options.description, type: 'error', duration: options.duration ?? NOTIFY_DURATION.error,
    ...(options.action ? { actionLabel: options.action.label, actionId: options.action.actionId } : {}) })
}

export function notifyOverlayInfo(message: string, options: NotifyOptions = {}): string {
  return sendOverlayToast({ message, description: options.description, type: 'info', duration: options.duration ?? NOTIFY_DURATION.info })
}

export function notifyOverlayGatewayModelUnavailable(message: string, description: string, actionLabel: string): string {
  return sendOverlayToast({ message, description, type: 'error', actionLabel, actionPage: '#/model-gateway' })
}

export function dismissNotice(id: string): void { closeToast(id) }

export function notifyUpdate(id: string, message: string, options: NotifyOptions & { variant: NotifyVariant }): string {
  return updateToast(id, payload(message, options.variant, options))
}
