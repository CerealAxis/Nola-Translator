import { z } from 'zod'
import type { ModelDownloadSource } from './contracts'

export const offlinePrepareSchema = z.object({
  modelIds: z.array(z.string().min(1).max(256)).max(16),
  runtimeIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(4),
  modelSource: z.enum(['huggingface', 'hf-mirror', 'modelscope']).optional(),
  exportModel: z.boolean().optional(),
}).refine(value => value.modelIds.length + value.runtimeIds.length > 0)
export type OfflinePrepareRequest = z.infer<typeof offlinePrepareSchema>
export type OfflineWorkflow = 'model-import' | 'model-download' | 'bundle-prepare' | 'bundle-install'
export type OfflineIssue = 'missingFiles' | 'checksumMismatch' | 'unsupportedModel' | 'incompatible' | 'insufficientSpace' | 'invalidPackage' | 'busy' | 'failed'
export interface OfflineItem {
  id: string
  name: string
  kind: 'model' | 'runtime'
  bytes: number
  status: 'ready' | 'installed' | 'invalid'
  issue?: OfflineIssue
  files?: string[]
  reason?: string
}
export interface OfflinePreview {
  token: string
  sourcePath?: string
  items: OfflineItem[]
  totalBytes: number
  availableBytes?: number
  issues: OfflineIssue[]
  compatible: boolean
}
export interface OfflineTask {
  state: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  phase: 'check' | 'download' | 'copy' | 'install' | 'verify' | 'pack' | 'extract'
  current: number
  total: number
  unit?: 'bytes' | 'items'
  detail?: string
  issue?: OfflineIssue
  reason?: string
  outputPath?: string
}
export interface OfflineDestination { token: string; label: string }
export interface OfflineApi {
  selectModel(kind: 'file' | 'directory', repo?: string, path?: string): Promise<OfflinePreview | null>
  selectDestination(path?: string): Promise<OfflineDestination | null>
  selectBundle(): Promise<OfflinePreview | null>
  prepare(request: OfflinePrepareRequest, destination?: { kind?: 'package' | 'model'; token?: string }): Promise<OfflineTask | null>
  install(token: string): Promise<OfflineTask>
  snapshot(): Promise<OfflineTask>
  cancel(): Promise<void>
  openOutput(): Promise<void>
}
