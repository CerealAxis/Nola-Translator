import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CaptionTrack } from './CaptionTrack'

afterEach(cleanup)

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
