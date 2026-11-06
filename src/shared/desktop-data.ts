import { z } from 'zod'

export const desktopDataKinds = ['configuration', 'content', 'audio', 'models', 'runtime', 'credentials', 'cache', 'logs'] as const
export type DesktopDataKind = typeof desktopDataKinds[number]
export interface DesktopDataEntry { name: string; kind: DesktopDataKind }
export const DESKTOP_DATA_ENTRIES: readonly DesktopDataEntry[] = [
  ...['settings.json', 'screen-translation.json', 'glossary.json', 'game-translation.json', 'workspace-window.json',
    'settings.json.migration-v3.json', 'settings.json.migration-v3.bak'].map(name => ({ name, kind: 'configuration' as const })),
  ...['history.jsonl', 'meetings', 'comics', 'local-call'].map(name => ({ name, kind: 'content' as const })),
  { name: 'credentials.json', kind: 'credentials' }, { name: 'session-journal', kind: 'runtime' },
  { name: 'models', kind: 'models' }, { name: 'runtimes', kind: 'models' },
  { name: 'cache', kind: 'cache' }, { name: 'logs', kind: 'logs' },
]
export const backupOptionsSchema = z.object({ audio: z.boolean(), models: z.boolean(),
  password: z.string().max(1024).optional() }).strict()
export type DesktopBackupOptions = z.infer<typeof backupOptionsSchema>
export interface DesktopDataResult { action: 'backup' | 'restore'; state: 'completed' | 'failed'; path?: string; error?: string; at: string }
export interface DesktopDataSnapshot { root: string; usage: Partial<Record<DesktopDataKind, number>>; lastResult?: DesktopDataResult }
export interface DesktopDataApi {
  snapshot(): Promise<DesktopDataSnapshot>
  backup(options: DesktopBackupOptions): Promise<boolean>
  restore(password?: string): Promise<boolean>
}
