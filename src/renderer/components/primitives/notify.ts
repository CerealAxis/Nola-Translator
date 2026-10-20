import { toast } from '@heroui/react'

/**
 * How long each kind of notification stays on screen.
 *
 * A failure the user has to act on stays until they do: a toast that disappears while the
 * message is still being read is a failure the user never learns about. A failure the user can
 * repeat from the page needs no such attention, and everything else is a courtesy. Both leave
 * on their own.
 */
export const NOTIFY_DURATION = {
  error: 0,
  retryable: 12000,
  success: 4000,
  info: 6000,
  warning: 8000,
} as const

export type NotifyActionVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger'

/** The look of a notice, matching the variants the toast queue understands. */
export type NotifyVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger'

export interface NotifyAction {
  label: string
  onPress: () => void
  variant?: NotifyActionVariant
}

export interface NotifyOptions {
  /** Detail shown under the message. */
  description?: string
  /** The thrown value, when the failure reason is only available as one. */
  cause?: unknown
  /** The way out of the failure: retry, repair, dismiss. */
  action?: NotifyAction
  duration?: number
}

/** The text of a thrown value, for the detail line of a failure notice. */
export function describeError(cause: unknown): string | undefined {
  if (cause === null || cause === undefined) return undefined
  if (typeof cause === 'string') return cause
  if (cause instanceof Error) return cause.message
  return String(cause)
}

function actionProps(action: NotifyAction | undefined): { children: string; onPress: () => void; variant: NotifyActionVariant } | undefined {
  if (!action) return undefined
  return { children: action.label, onPress: action.onPress, variant: action.variant ?? 'tertiary' }
}

function detail(options: NotifyOptions): string | undefined {
  return options.description ?? describeError(options.cause)
}

/** A failure. Stays on screen and carries the way out. */
export function notifyError(message: string, options: NotifyOptions = {}): string {
  return toast.danger(message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    timeout: options.duration ?? NOTIFY_DURATION.error,
  })
}

/**
 * A failure the user can repeat from the page. It reads as a failure, but unlike notifyError
 * it does not hold the screen: the page itself is the way out, so the notice can leave.
 */
export function notifyRetryableFailure(message: string, options: NotifyOptions = {}): string {
  return toast.danger(message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    timeout: options.duration ?? NOTIFY_DURATION.retryable,
  })
}

/** An operation that finished. */
export function notifySuccess(message: string, options: NotifyOptions = {}): string {
  return toast.success(message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    timeout: options.duration ?? NOTIFY_DURATION.success,
  })
}

/** A state change the user should know about but does not have to act on. */
export function notifyInfo(message: string, options: NotifyOptions = {}): string {
  return toast.info(message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    timeout: options.duration ?? NOTIFY_DURATION.info,
  })
}

/** Something worth a second look before the user continues. */
export function notifyWarning(message: string, options: NotifyOptions = {}): string {
  return toast.warning(message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    timeout: options.duration ?? NOTIFY_DURATION.warning,
  })
}

/** Takes a notice off the screen before its time is up. */
export function dismissNotice(id: string): void {
  toast.close(id)
}

/**
 * Rewrites a notification that is already on screen, keeping its place in the stack. A long
 * running operation shows one notice and finishes it here instead of adding a second one.
 *
 * The queue replaces the whole content of a toast, so an update carries the description and
 * the action with it: leaving them out drops them, and leaving the variant out turns a
 * failure into a plain notice. The variant is therefore required.
 */
export function notifyUpdate(id: string, message: string, options: NotifyOptions & { variant: NotifyVariant }): string {
  return toast.update(id, message, {
    description: detail(options),
    actionProps: actionProps(options.action),
    // A missing duration leaves the running countdown alone, a duration of 0 keeps it open.
    timeout: options.duration,
    variant: options.variant,
  })
}
