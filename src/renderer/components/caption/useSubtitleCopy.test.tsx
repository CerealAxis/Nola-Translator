import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { emptyWordRules } from '../../../shared/word-rules'
import { maskSubtitleTracks, projectSubtitleSegments } from '../../../shared/subtitle-word-rules'
import { CaptionTrack } from '@/features/overlay/CaptionTrack'
import { CaptionStage } from './CaptionStage'

afterEach(() => {
  cleanup()
  window.getSelection()?.removeAllRanges()
})
function rules() {
  const document = emptyWordRules()
  document.libraries = [
    {
      id: crypto.randomUUID(),
      kind: 'mask',
      name: 'Subtitle',
      enabled: true,
      scope: { mode: 'global' },
      entries: [
        {
          id: crypto.randomUUID(),
          text: '傻逼',
          language: '*',
          enabled: true,
          caseSensitive: true,
        },
      ],
    },
  ]
  return document
}
function select(start: Node, startOffset: number, end: Node, endOffset: number) {
  const range = document.createRange()
  range.setStart(start, startOffset)
  range.setEnd(end, endOffset)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  const setData = vi.fn()
  fireEvent.copy(document, { clipboardData: { setData } })
  return setData
}

it('copies the original word and only the selected surrounding characters', () => {
  const lines = maskSubtitleTracks(rules(), [{ key: 'one', text: '前傻逼后尾巴' }])
  const { container } = render(
    <CaptionTrack lines={lines} kind="source" maxLines={3} layout="sentence" />,
  )
  const text = container.querySelector('.nola-caption-entry')!.firstChild!
  expect(text.textContent).toBe('前**后尾巴')
  expect(select(text, 1, text, 4)).toHaveBeenCalledWith('text/plain', '傻逼后')
  expect(select(text, 0, text, 1)).toHaveBeenCalledWith('text/plain', '前')
})

it('keeps a selected span across multiple subtitle lines instead of copying the entire track', () => {
  const lines = maskSubtitleTracks(rules(), [
    { key: 'one', text: '前傻逼' },
    { key: 'two', text: '后尾巴' },
  ])
  const { container } = render(
    <CaptionTrack lines={lines} kind="source" maxLines={3} layout="sentence" />,
  )
  const rows = container.querySelectorAll('.nola-caption-entry')
  expect(select(rows[0].firstChild!, 1, rows[1].firstChild!, 1)).toHaveBeenCalledWith(
    'text/plain',
    '傻逼\n后',
  )
})

it('maps caption-stage selected source text back to its original value', () => {
  const raw = [
    {
      segmentId: 'one',
      revision: 1,
      startedAtMs: 0,
      sourceText: '前傻逼后',
      isFinal: true,
      translations: [],
    },
  ]
  const projected = projectSubtitleSegments(rules(), raw)
  render(<CaptionStage segments={projected} interim={null} />)
  const text = screen.getByTestId('caption-source-one').lastChild!
  expect(text.textContent).toBe('前**后')
  expect(select(text, 1, text, 3)).toHaveBeenCalledWith('text/plain', '傻逼')
  expect(raw[0].sourceText).toBe('前傻逼后')
})

it('leaves native copying alone without an explicit subtitle copy projection', () => {
  const { container } = render(
    <CaptionTrack
      lines={[{ key: 'one', text: 'Original text' }]}
      kind="source"
      maxLines={3}
      layout="sentence"
    />,
  )
  const text = container.querySelector('.nola-caption-entry')!.firstChild!
  expect(select(text, 0, text, 8)).not.toHaveBeenCalled()
})
