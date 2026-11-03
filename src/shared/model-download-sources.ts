import type { ModelDownloadSource } from './contracts'
import { modelImportEntry } from './model-import-catalog'

export type DownloadSourceOption = {
  source: ModelDownloadSource
  labelKey: 'models.downloadSources.official' | 'models.downloadSources.mirror' | 'models.downloadSources.modelscope'
  tooltipKey: 'models.downloadSources.officialHint' | 'models.downloadSources.mirrorHint' | 'models.downloadSources.modelscopeHint'
}

const SOURCES: readonly DownloadSourceOption[] = [
  { source: 'huggingface', labelKey: 'models.downloadSources.official', tooltipKey: 'models.downloadSources.officialHint' },
  { source: 'hf-mirror', labelKey: 'models.downloadSources.mirror', tooltipKey: 'models.downloadSources.mirrorHint' },
  { source: 'modelscope', labelKey: 'models.downloadSources.modelscope', tooltipKey: 'models.downloadSources.modelscopeHint' },
]

export function downloadSourcesFor(resourceId: string): readonly DownloadSourceOption[] {
  const entry = modelImportEntry(resourceId)
  return SOURCES.filter(({ source }) => entry ? Boolean(entry.sources[source]) : source !== 'modelscope')
}
