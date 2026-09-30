import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { CaptionTrack } from '../../../src/renderer/overlay/CaptionTrack'

afterEach(() => vi.restoreAllMocks())

const block = (container: HTMLElement): string => container.querySelector('.overlay-track-content')?.textContent ?? ''

it('does not repeat the words a new segment shares with the previous one', () => {
  // Streaming ASR commonly restates the tail of the previous segment. `mergeLine` removes the
  // overlap, but it stores the trimmed text under the incoming segment's own key, so a second fold
  // of the same input used to read that entry as a revision of itself and put the words back.
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'hello world' }} maxLines={3} layout="rolling" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'b', text: 'world peace' }} maxLines={3} layout="rolling" />)

  expect(block(container)).toBe('hello world peace')
})

it('still lets a revision of the sentence on screen replace it in place', () => {
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'hello' }} maxLines={3} layout="rolling" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'a', text: 'hello world' }} maxLines={3} layout="rolling" />)

  expect(block(container)).toBe('hello world')
  // Re-rendering with unchanged props must not fold the same input twice.
  rerender(<CaptionTrack kind="source" line={{ key: 'a', text: 'hello world' }} maxLines={3} layout="rolling" />)
  expect(block(container)).toBe('hello world')
})

it('accumulates genuinely new sentences in order', () => {
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'first sentence' }} maxLines={3} layout="rolling" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'b', text: 'second sentence' }} maxLines={3} layout="rolling" />)
  rerender(<CaptionTrack kind="source" line={{ key: 'c', text: 'third sentence' }} maxLines={3} layout="rolling" />)

  expect(block(container)).toBe('first sentence second sentence third sentence')
})

it('scrolls the sentence layout to the newest entry instead of translating the block', () => {
  // Sentence mode keeps one block per entry in an `overflow: auto` flow and CSS pins its transform
  // to `none`, so without this the entries past the first are clipped and can never be reached.
  // jsdom has no layout box, so `scrollTop` is mocked at the prototype: the real setter is a no-op.
  const setScrollTop = vi.fn()
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: () => 0, set: setScrollTop })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 480 })

  try {
    const { container } = render(
      <CaptionTrack kind="source" line={{ key: 'a', text: 'first' }} maxLines={2} layout="sentence" />,
    )
    expect(container.querySelector('.overlay-track-sentence')).not.toBeNull()
    expect(setScrollTop).toHaveBeenCalledWith(480)
    // The block must stay untransformed; the transform path belongs to the rolling layout only.
    expect((container.querySelector('.overlay-track-content') as HTMLElement).style.transform).toBe('')
  } finally {
    Object.defineProperty(Element.prototype, 'scrollTop', scrollTop!)
    Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight!)
  }
})

it('keeps each sentence in its own node so a revision speaks only itself', () => {
  // A live region announces the whole region unless aria-atomic is false, in which case it
  // announces the node that actually changed. Rolling must therefore keep one node per sentence
  // rather than concatenating them into a single string, and must say so explicitly.
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'first sentence' }} maxLines={3} layout="rolling" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'b', text: 'second sentence' }} maxLines={3} layout="rolling" />)

  const transcript = container.querySelector('.overlay-track-entry') as HTMLElement
  expect(transcript.getAttribute('aria-live')).toBe('polite')
  expect(transcript.getAttribute('aria-atomic')).toBe('false')
  expect([...transcript.querySelectorAll('.overlay-track-segment')].map((node) => node.textContent))
    .toEqual(['first sentence', 'second sentence'])
  // Still one paragraph: the nodes are inline, so the text is joined with the normal seam spacing.
  expect(transcript.textContent).toBe('first sentence second sentence')
})

it('stores each sentence exactly once, with no hidden copy to announce', () => {
  // The first attempt at this mirrored the newest sentence into a second live node. That duplicated
  // the transcript in the document, so a reader in browse mode met the same words twice and
  // getByText matched two elements. One node per sentence removes the need for a mirror entirely.
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'first sentence' }} maxLines={3} layout="rolling" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'b', text: 'second sentence' }} maxLines={3} layout="rolling" />)

  // Counted by hand: `split(needle).length - 1` cannot be used here, because a mirror holds only
  // the newest sentence and would never make the full transcript appear twice.
  const body = document.body.textContent ?? ''
  const occurrences = (needle: string): number => {
    let found = 0
    for (let at = body.indexOf(needle); at !== -1; at = body.indexOf(needle, at + needle.length)) found += 1
    return found
  }
  expect(occurrences('first sentence')).toBe(1)
  expect(occurrences('second sentence')).toBe(1)
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
})

it('keeps the sentence layout announcing discrete entries from the container itself', () => {
  // Entries there are keyed by segment id and genuinely appear one at a time, so the container can
  // stay a live region as is; nothing is joined and nothing is mirrored.
  const { container, rerender } = render(
    <CaptionTrack kind="source" line={{ key: 'a', text: 'first' }} maxLines={3} layout="sentence" />,
  )
  rerender(<CaptionTrack kind="source" line={{ key: 'b', text: 'second' }} maxLines={3} layout="sentence" />)

  expect((container.querySelector('.overlay-track') as HTMLElement).getAttribute('aria-live')).toBe('polite')
  expect(container.querySelector('.overlay-track-segment')).toBeNull()
})

it('keeps the rolling layout on a transform rather than a scroll position', () => {
  const setScrollTop = vi.fn()
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: () => 0, set: setScrollTop })

  try {
    const { container } = render(
      <CaptionTrack kind="source" line={{ key: 'a', text: 'first' }} maxLines={2} layout="rolling" />,
    )
    expect(setScrollTop).not.toHaveBeenCalled()
  } finally {
    Object.defineProperty(Element.prototype, 'scrollTop', scrollTop!)
  }
})
