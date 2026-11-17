import type { CaptionSegment } from '../../../../shared/contracts'
import { projectSubtitleSegments } from '../../../../shared/subtitle-word-rules'
import { useWordRules } from './useWordRules'
import { formatChineseCaption } from '@/chinese-script'

export function useSubtitleSegments<T extends CaptionSegment>(
  segments: readonly T[],
  interim: T | null = null,
  sourceLanguage = '*',
) {
  const { document } = useWordRules()
  const projected = projectSubtitleSegments(
    document,
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
