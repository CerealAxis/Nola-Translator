import { useState } from 'react'

export interface CaptionRevisionTextProps {
  text: string
}

interface TextPart {
  id: number
  text: string
  entering: boolean
}

interface Revision {
  text: string
  parts: TextPart[]
  nextId: number
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

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

function revise(previous: Revision, text: string): Revision {
  const before = [...graphemes.segment(previous.text)].map(item => item.segment)
  const after = [...graphemes.segment(text)].map(item => item.segment)
  let prefix = 0
  let prefixLength = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefixLength += before[prefix].length
    prefix++
  }
  // Once a prefix has survived a revision it is already displayed text, even
  // if its previous entrance has not finished. Only the new tail may animate.
  const opening = sliceParts(previous.parts, 0, prefixLength).map(part => ({ ...part, entering: false }))
  const changed = text.slice(prefixLength)
  return {
    text,
    parts: [...opening, ...(changed ? [{ id: previous.nextId, text: changed, entering: true }] : [])],
    nextId: previous.nextId + (changed ? 1 : 0),
  }
}

function settle(parts: TextPart[], id: number): TextPart[] {
  const result: TextPart[] = []
  for (const part of parts) {
    const next = part.id === id ? { ...part, entering: false } : part
    const last = result[result.length - 1]
    // Compact finished runs while keeping their first node, so long streams do
    // not accumulate one DOM node for every intermediate translation update.
    if (last && !last.entering && !next.entering) result[result.length - 1] = { ...last, text: last.text + next.text }
    else result.push(next)
  }
  return result
}

export function CaptionRevisionText({ text }: CaptionRevisionTextProps) {
  const [revision, setRevision] = useState<Revision>(() => ({
    text, parts: text ? [{ id: 0, text, entering: true }] : [], nextId: 1,
  }))
  // Reconcile before paint: an effect would briefly show the previous revision.
  if (revision.text !== text) setRevision(revise(revision, text))

  return <>{revision.parts.map(part => (
    <span key={part.id} className="nola-caption-change" data-entering={part.entering ? 'true' : 'false'}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget) {
          setRevision(current => ({ ...current, parts: settle(current.parts, part.id) }))
        }
      }}>{part.text}</span>
  ))}</>
}
