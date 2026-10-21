import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CaptionTrack } from './CaptionTrack'

afterEach(cleanup)

function finishChanges(container: HTMLElement) {
  for (const span of container.querySelectorAll('.nola-caption-change[data-entering="true"]')) {
    fireEvent.animationEnd(span)
    // React uses the prefixed event in JSDOM, which lacks native AnimationEvent.
    fireEvent(span, new Event('webkitAnimationEnd', { bubbles: true }))
  }
}

it.each(['rolling', 'sentence'] as const)('animates only appended translation text in %s layout', layout => {
  const first = '因为我们想在实施解决方案之前仔细分析问题。'
  const appended = '这在项目管理中非常重要。'
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout={layout} lines={[{ key: 'segment', text: first }]} />)
  finishChanges(container)
  const prefix = container.querySelector('.nola-caption-change')
  expect(prefix).not.toBeNull()
  rerender(<CaptionTrack kind="translation" maxLines={4} layout={layout} lines={[{ key: 'segment', text: first + appended }]} />)
  expect(container.querySelector('.nola-caption-change')).toBe(prefix)
  expect(prefix).toHaveTextContent(first)
  expect(prefix).toHaveAttribute('data-entering', 'false')
  expect([...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)).toEqual([appended])
})

it('animates everything from the first changed grapheme, including a shared ending', () => {
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'We need a fast solution today.' }]} />)
  finishChanges(container)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'We need a careful solution today.' }]} />)
  expect(container).toHaveTextContent('We need a careful solution today.')
  expect([...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)).toEqual(['careful solution today.'])
  finishChanges(container)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'We need a careful solution today.' }]} />)
  expect(container.querySelector('[data-entering="true"]')).toBeNull()
})

it('animates a full replacement and keeps Unicode graphemes intact', () => {
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: '先分析需求。' }]} />)
  finishChanges(container)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: '明天部署系统！' }]} />)
  expect(container.querySelector('[data-entering="true"]')).toHaveTextContent('明天部署系统！')
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: '👩‍💻 is ready' }]} />)
  finishChanges(container)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: '👩‍🔬 is ready' }]} />)
  expect(container.querySelector('[data-entering="true"]')).toHaveTextContent('👩‍🔬 is ready')
})

it('settles retained text during rapid appends and does not animate deletions', () => {
  const { container, rerender } = render(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'First.' }]} />)
  const first = container.querySelector('.nola-caption-change')
  expect(first).not.toBeNull()
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'First.Second.' }]} />)
  expect(container.querySelector('.nola-caption-change')).toBe(first)
  expect(first).toHaveAttribute('data-entering', 'false')
  expect([...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)).toEqual(['Second.'])
  finishChanges(container)
  rerender(<CaptionTrack kind="translation" maxLines={4} layout="rolling" lines={[{ key: 's', text: 'First.' }]} />)
  expect(container).toHaveTextContent('First.')
  expect(container.querySelector('[data-entering="true"]')).toBeNull()
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


it.each(['rolling', 'sentence'] as const)('settles every retained prefix during rapid revisions in %s layout', layout => {
  const view = (text: string) => <CaptionTrack kind="translation" maxLines={4} layout={layout} lines={[{ key: 's', text }]} />
  const { container, rerender } = render(view('We need a fast solution today.'))
  rerender(view('We need a careful solution today.'))
  const prefix = container.querySelector('.nola-caption-change')
  expect(prefix?.textContent).toBe('We need a ')
  expect(prefix).toHaveAttribute('data-entering', 'false')
  expect([...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)).toEqual(['careful solution today.'])
  rerender(view('We need a careful solution today. Next.'))
  expect(container.querySelector('.nola-caption-change')).toBe(prefix)
  expect([...container.querySelectorAll('[data-entering="false"]')].map(node => node.textContent).join('')).toBe('We need a careful solution today.')
  expect([...container.querySelectorAll('[data-entering="true"]')].map(node => node.textContent)).toEqual([' Next.'])
  finishChanges(container)
  rerender(view('We need a careful solution today. Next.'))
  expect(container.querySelector('[data-entering="true"]')).toBeNull()
})
