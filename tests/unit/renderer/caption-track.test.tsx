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
