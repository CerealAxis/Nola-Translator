/**
 * A translation failure MUST be rendered, never swallowed.
 *
 * Both the overlay and the workspace transcript call this: an error that shows
 * as blank space is indistinguishable from "still translating", and the user
 * can do nothing about it either way.
 *
 * The dictionary lives at `shellUi.error.*` in `i18n/shell-ui.ts`; this is the
 * error-code-to-key map. Both paths matter — dictionary text on a hit, the
 * `TRANSLATION_ERROR_LABELS` fallback on a miss, and the raw code as a last
 * resort. Blank is the worst outcome.
 */

import type { CaptionSegment, Translation } from '@/bridge'
import { TRANSLATION_ERROR_LABELS } from '@/bridge'
import type { TranslationKey } from '@/i18n'

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

/** Engine error code → dictionary key, falling back to `TRANSLATION_ERROR_LABELS` on a miss. */
const ERROR_KEYS: Record<string, TranslationKey> = {
  URLError: 'shellUi.error.URLError',
  HTTPError: 'shellUi.error.HTTPError',
  TimeoutError: 'shellUi.error.TimeoutError',
  translationTimeout: 'shellUi.error.translationTimeout',
  resourceUnavailable: 'shellUi.error.resourceUnavailable',
  llamaServerUnavailable: 'shellUi.error.llamaServerUnavailable',
  unsupportedLanguagePair: 'shellUi.error.unsupportedLanguagePair',
  translationUnavailable: 'shellUi.error.translationUnavailable',
  RuntimeError: 'shellUi.error.RuntimeError',
  ValueError: 'shellUi.error.ValueError',
  ConnectionError: 'shellUi.error.ConnectionError',
}

export function failedTranslations(caption?: CaptionSegment | null): Translation[] {
  return (caption?.translations ?? []).filter((item) => item.state === 'failed')
}

/** Full text for one failed translation, e.g. "Translation failed · network unreachable". */
export function translationErrorLabel(t: Translate, translation: Translation): string {
  const code = translation.errorCode ?? ''
  const key = ERROR_KEYS[code]
  const reason = key
    ? t(key)
    : code
      ? (TRANSLATION_ERROR_LABELS[code] ?? code)
      : t('shellUi.unknownReason')
  return t('shellUi.translationFailed', { reason })
}

/**
 * Every failed translation in one segment, comma-joined.
 *
 * With several target languages more than one can fail at once, and listing all
 * of them beats reporting only the first: "network unreachable" says it is not
 * a configuration problem, "translation model not installed" says go install one.
 */
export function translationErrorSummary(t: Translate, caption?: CaptionSegment | null): string {
  const failed = failedTranslations(caption)
  if (failed.length === 0) return ''
  return failed.map((item) => translationErrorLabel(t, item)).join('；')
}
