import { useState } from 'react'

import { splitTranslationText } from '@/components/caption/translationText'

export interface CaptionRevisionTextProps {
  text: string
  /**
   * The confirmed prefix of `text`. It only grows, so the confirmed part of the
   * caption can stay on screen while the model rewrites the rest.
   */
  stableText?: string
}

type PartKind = 'confirmed' | 'tail' | 'plain'

interface TextPart {
  id: number
  kind: PartKind
  text: string
  entering: boolean
}

interface Revision {
  text: string
  stableText?: string
  parts: TextPart[]
  nextId: number
}

const graphemeSegmenter = typeof Intl.Segmenter === 'undefined'
  ? null
  : new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Graphemes, or code points where the runtime has no segmenter. */
function graphemes(text: string): string[] {
  return graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map(item => item.segment)
    : Array.from(text)
}

/** Length of the text two strings share from their start. */
function sharedPrefixLength(left: string, right: string): number {
  const a = graphemes(left)
  const b = graphemes(right)
  let count = 0
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1
  return a.slice(0, count).join('').length
}

function sliceParts(parts: TextPart[], start: number, end: number): TextPart[] {
  const result: TextPart[] = []
  let offset = 0
  for (const part of parts) {
    const left = Math.max(start - offset, 0)
    const right = Math.min(end - offset, part.text.length)
    if (right > left) result.push({ ...part, text: part.text.slice(left, right) })
    offset += part.text.length
    if (offset >= end) break
  }
  return result
}

function initialRevision(text: string, stableText?: string): Revision {
  const split = splitTranslationText(text, stableText)
  const parts: TextPart[] = []
  let nextId = 0
  if (split.confirmed === undefined) {
    // The engine did not layer this translation, so it is shown as one plain run.
    parts.push({ id: nextId++, kind: 'plain', text, entering: false })
    return { text, stableText, parts, nextId }
  }
  if (split.confirmed) parts.push({ id: nextId++, kind: 'confirmed', text: split.confirmed, entering: false })
  if (split.tail) parts.push({ id: nextId++, kind: 'tail', text: split.tail, entering: true })
  return { text, stableText, parts, nextId }
}

function revise(previous: Revision, text: string, stableText?: string): Revision {
  const split = splitTranslationText(text, stableText)
  const parts: TextPart[] = []
  let nextId = previous.nextId
  if (split.confirmed === undefined) {
    // Nothing is confirmed and nothing is provisional: the whole line keeps one node.
    const previousPlain = previous.parts.find(part => part.kind === 'plain')
    parts.push({ id: previousPlain?.id ?? nextId++, kind: 'plain', text, entering: false })
    return { text, stableText, parts, nextId }
  }

  /*
   * The confirmed part keeps its node, so the text already on screen is never
   * remounted. Only the engine confirming more of it changes what it holds.
   */
  const previousConfirmed = previous.parts.find(part => part.kind === 'confirmed')
  if (split.confirmed) {
    parts.push({
      id: previousConfirmed?.id ?? nextId++,
      kind: 'confirmed',
      text: split.confirmed,
      entering: false,
    })
  }

  /*
   * The tail is rebuilt on every revision. Whatever it still shares with the
   * previous tail keeps its node and stays settled; the rest is what the model
   * has just added, and that is the only part that enters.
   */
  const previousTail = previous.parts.filter(part => part.kind === 'tail')
  const previousTailText = previousTail.map(part => part.text).join('')
  const shared = sharedPrefixLength(previousTailText, split.tail)
  const retained = sliceParts(previousTail, 0, shared).map(part => ({ ...part, entering: false }))
  const added = split.tail.slice(shared)
  if (added) parts.push(...retained, { id: nextId++, kind: 'tail', text: added, entering: true })
  else parts.push(...retained)

  return { text, stableText, parts, nextId }
}

function settle(parts: TextPart[], id: number): TextPart[] {
  const result: TextPart[] = []
  for (const part of parts) {
    const next = part.id === id ? { ...part, entering: false } : part
    const last = result[result.length - 1]
    // Compact finished runs of one kind while keeping their first node, so long
    // streams do not accumulate one DOM node for every intermediate translation
    // update. Parts of different kinds never merge: the tail carries the muted
    // colour, and merging it into the confirmed text would colour that too.
    if (last && last.kind === next.kind && !last.entering && !next.entering) {
      result[result.length - 1] = { ...last, text: last.text + next.text }
    } else {
      result.push(next)
    }
  }
  return result
}

export function CaptionRevisionText({ text, stableText }: CaptionRevisionTextProps) {
  const [revision, setRevision] = useState<Revision>(() => initialRevision(text, stableText))
  // Reconcile before paint: an effect would briefly show the previous revision.
  if (revision.text !== text || revision.stableText !== stableText) {
    setRevision(revise(revision, text, stableText))
  }

  return <>{revision.parts.map(part => (
    part.kind === 'confirmed'
      ? <span key={part.id} className="nola-caption-confirmed" data-part="confirmed">{part.text}</span>
      : part.kind === 'plain'
        ? <span key={part.id} data-part="plain">{part.text}</span>
        : <span
          key={part.id}
          className="nola-caption-change nola-caption-tail"
          data-part="tail"
          data-entering={part.entering ? 'true' : 'false'}
          style={{ color: 'var(--muted)' }}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget) {
              setRevision(current => ({ ...current, parts: settle(current.parts, part.id) }))
            }
          }}
        >{part.text}</span>
  ))}</>
}
