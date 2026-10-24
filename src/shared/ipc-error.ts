import { SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from './error-catalog'
import { featureConflictOwner } from './feature-activity'
import type { SupportErrorOperation } from './error-catalog'

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
  commandType?: unknown
  action?: unknown
}

/**
 * Transport error names mapped onto the canonical cause tokens the support catalog indexes. The
 * keys carry no separators, because that is the spelling Node writes the name in.
 */
const KNOWN_ERROR_CODES: Readonly<Record<string, string>> = {
  SESSIONALREADYRUNNING: 'SESSION_ALREADY_RUNNING',
  ETIMEDOUT: 'REQUEST_TIMEOUT',
  ESOCKETTIMEDOUT: 'REQUEST_TIMEOUT',
  ECONNRESET: 'NETWORK_UNAVAILABLE',
  ECONNREFUSED: 'ENGINE_UNAVAILABLE',
  ENOTFOUND: 'NETWORK_UNAVAILABLE',
  ENOENT: 'FILE_NOT_FOUND',
  EACCES: 'FILE_NOT_ACCESSIBLE',
  EPERM: 'FILE_NOT_ACCESSIBLE',
}

/**
 * A runtime component that is not installed names itself in the message, so the component is
 * known without reading the rest of the sentence.
 */
const RUNTIME_PREFIX_PATTERN = /^RUNTIME_(TORCH|LLAMA|CRISP):/i

/**
 * A message that is nothing but an identifier names the failure exactly, so it is looked up
 * before the text recognisers below get a chance to read a different meaning into it. The catalog
 * decides whether the identifier is one it claims; an identifier nobody claims falls through.
 */
const IDENTIFIER_PATTERN = /^[a-z][A-Za-z0-9_]*$/

/**
 * The remaining recognisers key on identifiers that survive a copy of the failure text. The
 * Chinese alternatives cover the main-process messages that carry no identifier at all, and they
 * resolve to the same canonical token as the ASCII alternatives, so rewording a sentence cannot
 * move a failure into another category.
 */
const TIMEOUT_PATTERN = /(TIMEOUT|TIMED_OUT)/i
const PROTOCOL_PATTERN = /(PROTOCOL|INVALID.*(DATA|RESPONSE))/i
const ENGINE_UNAVAILABLE_PATTERN = /(ENGINE|PYTHON).*(NOT_AVAILABLE|NOT AVAILABLE|NOT RUNNING|NOTREADY|UNAVAILABLE|UNREACHABLE|EXITED|STOPPED|LOST|EXIT|尚未|不可用|退出|停止|终止)|引擎.*(尚未|不可用|退出|停止|终止)/i

/** Recognises a session-mutex refusal before or after Electron normalises its IPC error. */
export function isSessionAlreadyRunningError(error: unknown): boolean {
  if (featureConflictOwner(error)) return true
  const source = error && typeof error === 'object' ? error as ErrorLike : undefined
  return [source?.code, source?.engineCode, source?.message, error instanceof Error ? error.message : error]
    .some(value => typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('sessionalreadyrunning'))
}

/**
 * The operation a failure happened in. An engine failure carries the command it was answering,
 * and that command is finer than the channel it arrived on: the channel cannot tell an install
 * from a removal, and the catalog names those two differently.
 */
function operationOf(source: ErrorLike | undefined, context: { operation?: string }): SupportErrorOperation {
  const commandType = typeof source?.commandType === 'string' ? source.commandType : undefined
  const action = typeof source?.action === 'string' ? source.action : undefined
  if (!commandType) return { commandType: context.operation }
  return action ? { commandType, action } : { commandType }
}

/** Converts arbitrary thrown values into the stable fields allowed across the IPC boundary. */
export function normalizeThrownError(
  error: unknown,
  // The operation is what the catalog knows the failure by: the engine command when the error
  // carries one, the channel otherwise. It refines a generic failure and never overrules a cause
  // that names its own failure.
  context: { correlationId?: string; operation?: string } = {}
): AppErrorShape {
  const source = error && typeof error === 'object' ? error as ErrorLike : undefined
  const engineCode = typeof source?.engineCode === 'string' ? source.engineCode : undefined
  const transportCode = typeof source?.code === 'string' ? source.code : undefined
  const errno = typeof source?.errno === 'string' ? source.errno : undefined
  const message = typeof source?.message === 'string' ? source.message : ''
  const normalizedMessage = message.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const runtime = RUNTIME_PREFIX_PATTERN.exec(message)
  const identifierSupportCode = IDENTIFIER_PATTERN.test(message) ? supportErrorCodeForCause(message) : undefined
  const knownIdentifier = identifierSupportCode !== undefined && identifierSupportCode !== 'ERR-999' ? message : undefined
  /*
   * A system failure names itself, and Node writes that name in `code` while `errno` holds the
   * number, so the name is the only part the table can be asked about. The engine names itself
   * as well, and its name says more than the transport does, so it comes first.
   */
  const transportName = [transportCode, errno].find(name => name !== undefined && Object.hasOwn(KNOWN_ERROR_CODES, name))
  const code = engineCode
    ?? (transportName ? KNOWN_ERROR_CODES[transportName] : transportCode ?? errno)
    ?? (runtime ? `RUNTIME_${runtime[1].toUpperCase()}` : undefined)
    ?? knownIdentifier
    ?? (TIMEOUT_PATTERN.test(message) ? 'REQUEST_TIMEOUT' : undefined)
    ?? (PROTOCOL_PATTERN.test(message) ? 'ENGINE_PROTOCOL_ERROR' : undefined)
    ?? (ENGINE_UNAVAILABLE_PATTERN.test(message) ? 'ENGINE_UNAVAILABLE' : undefined)
    ?? (normalizedMessage ? KNOWN_ERROR_CODES[normalizedMessage] : undefined)
    ?? 'UNKNOWN_ERROR'
  // The support catalog is indexed by canonical token, so the classified code is what has to be
  // looked up; the raw sentence only serves a failure that stayed unclassified.
  const supportCause = code === 'UNKNOWN_ERROR' ? message : code
  const supportCode = supportErrorCodeForCause(supportCause, operationOf(source, context))
  return {
    code,
    supportCode,
    retryable: SUPPORT_ERROR_CATALOG[supportCode].retryable,
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
