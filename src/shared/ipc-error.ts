/**
 * Electron 把 IPC 处理器抛出的错误包成
 * `Error invoking remote method '<channel>': [ClassName: ]<原消息>`。
 * 这是传输层细节，不该出现在界面上的通知里。
 */
export function stripIpcErrorMessage(message: string): string {
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    ''
  )
}
