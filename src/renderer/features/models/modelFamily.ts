import type { ResourceRecord } from '@/bridge'

export type RecommendedFamily = 'qwen' | 'sensevoice' | 'funasr' | 'vibevoice' | 'mimo' | 'qwen35' | 'tts' | 'kokoro' | 'piper' | 'cosyvoice3' | 'hymt2' | 'index' | 'other'

export function isQwen3TtsRecord(record: Pick<ResourceRecord, 'kind' | 'resourceId'>): boolean {
  return record.kind === 'ttsModel' && record.resourceId.startsWith('tts-qwen3-tts-')
}

export function familyOf(record: ResourceRecord): RecommendedFamily {
  const id = record.resourceId
  if (id.startsWith('qwen3-asr-')) return 'qwen'
  if (id.startsWith('sensevoice-')) return 'sensevoice'
  if (id.startsWith('fun-asr-')) return 'funasr'
  if (id.startsWith('vibevoice-asr-')) return 'vibevoice'
  if (id.startsWith('mimo-v2.5-asr-')) return 'mimo'
  if (id.startsWith('qwen35-')) return 'qwen35'
  if (id.startsWith('tts-kokoro-')) return 'kokoro'
  if (id.startsWith('tts-piper-')) return 'piper'
  if (id.startsWith('tts-cosyvoice3-')) return 'cosyvoice3'
  if (record.kind === 'ttsModel') return 'tts'
  if (id.startsWith('hy-mt2-')) return 'hymt2'
  if (id.startsWith('index-translate-')) return 'index'
  return 'other'
}
