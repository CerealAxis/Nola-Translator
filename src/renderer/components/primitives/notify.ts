import { closeToast, showToast, updateToast } from '../ui/toast'
import type { ToastPayload, ToastType } from '../ui/toast'
import { getBridge } from '@/store'
import type { MainErrorNotification } from '@/bridge'
import type { I18nContextValue, TranslationKey } from '@/i18n'
import { resolveUiLanguage, translate } from '@/i18n'
import { gatewayStartupHint, bindingIsLocal, type GatewayCapability, type ModelGatewaySnapshot } from '../../../shared/model-gateway'
import { appendSupportCode, SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from '../../../shared/error-catalog'
import { featureConflictOwner } from '../../../shared/feature-activity'
import { normalizeThrownError, restoreIpcError, stripIpcErrorMessage } from '../../../shared/ipc-error'

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
  supportCode?: string
} & (
  | { description?: string; action?: never }
  | { description?: string; action: NotifyAction }
)

export function describeError(cause: unknown): string | undefined {
  if (cause === null || cause === undefined) return undefined
  if (typeof cause === 'string') return cause
  return cause instanceof Error ? cause.message : String(cause)
}

function failureOptions(message: string, options: NotifyOptions): NotifyOptions {
  if (options.cause === undefined) return options
  console.error('renderer.notification.failed', options.cause)
  const cause = restoreIpcError(options.cause)
  const source = cause && typeof cause === 'object' ? cause : {}
  const normalized = normalizeThrownError({ ...source, message: stripIpcErrorMessage(describeError(cause) ?? '') })
  const explicitCode = 'supportCode' in source && typeof source.supportCode === 'string' ? source.supportCode : undefined
  const code = options.supportCode ?? (explicitCode && Object.hasOwn(SUPPORT_ERROR_CATALOG, explicitCode) ? explicitCode : normalized.supportCode)
  const result = { ...options, supportCode: code }
  if (options.description !== undefined || !code || code === 'ERR-999' || !Object.hasOwn(SUPPORT_ERROR_CATALOG, code)) return result
  const language = resolveUiLanguage('auto', document.documentElement.lang || navigator.language)
  const description = translate(SUPPORT_ERROR_CATALOG[code as keyof typeof SUPPORT_ERROR_CATALOG].messageKey, language)
  return description === message || /\{\w+\}/.test(description) ? result : { ...result, description }
}

export function sessionConflictMessage(t: I18nContextValue['t'], cause: unknown): string {
  const owner = featureConflictOwner(cause)
  if (!owner) return t('gateway.realtimeSessionBusy')
  const name = t(owner === 'meeting' ? 'meeting.title' : owner === 'screen-translation' ? 'screen.title' : owner === 'game-translation' ? 'suite.gameTitle' : owner === 'comic-translation' ? 'suite.comicTitle' : `gateway.${owner}`)
  return t('errors.serviceConflict', { running: name })
}

function toastType(variant: NotifyVariant): ToastType {
  if (variant === 'default' || variant === 'accent') return 'info'
  if (variant === 'danger') return 'error'
  return variant
}

function payload(message: string, variant: NotifyVariant, options: NotifyOptions): ToastPayload {
  const details = options.description?.trim()
  const hasTitle = !!details && details !== message.trim()
  const body = hasTitle ? details : message
  return {
    type: toastType(variant), duration: options.duration,
    ...(hasTitle ? { title: message } : {}),
    description: appendSupportCode(body, options.supportCode),
    ...(options.action ? { actionProps: { children: options.action.label, onClick: options.action.onPress } } : {}),
  }
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
  options = failureOptions(message, options)
  const duration = options.duration ?? NOTIFY_DURATION.error
  if (overlayDocument()) return overlayFailure(message, options, duration)
  return showToast(payload(message, 'error', { ...options, duration }))
}

