import type { CaptionSegment } from './contracts'
import { resolveWordRules, type WordRulesDocument } from './word-rules'

type SubtitleLine = { key: string; text: string; stableText?: string }
export interface SubtitleCopySpan {
  start: number
  end: number
  text: string
  atomic?: boolean
}
export interface SubtitleCopyMetadata {
  subtitleCopy?: SubtitleCopySpan[]
  subtitleSourceCopy?: SubtitleCopySpan[]
}
export function maskSubtitleTracks<T extends SubtitleLine>(
  document: WordRulesDocument,
  lines: readonly T[],
  language = '*',
  scenario: 'realtime' | 'game' = 'realtime',
  projectId?: string,
): Array<T & SubtitleCopyMetadata> {
  if (
    !document.maskEnabled ||
    !document.libraries.some(
      (library) =>
        library.kind === 'mask' &&
        library.enabled &&
        library.entries.some((entry) => entry.enabled),
    )
  )
    return lines.map((line) => ({ ...line }))
  const ranges: Array<{ start: number; end: number }> = []
  let combined = ''
  for (const line of lines) {
    const previous = combined.at(-1),
      next = line.text[0]
    if (
      previous &&
      next &&
      !(
        /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(previous) &&
        /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(next)
      )
    )
      combined += ' '
    ranges.push({ start: combined.length, end: combined.length + line.text.length })
    combined += line.text
  }
  const { hits } = resolveWordRules(document, {
    kind: 'mask',
    text: combined,
    language,
    context: { scenario, ...(projectId && { projectId }) },
  })
  if (!hits.length) return lines.map((line) => ({ ...line }))
  return lines.map((line, index) => {
    const range = ranges[index],
      stableEnd = range.start + (line.stableText?.length ?? 0)
    let text = '',
      stableText = '',
      cursor = range.start
    const subtitleCopy: SubtitleCopySpan[] = []
    const append = (display: string, raw = display, atomic = false) => {
      if (display)
        subtitleCopy.push({
          start: text.length,
          end: text.length + display.length,
          text: raw,
          ...(atomic && { atomic }),
        })
      text += display
    }
    for (const hit of hits.filter((hit) => hit.end > range.start && hit.start < range.end)) {
      const start = Math.max(cursor, range.start),
        before = Math.max(start, hit.start)
      append(combined.slice(start, before))
      if (line.stableText) stableText += combined.slice(start, Math.min(before, stableEnd))
      if (hit.start >= range.start) {
        append('**', hit.actual, true)
        if (line.stableText && hit.end <= stableEnd) stableText += '**'
      }
      cursor = Math.min(range.end, hit.end)
    }
    append(combined.slice(cursor, range.end))
    if (line.stableText) stableText += combined.slice(cursor, Math.max(cursor, stableEnd))
    return {
      ...line,
      text,
      ...(text !== line.text && { subtitleCopy }),
      ...(line.stableText !== undefined && {
        stableText: text.startsWith(stableText) ? stableText : '',
      }),
    }
  })
}

export function projectSubtitleSegments<T extends CaptionSegment>(
  document: WordRulesDocument,
  segments: readonly T[],
  sourceLanguage = '*',
): T[] {
  const sources = maskSubtitleTracks(
    document,
    segments.map((segment) => ({ key: segment.segmentId, text: segment.sourceText })),
    sourceLanguage,
  )
  const languages = [
    ...new Set(
      segments.flatMap((segment) =>
        segment.translations.map((translation) => translation.targetLanguage),
      ),
    ),
  ]
  const translations = new Map(
    languages.map((language) => [
      language,
      maskSubtitleTracks(
        document,
        segments.map((segment) => {
          const translation = segment.translations.find((item) => item.targetLanguage === language)
          return {
            key: segment.segmentId,
            text: translation?.text ?? '',
            stableText: translation?.stableText,
          }
        }),
        language,
      ),
    ]),
  )
  return segments.map(
    (segment, index) =>
      ({
        ...segment,
        sourceText: sources[index].text,
        ...(sources[index].subtitleCopy && { subtitleSourceCopy: sources[index].subtitleCopy }),
        translations: segment.translations.map((translation) => ({
          ...translation,
          ...(translation.text !== undefined && {
            text: translations.get(translation.targetLanguage)![index].text,
            stableText: translations.get(translation.targetLanguage)![index].stableText,
            ...(translations.get(translation.targetLanguage)![index].subtitleCopy && {
              subtitleCopy: translations.get(translation.targetLanguage)![index].subtitleCopy,
            }),
          }),
        })),
      }) as T,
  )
}
