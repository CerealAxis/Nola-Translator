import type { ModelDownloadSource } from './contracts'

const MODELSCOPE_MODELS = new Set([
  'qwen3-asr-1.7b-hf',
  'qwen3-asr-0.6b-hf',
  'sensevoice-small',
  'hy-mt2-1.8b-q4-k-m',
  'hy-mt2-1.8b-q3-k-m',
  'hy-mt2-7b-q4-k-m',
  'm2m100-418m',
  'index-translate-2b-q4-k-m',
  'index-translate-9b-q4-k-m',
  'index-translate-35b-a3b-q4-k-m',
  'index-translate-2b-bf16',
  'index-translate-2b-fp8',
  'index-translate-2b-fp4',
  'index-translate-9b-bf16',
  'index-translate-9b-fp8',
  'index-translate-9b-fp4',
  'index-translate-35b-a3b-preview-bf16',
  'index-translate-35b-a3b-preview-fp8',
  'index-translate-35b-a3b-preview-fp4',
])

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
  const sources = SOURCES.filter(option => option.source !== 'modelscope' || MODELSCOPE_MODELS.has(resourceId))
  return resourceId.startsWith('hub:') ? sources.filter(option => option.source !== 'modelscope') : sources
}
