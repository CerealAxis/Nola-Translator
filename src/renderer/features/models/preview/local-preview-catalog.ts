import type { ResourceRecord } from '../../../../shared/contracts'
import { modelEngines, type InferenceEngine } from '../../../../shared/model-engines'
import { visualModelName, visualSeriesOf } from '../visual-model-display'
import { FAMILY_NAMES, familyOf } from '../modelFamily'

const categories = {
  recognitionModel: 'ASR',
  translationModel: 'MT',
  ttsModel: 'TTS',
  ocrModel: 'OCR',
  detectModel: 'detect',
  inpaintModel: 'inpaint',
} as const satisfies Record<ResourceRecord['kind'], string>

export type Category = typeof categories[keyof typeof categories] | 'LLM'
type Engine = InferenceEngine | 'onnx' | 'opencv'
export type PreviewFamily = {
  key: string
  name: string
  category: Category
  records: ResourceRecord[]
  engines: Engine[]
}

export const engineNames: Record<Engine, string> = {
  llama: 'llama.cpp', crisp: 'CrispASR', pytorch: 'PyTorch', onnx: 'ONNX Runtime', opencv: 'OpenCV',
}

export function isLocalDownloadActive(record: ResourceRecord) {
  return (record.state === 'running' || record.state === 'paused' || record.state === 'cancelling')
    && record.phase !== 'remove' && record.phase !== 'cleanup'
}

export function previewEngine(record: ResourceRecord): Engine | undefined {
  if (record.provider === 'lama-onnx') return 'opencv'
  return modelEngines(record)[0] ?? (
    record.kind === 'ocrModel' || record.kind === 'detectModel' || record.kind === 'inpaintModel' ? 'onnx' : undefined
  )
}

export function localModelFamilies(resources: readonly ResourceRecord[]): PreviewFamily[] {
  const families = new Map<string, PreviewFamily>()
  for (const record of resources) {
    const id = record.resourceId
    const engine = previewEngine(record)
    if (!engine) continue
    const family = id.startsWith('hub:') ? 'other' : familyOf(record)
    if (!record.installed && !isLocalDownloadActive(record)
      && (id.startsWith('hub:') || id === 'm2m100-418m' || id === 'pp-ocrv5-mobile-onnx' || family === 'kokoro' || family === 'piper')) continue
    const visual = visualSeriesOf(record)
    const key = visual?.key ?? (family === 'other' ? id : family)
    const existing = families.get(key)
    if (existing) {
      existing.records.push(record)
      if (!existing.engines.includes(engine)) existing.engines.push(engine)
    } else {
      const name = visual?.name ?? (family === 'other' ? visualModelName(record)
        : family === 'qwen35' ? 'Qwen 3.5' : family === 'hymt2' ? 'HY-MT2' : FAMILY_NAMES[family])
      const category = family === 'qwen35' ? 'LLM' : categories[record.kind]
      families.set(key, { key, name, category, records: [record], engines: [engine] })
    }
  }
  return [...families.values()]
}
