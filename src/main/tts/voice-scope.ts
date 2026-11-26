import { createHash } from 'node:crypto'
import type { WorkspaceConnection } from '../../shared/model-workspace'

export function voiceAccountScope(connection: WorkspaceConnection, credential: string): string {
  return JSON.stringify([connection.id, connection.endpoint, connection.options?.region ?? connection.region, connection.workspace,
    connection.options?.groupId, connection.options?.appId,
    createHash('sha256').update(credential).digest('hex')])
}
