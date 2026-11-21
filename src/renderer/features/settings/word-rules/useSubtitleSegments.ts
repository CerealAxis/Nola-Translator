import type { CaptionSegment } from '../../../../shared/contracts'
import { projectSubtitleSegments } from '../../../../shared/subtitle-word-rules'
import { useWordRules } from './useWordRules'
import { formatChineseCaption } from '@/chinese-script'
import { useTextProcessingEnabled } from '../text-processing/text-processing-preview'

export function useSubtitleSegments<T extends CaptionSegment>(
  segments: readonly T[],
  interim: T | null = null,
  sourceLanguage = '*',
  scene = 'quick-interpret',
) {
  const { document } = useWordRules()
  const active = useTextProcessingEnabled(scene)
  const projected = projectSubtitleSegments(
    active ? document : { ...document, maskEnabled: false },
    (interim ? [...segments, interim] : segments).map((segment) => ({
      ...segment,
      sourceText: formatChineseCaption(
        segment.sourceText,
        segment.sourceLanguage ?? sourceLanguage,
      ),
    })),
    sourceLanguage,
  )
  return {
    segments: projected.slice(0, segments.length),
    interim: interim ? projected.at(-1)! : null,
  }
}
