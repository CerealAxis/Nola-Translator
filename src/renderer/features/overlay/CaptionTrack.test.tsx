import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CaptionTrack } from './CaptionTrack'
import type { TrackLine } from './CaptionTrack'

afterEach(cleanup)

function finishChanges(container: HTMLElement) {
  for (const span of container.querySelectorAll('.nola-caption-change[data-entering="true"]')) {
    fireEvent.animationEnd(span)
    // React uses the prefixed event in JSDOM, which lacks native AnimationEvent.
    fireEvent(span, new Event('webkitAnimationEnd', { bubbles: true }))
  }
}

function confirmedOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.nola-caption-confirmed')
}

function tailOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.nola-caption-tail')
}

function enteringTexts(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)
}

function track(kind: 'source' | 'translation', line: TrackLine, layout: 'rolling' | 'sentence' = 'rolling') {
  return <CaptionTrack kind={kind} maxLines={4} layout={layout} lines={[line]} />
}

it.each(['rolling', 'sentence'] as const)('keeps the confirmed node and its text while the tail is rewritten in %s layout', layout => {
  const { container, rerender } = render(track('translation', { key: 's', text: '我们需要仔细地分析问题', stableText: '我们需要' }, layout))
  const confirmed = confirmedOf(container)
  expect(confirmed?.textContent).toBe('我们需要')
  expect(tailOf(container)?.textContent).toBe('仔细地分析问题')

  rerender(track('translation', { key: 's', text: '我们需要更加仔细地分析问题', stableText: '我们需要' }, layout))
  expect(confirmedOf(container)).toBe(confirmed)
  expect(confirmed?.textContent).toBe('我们需要')
  expect(tailOf(container)?.textContent).toBe('更加仔细地分析问题')
})

it('muted the unconfirmed tail and leaves the confirmed text in the foreground colour', () => {
  const { container } = render(track('translation', { key: 's', text: '我们需要仔细地分析问题', stableText: '我们需要' }))
  const confirmed = confirmedOf(container)
  const tail = tailOf(container)
  expect(tail?.style.color).toBe('var(--muted)')
  // The confirmed part carries no colour of its own: it inherits the track's foreground.
  expect(confirmed?.style.color).toBe('')
  // Only the tail animates, so the confirmed text never fades in again.
  expect(confirmed?.className).not.toContain('nola-caption-change')
})

it('animates only the tail the model has just added', () => {
  const { container, rerender } = render(track('translation', { key: 's', text: 'First part', stableText: 'First' }))
  finishChanges(container)
  rerender(track('translation', { key: 's', text: 'First part and more', stableText: 'First' }))
  expect(enteringTexts(container)).toEqual([' and more'])
  expect(confirmedOf(container)?.textContent).toBe('First')
})

it('moves newly confirmed text out of the tail and into the confirmed node', () => {
  const { container, rerender } = render(track('translation', { key: 's', text: 'First part', stableText: 'First' }))
  const confirmed = confirmedOf(container)
  rerender(track('translation', { key: 's', text: 'First part', stableText: 'First part' }))
  expect(confirmedOf(container)).toBe(confirmed)
  expect(confirmed?.textContent).toBe('First part')
  expect(tailOf(container)).toBeNull()
})

it('keeps settled tail runs in one node without merging them into the confirmed text', () => {
  const { container, rerender } = render(track('translation', { key: 's', text: 'AB', stableText: 'A' }))
  finishChanges(container)
  rerender(track('translation', { key: 's', text: 'ABC', stableText: 'A' }))
  finishChanges(container)
  expect(container.querySelectorAll('.nola-caption-tail')).toHaveLength(1)
  expect(tailOf(container)?.textContent).toBe('BC')
  expect(confirmedOf(container)?.textContent).toBe('A')
  expect(confirmedOf(container)).not.toBe(tailOf(container))
})

it('falls back to the shared word prefix when the text no longer starts with the confirmed text', () => {
  const { container } = render(track('translation', {
    key: 's',
    text: 'We need a calm solution today.',
    stableText: 'We need a careful solution today.',
  }))
  expect(confirmedOf(container)?.textContent).toBe('We need a careful solution today.')
  expect(tailOf(container)?.textContent).toBe('calm solution today.')
})

it('keeps the confirmed text when a Chinese translation was rewritten, whatever the word boundary is', () => {
  // Chinese is cut on the runtime's ICU dictionary, so only the confirmed part
  // and the muted tail are asserted here; the boundary itself is not portable.
  const { container } = render(track('translation', {
    key: 's',
    text: '我们需要更加仔细地分析问题',
    stableText: '我们需要更仔细',
  }))
  expect(confirmedOf(container)?.textContent).toBe('我们需要更仔细')
  expect(tailOf(container)?.textContent).toBeTruthy()
  expect(tailOf(container)?.style.color).toBe('var(--muted)')
})

