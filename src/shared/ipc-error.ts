import { supportErrorCodeForCause } from './error-catalog'

export type AppErrorShape = {
  code: string
  supportCode?: string
  retryable?: boolean
  correlationId?: string
}

type ErrorLike = {
  code?: unknown
  engineCode?: unknown
  errno?: unknown
  message?: unknown
  correlationId?: unknown
}

const KNOWN_ERROR_CODES: Readonly<Record<string, string>> = {
  SESSIONALREADYRUNNING: 'SESSION_ALREADY_RUNNING',
  ETIMEDOUT: 'REQUEST_TIMEOUT',
  ESOCKETTIMEDOUT: 'REQUEST_TIMEOUT',
  ECONNRESET: 'NETWORK_UNAVAILABLE',
  ECONNREFUSED: 'ENGINE_UNAVAILABLE',
  ENOTFOUND: 'NETWORK_UNAVAILABLE',
  ENOENT: 'ENGINE_UNAVAILABLE',
  EACCES: 'ENGINE_UNAVAILABLE',
  EPERM: 'ENGINE_UNAVAILABLE',
}

/** Recognises a session-mutex refusal before or after Electron normalises its IPC error. */
export function isSessionAlreadyRunningError(error: unknown): boolean {
  const source = error && typeof error === 'object' ? error as ErrorLike : undefined
  return [source?.code, source?.engineCode, source?.message, error instanceof Error ? error.message : error]
    .some(value => typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('sessionalreadyrunning'))
}

/** Converts arbitrary thrown values into the stable fields allowed across the IPC boundary. */
export function normalizeThrownError(
  error: unknown,
  context: { correlationId?: string; operation?: string } = {}
): AppErrorShape {
  const source = error && typeof error === 'object' ? error as ErrorLike : undefined
  const rawCode = typeof source?.engineCode === 'string'
    ? source.engineCode
    : typeof source?.code === 'string' ? source.code : undefined
  const errno = typeof source?.errno === 'string' ? source.errno : undefined
  const message = typeof source?.message === 'string' ? source.message : ''
  const normalizedMessage = message.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const code = rawCode
    ?? (errno ? KNOWN_ERROR_CODES[errno] ?? errno : undefined)
    ?? (/^RUNTIME_TORCH:/i.test(message) ? 'RUNTIME_TORCH' : undefined)
    ?? (/^RUNTIME_LLAMA:/i.test(message) ? 'RUNTIME_LLAMA' : undefined)
    ?? (/(TIMEOUT|TIMED_OUT|超时)/i.test(message) ? 'REQUEST_TIMEOUT' : undefined)
    ?? (/(PROTOCOL|INVALID.*(DATA|RESPONSE)|通信数据无效)/i.test(message) ? 'ENGINE_PROTOCOL_ERROR' : undefined)
    ?? (/(ENGINE|PYTHON).*(NOT|尚未|不可用|退出|停止)|引擎.*(不可用|退出|停止)/i.test(message) ? 'ENGINE_UNAVAILABLE' : undefined)
    ?? (normalizedMessage && KNOWN_ERROR_CODES[normalizedMessage])
    ?? 'UNKNOWN_ERROR'
  const supportCause = code === 'RUNTIME_TORCH' || code === 'RUNTIME_LLAMA' ? code : rawCode ?? errno ?? message
  const supportCode = supportErrorCodeForCause(supportCause, {
    commandType: context.operation,
  })
  return {
    code,
    supportCode,
    retryable: code === 'REQUEST_TIMEOUT' || code === 'NETWORK_UNAVAILABLE' || code === 'ENGINE_UNAVAILABLE',
    ...(context.correlationId ? { correlationId: context.correlationId } : {}),
  }
}

/**
 * Electron frames anything an IPC handler throws as
 * `Error invoking remote method '<channel>': [ClassName: ]<message>`; that framing is a transport
 * detail and must not reach user-facing notices.
 */
export function stripIpcErrorMessage(message: string): string {
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    ''
  )
}
