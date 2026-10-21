import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { CaptionSegment } from '@/bridge'
import { CaptionStage, translationOf } from './CaptionStage'

it('keeps skipped translations readable even in translation-only mode', () => {
  render(<CaptionStage displayMode="translation" interim={null} segments={[{
    segmentId: 'unsupported', revision: 1, startedAtMs: 0, endedAtMs: 1000,
    sourceText: '保留未翻译的原文', sourceLanguage: 'zh', isFinal: true, translations: [],
  }]} />)
  expect(screen.getByText('保留未翻译的原文')).toBeVisible()
})

it('shows streamed translation text while its request is still pending', () => {
  expect(translationOf({ segmentId: 'stream', revision: 1, startedAtMs: 0, sourceText: 'hello',
    sourceLanguage: 'en', isFinal: true, translations: [{ targetLanguage: 'zh', state: 'pending', provider: 'cloud', text: '你好' }],
  })).toBe('你好')
})

it('shows the unconfirmed tail of a translation in the muted colour', () => {
  render(<CaptionStage interim={null} segments={[{
    segmentId: 'tail', revision: 1, startedAtMs: 0, sourceText: 'hello', sourceLanguage: 'en', isFinal: true,
    translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'cloud', text: '你好世界', stableText: '你好' }],
  }]} />)
  const line = screen.getByTestId('caption-target-tail')
  expect(line).toHaveTextContent('你好世界')
  expect(line.querySelector('.nola-caption-confirmed')?.textContent).toBe('你好')
  const tail = line.querySelector('.nola-caption-tail') as HTMLElement
  expect(tail.textContent).toBe('世界')
  expect(tail.style.color).toBe('var(--muted)')
})

it('shows a translation the engine did not layer as plain foreground text', () => {
  render(<CaptionStage interim={null} segments={[{
    segmentId: 'whole', revision: 1, startedAtMs: 0, sourceText: 'hello', sourceLanguage: 'en', isFinal: true,
    translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'cloud', text: '你好世界' }],
  }]} />)
  const line = screen.getByTestId('caption-target-whole')
  expect(line).toHaveTextContent('你好世界')
  // Without a confirmed prefix there is nothing to tell apart, so the text stays whole
  // and keeps the foreground colour instead of turning into a provisional tail.
  expect(line.querySelector('.nola-caption-confirmed')).toBeNull()
  expect(line.querySelector('.nola-caption-tail')).toBeNull()
})

it('shows a translation with nothing confirmed yet as one unconfirmed tail', () => {
  render(<CaptionStage interim={null} segments={[{
    segmentId: 'pending', revision: 1, startedAtMs: 0, sourceText: 'hello', sourceLanguage: 'en', isFinal: true,
    translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'cloud', text: '你好世界', stableText: '' }],
  }]} />)
  const line = screen.getByTestId('caption-target-pending')
  expect(line).toHaveTextContent('你好世界')
  // The engine confirmed nothing, so the whole line is still the tail it may change.
  expect(line.querySelector('.nola-caption-confirmed')).toBeNull()
  const tail = line.querySelector('.nola-caption-tail') as HTMLElement
  expect(tail.textContent).toBe('你好世界')
  expect(tail.style.color).toBe('var(--muted)')
})

it('draws a segment that is both final and interim on one line', () => {
  const final: CaptionSegment = {
    segmentId: 'same', revision: 2, startedAtMs: 0, sourceText: 'hello',
    sourceLanguage: 'en', isFinal: true,
    translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'cloud', text: '你好' }],
  }
  const interim = { ...final, revision: 3, isFinal: false, sourceText: 'hello there' }
  render(<CaptionStage interim={interim} segments={[final]} />)
  expect(screen.getAllByTestId('caption-source-same')).toHaveLength(1)
  expect(screen.getAllByTestId('caption-target-same')).toHaveLength(1)
  // The interim revision carries the longer accumulation of the same segment.
  expect(screen.getByTestId('caption-source-same')).toHaveTextContent('hello there')
})