/** Show an error with a shortcut to Model Gateway. */
export function notifyGatewayModelUnavailable(message: string, description: string, actionLabel: string, supportCode?: string): string {
  if (overlayDocument()) return overlayFailure(message, { description, supportCode }, undefined, { actionLabel, actionPage: '#/model-gateway' })
  return notifyError(message, {
    description,
    supportCode,
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

/** Returns whether startup is blocked. Explicit cloud bindings can run without the local gateway. */
export async function notifyGatewayStartIssue(t: I18nContextValue['t'], missing?: GatewayCapability, binding?: string): Promise<boolean> {
  const gateway = !binding || bindingIsLocal(binding) ? await getBridge()?.gateway?.snapshot().catch(() => undefined) : undefined
  const service = missing ? gateway?.services?.[missing] : undefined
  const serviceFailure = service?.state === 'failed' && (!binding || service.model === binding)
    ? supportErrorCodeForCause(service.errorCode) : undefined
  return notifyGatewayIssue(t, { state: gateway?.state, missing, binding, serviceFailure, startupFailureCode: gateway?.errorCode })
}

export function notifyGatewayIssue(t: I18nContextValue['t'], issue: {
  state?: ModelGatewaySnapshot['state']; missing?: GatewayCapability; binding?: string;
  serviceFailure?: string; supportCode?: string; startupFailureCode?: string;
}): boolean {
  const { state, missing, binding, serviceFailure, supportCode, startupFailureCode } = issue
  if ((!binding || bindingIsLocal(binding)) && state !== 'running') {
    const title: TranslationKey = state === 'stopped' ? 'gateway.notStarted'
      : state === 'failed' ? 'gateway.startupFailed'
        : state ? `gateway.${state}` : 'gateway.startupStatusUnavailable'
    const hint = state === 'stopped' ? 'gateway.notStartedHint'
      : state === 'starting' || state === 'stopping' ? 'gateway.startupWaitHint' : gatewayStartupHint(startupFailureCode)
    notifyGatewayModelUnavailable(t(title), t(hint), t('gateway.title'), supportCode ?? (state === 'stopped' ? 'GTW-001' : undefined))
    return true
  }
  if (!missing) return false
  const name = t(`gateway.${missing}`)
  if (serviceFailure) {
    const code = serviceFailure as keyof typeof SUPPORT_ERROR_CATALOG
    const hint = code === 'ERR-999' || !Object.hasOwn(SUPPORT_ERROR_CATALOG, code)
      ? 'gateway.serviceFailed' : SUPPORT_ERROR_CATALOG[code].messageKey
    const description = t(hint)
    notifyGatewayModelUnavailable(t('gateway.selectedModelUnavailable', { name }), /\{\w+\}/.test(description) ? t('gateway.serviceFailed') : description, t('gateway.title'), supportCode ?? serviceFailure)
    return true
  }
  if (binding && !bindingIsLocal(binding)) {
    notifyError(t('gateway.selectedModelUnavailable', { name }), { description: t('gateway.selectedCloudHint'), supportCode,
      action: { label: t('nav.models'), onPress: () => {
        const bridge = getBridge()
        if (bridge?.app.openMainPage) void bridge.app.openMainPage('#/models').catch(error => console.error('[models.navigation]', error))
        else window.location.hash = '#/models'
      } },
    })
  } else notifyGatewayModelUnavailable(t('gateway.modelNone', { name }), t(missing === 'ocr' ? 'gateway.ocrLoadHint' : 'gateway.modelNoneHint'), t('gateway.title'), supportCode)
  return true
}

export function notifyRetryableFailure(message: string, options: NotifyOptions = {}): string {
  options = failureOptions(message, options)
  if (overlayDocument()) return overlayFailure(message, options, options.duration ?? NOTIFY_DURATION.retryable)
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
  options = failureOptions(message, options)
  return overlayFailure(message, options, options.duration ?? NOTIFY_DURATION.error)
}

function overlayFailure(message: string, options: NotifyOptions, duration?: number, action?: Pick<MainErrorNotification, 'actionLabel' | 'actionPage'>): string {
  const toast = payload(message, 'error', options)
  return sendOverlayToast({ message: toast.title ?? toast.description ?? message,
    description: toast.title ? toast.description : undefined, type: 'error', duration,
    ...(options.action ? { actionLabel: options.action.label, actionId: options.action.actionId } : {}), ...action })
}

export function notifyOverlayInfo(message: string, options: NotifyOptions = {}): string {
  return sendOverlayToast({ message, description: options.description, type: 'info', duration: options.duration ?? NOTIFY_DURATION.info })
}

export function notifyOverlayGatewayModelUnavailable(message: string, description: string, actionLabel: string): string {
  return sendOverlayToast({ message, description, type: 'error', actionLabel, actionPage: '#/model-gateway' })
}

export function dismissNotice(id: string): void { closeToast(id) }

export function notifyUpdate(id: string, message: string, options: NotifyOptions & { variant: NotifyVariant }): string {
  return updateToast(id, payload(message, options.variant, toastType(options.variant) === 'error' ? failureOptions(message, options) : options))
}
