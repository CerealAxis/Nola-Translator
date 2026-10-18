import type { ModelDownloadSource } from './contracts'
import catalog from './model-import-catalog.json'

export interface ModelImportEntry {
  id: string
  name: string
  family: 'recognition' | 'translation' | 'tts'
  sources: Partial<Record<ModelDownloadSource, {
    revision: string
    repositoryUrl: string
    files: { path: string; size: number; url: string }[]
  }>>
}

// Generated from the same pinned manifests used to validate local imports.
export const MODEL_IMPORT_CATALOG: readonly ModelImportEntry[] = catalog as ModelImportEntry[]

export function modelImportEntry(id: string): ModelImportEntry | undefined {
  return MODEL_IMPORT_CATALOG.find(entry => entry.id === id)
}
