/**
 * Electron wraps anything thrown by an IPC handler as
 * `Error invoking remote method '<channel>': [ClassName: ]<message>`.
 * That framing is a transport detail and must not reach user-facing notices.
 */
export function stripIpcErrorMessage(message: string): string {
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    ''
  )
}
