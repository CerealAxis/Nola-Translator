import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
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
