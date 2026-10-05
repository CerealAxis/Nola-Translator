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
