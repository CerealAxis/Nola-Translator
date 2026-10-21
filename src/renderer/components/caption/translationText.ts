/**
 * Where a translation stops being provisional.
 *
 * The engine confirms a prefix of every translation: that prefix only grows and
 * the model never rewrites it. Everything past it is the model's latest output
 * and may still change on the next revision. Both caption paths split on the
 * same boundary, so the floating caption and the workspace agree on which
 * words are still moving.
 */

/**
 * A translation split into its confirmed prefix and its unconfirmed tail.
 *
 * The two shapes are told apart by `confirmed`: a translation the engine did not
 * layer carries neither half, while a layered one always carries both.
 */
export type TranslationTextParts =
  | { confirmed?: undefined; tail?: undefined }
  | { confirmed: string; tail: string }

const wordSegmenter = typeof Intl.Segmenter === 'undefined'
  ? null
  : new Intl.Segmenter(undefined, { granularity: 'word' })

/**
 * Length of the longest common word prefix of two texts.
 *
 * Word granularity cuts Chinese on the runtime's ICU dictionary rather than on
 * spaces, so the boundary moves with the ICU version. The result is therefore
 * only used for a state the engine rules out, never for text the engine
 * produced normally.
 */
export function sharedWordPrefixLength(left: string, right: string): number {
  if (!wordSegmenter) return 0
  const a = [...wordSegmenter.segment(left)].map(item => item.segment)
  const b = [...wordSegmenter.segment(right)].map(item => item.segment)
  let length = 0
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) break
    length += a[index].length
  }
  return length
}

/**
 * Split a translation into its confirmed prefix and its unconfirmed tail.
 *
 * `stableText` is a prefix of `text` by contract. When it is not, the model
 * rewrote text the engine had already confirmed: the confirmed part is kept as
 * it stands, and the tail starts at the last word the two texts still share.
 *
 * A missing `stableText` means the engine did not layer this translation, so the
 * text is returned whole and unlabelled. An empty `stableText` means the engine
 * has confirmed nothing yet, which leaves the whole text provisional.
 */
export function splitTranslationText(text: string, stableText?: string): TranslationTextParts {
  if (stableText === undefined) return {}
  if (text.startsWith(stableText)) return { confirmed: stableText, tail: text.slice(stableText.length) }
  return { confirmed: stableText, tail: text.slice(sharedWordPrefixLength(stableText, text)) }
}