it('replaces the whole tail when the model rewrites it, keeping graphemes intact', () => {
  const { container, rerender } = render(track('translation', { key: 's', text: '👩‍💻 is ready', stableText: '' }))
  finishChanges(container)
  rerender(track('translation', { key: 's', text: '👩‍🔬 is ready', stableText: '' }))
  expect(container.querySelector('[data-entering="true"]')).toHaveTextContent('👩‍🔬 is ready')
})

it('draws a translation the engine did not layer as plain text', () => {
  const { container, rerender } = render(track('translation', { key: 's', text: 'We need a calm solution today.' }))
  // No confirmed prefix means there is nothing to tell apart, so the caption is one
  // plain run instead of a muted tail.
  expect(confirmedOf(container)).toBeNull()
  expect(tailOf(container)).toBeNull()
  expect(container.querySelector('.nola-caption-segment')?.textContent).toBe('We need a calm solution today.')
  rerender(track('translation', { key: 's', text: 'We need a careful solution today.' }))
  expect(container.querySelector('.nola-caption-segment')?.textContent).toBe('We need a careful solution today.')
})

it('draws the source track as plain text, without a confirmed split', () => {
  const { container } = render(track('source', { key: 's', text: 'We need a careful solution today.' }))
  expect(confirmedOf(container)).toBeNull()
  expect(tailOf(container)).toBeNull()
  expect(container.querySelector('.nola-caption-segment')?.textContent).toBe('We need a careful solution today.')
})

it('skips a line without text', () => {
  const { container } = render(track('translation', { key: 's', text: '' }))
  expect(container.querySelectorAll('.nola-caption-segment')).toHaveLength(0)
})

it.each(['source', 'translation'] as const)('preserves complete words between independent %s segments', kind => {
  const { container } = render(<CaptionTrack kind={kind} maxLines={4} layout="rolling" lines={[
    { key: 'first', text: 'Grab' },
    { key: 'second', text: 'butter' },
  ]} />)
  expect([...container.querySelectorAll('.nola-caption-segment')].map(node => node.textContent)).toEqual(['Grab', 'butter'])
})

it.each(['rolling', 'sentence'] as const)('keeps distinct sentences with a shared opening in %s layout', layout => {
  const { container } = render(<CaptionTrack kind="source" maxLines={4} layout={layout} lines={[
    { key: 'first', text: 'I would like to know what happened yesterday.' },
    { key: 'second', text: 'I would like to know what happens tomorrow.' },
  ]} />)
  expect(container).toHaveTextContent('I would like to know what happened yesterday.')
  expect(container).toHaveTextContent('I would like to know what happens tomorrow.')
})

it('preserves an intentionally repeated sentence and replaces only its own revision', () => {
  const lines = [{ key: 'first', text: 'Thank you.' }, { key: 'second', text: 'Thank you.' }]
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={lines} />)
  expect(container.querySelectorAll('.nola-caption-segment')).toHaveLength(2)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[lines[0], { key: 'second', text: 'Thank you very much.' }]} />)
  expect([...container.querySelectorAll('.nola-caption-segment')].map(node => node.textContent)).toEqual(['Thank you.', 'Thank you very much.'])
})

it('updates an older translation without removing a later sentence', () => {
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[
    { key: 'first', text: 'draft' }, { key: 'second', text: 'later sentence' },
  ]} />)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[
    { key: 'first', text: 'completed translation' }, { key: 'second', text: 'later sentence' },
  ]} />)
  expect([...container.querySelectorAll('.nola-caption-segment')].map(node => node.textContent)).toEqual(['completed translation', 'later sentence'])
})

it.each(['rolling', 'sentence'] as const)('settles the confirmed text during rapid revisions in %s layout', layout => {
  const view = (text: string, stableText: string) => (
    <CaptionTrack kind="translation" maxLines={4} layout={layout} lines={[{ key: 's', text, stableText }]} />
  )
  const { container, rerender } = render(view('We need a fast solution today.', 'We need a '))
  const confirmed = confirmedOf(container)
  expect(confirmed?.textContent).toBe('We need a ')

  rerender(view('We need a careful solution today.', 'We need a '))
  expect(confirmedOf(container)).toBe(confirmed)
  expect(confirmed?.textContent).toBe('We need a ')
  expect(enteringTexts(container)).toEqual(['careful solution today.'])

  rerender(view('We need a careful solution today. Next.', 'We need a careful solution today.'))
  expect(confirmedOf(container)).toBe(confirmed)
  expect(confirmed?.textContent).toBe('We need a careful solution today.')
  expect(enteringTexts(container)).toEqual([' Next.'])

  finishChanges(container)
  rerender(view('We need a careful solution today. Next.', 'We need a careful solution today.'))
  expect(container.querySelector('[data-entering="true"]')).toBeNull()
})
