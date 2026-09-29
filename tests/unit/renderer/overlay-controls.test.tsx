import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { CaptionTrack } from '../../../src/renderer/overlay/CaptionTrack'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineEvent } from '../../../src/shared/contracts'

afterEach(() => vi.restoreAllMocks())

function listen(): { emit: (event: EngineEvent) => void } {
  let listener: ((event: EngineEvent) => void) | undefined
  vi.spyOn(window.nolaTranslator!, 'onEngineEvent').mockImplementation((next) => {
    listener = next
    return () => undefined
  })
  return { emit: (event) => { act(() => listener?.(event)) } }
}

function caption(segmentId: string, sourceText: string, revision: number, translation?: string, isFinal = true): EngineEvent {
  return {
    protocolVersion: 1, type: 'caption', requestId: `${segmentId}-${revision}`, sessionId: 'session-live',
    segment: {
      segmentId, revision, startedAtMs: segmentId === 'one' ? 1000 : 2000,
      sourceText, isFinal,
      translations: [{ targetLanguage: 'zh', state: translation ? 'complete' : 'pending', provider: 'example', text: translation }],
    },
  }
}

it('extends a live sentence in place and keeps its translation while the next revision is pending', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'Four units in London', 1, '伦敦的四家中心', false))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('伦敦的四家中心'))
  const sourceNode = container.querySelector('.overlay-track-source .overlay-track-in')
  const translationNode = container.querySelector('.overlay-track-translation .overlay-track-in')
  const translationTrack = container.querySelector('.overlay-track-translation')

  emit(caption('one', 'Four units in London, Birmingham and Newcastle', 2, undefined, false))
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toBe(sourceNode)
  expect(sourceNode).toHaveTextContent('Birmingham and Newcastle')
  expect(container.querySelector('.overlay-track-source .overlay-track-out')).toBeNull()
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toBe(translationNode)
  expect(translationNode).toHaveTextContent('伦敦的四家中心')
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toBeNull()

  emit(caption('one', 'Four units in London, Birmingham and Newcastle', 2, '伦敦、伯明翰和纽卡斯尔的四家中心也在试用快速基因检测', false))
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('检测')
  expect(container.querySelector('.overlay-track-translation')).toBe(translationTrack)
})

it('keeps a two-line English source together before rolling it', async () => {
  const { emit } = listen()
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS)
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console')).toHaveStyle({ '--overlay-max-lines': '2' }))
  emit(caption('one', 'Today we will talk about this interesting topic', 1, '今天我们讨论这个话题', false))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('今天我们讨论这个话题'))
  const translationNode = container.querySelector('.overlay-track-translation .overlay-track-in')
  const growing = 'Today we will talk about this interesting topic and challenge the idea that we must always be busy'
  emit(caption('one', growing, 2, undefined, false))
  expect(container.querySelector('.overlay-track-source .overlay-track-out')).toBeNull()
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toHaveTextContent(growing)
  emit(caption('one', `${growing} while we examine several other examples and explain why this matters to everyone watching today`, 3, undefined, false))
  expect(container.querySelector('.overlay-track-source .overlay-track-out')).toHaveTextContent(growing)
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toHaveTextContent('everyone watching today')
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toBe(translationNode)
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toBeNull()
})

it('rolls a filled translation line without restarting the source track', async () => {
  const { emit } = listen()
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay, translationMaxLines: 1 },
  })
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console')).toHaveStyle({ '--overlay-translation-max-lines': '1' }))
  emit(caption('one', 'Take a break.', 1, '休息对我们很重要。', false))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('休息对我们很重要'))
  const sourceNode = container.querySelector('.overlay-track-source .overlay-track-in')
  emit(caption('one', 'Take a break.', 2, '休息对我们很重要。忙碌的生活常常让我们忘记停下来，重新整理思绪和恢复精力，然后更从容地面对接下来的事情。', false))
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toHaveTextContent('休息对我们很重要')
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('事情。')
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toBe(sourceNode)
  expect(container.querySelector('.overlay-track-source .overlay-track-out')).toBeNull()
})

it('shows the whole English translation containing a domain', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', '京东页面上的标价是不计国补的。', 1, 'JD.com pages were not counted.'))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in'))
    .toHaveTextContent('JD.com pages were not counted.'))
})

it('keeps both halves of an English translation visible in the same block', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  const translation = 'In addition, several models have prices before and after the national subsidy limits being very similar.'
  emit(caption('one', '另外还有几台机型，国补前后的价格非常接近。', 1, translation))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in'))
    .toHaveTextContent(translation))
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toBeNull()
})

it('plays the first page before the remainder when a translation arrives complete', () => {
  vi.useFakeTimers()
  try {
    const { container } = render(<CaptionTrack line={{ key: 'one', text: 'The first price was listed. The subsidy changed it.' }}
      kind="translation" segmentId="one" maxWidth={900} fontSize={22} maxLines={1} />)
    expect(container.querySelector('.overlay-track-in')).toHaveTextContent('The first price was listed.')
    act(() => vi.advanceTimersByTime(1600))
    expect(container.querySelector('.overlay-track-in')).toHaveTextContent('The subsidy changed it.')
    expect(container.querySelector('.overlay-track-out')).toHaveTextContent('The first price was listed.')
  } finally {
    vi.useRealTimers()
  }
})

it('centers a source-only line vertically while keeping it left aligned', async () => {
  const { emit } = listen()
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, showTranslation: false },
  })
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console-translations')).toBeNull())
  emit(caption('one', 'Source only', 1))
  expect(container.querySelector('.caption-console-stage > .overlay-track-source .overlay-track-text')).toHaveTextContent('Source only')
  expect(container.querySelector('.caption-console-translations')).toBeNull()
})

it('keeps the source in its own slot while a pending translation arrives', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'Source only', 1))
  const source = container.querySelector('.caption-console-stage > .overlay-track-source')
  expect(source).not.toBeNull()
  expect(container.querySelector('.caption-console-translations .overlay-track-text')).toBeNull()
  emit(caption('one', 'Source only', 2, '译文'))
  await waitFor(() => expect(container.querySelector('.caption-console-translations .overlay-track-text')).toHaveTextContent('译文'))
  expect(container.querySelector('.caption-console-stage > .overlay-track-source')).toBe(source)
})

it('shows the reference console controls and keeps close usable when locked', async () => {
  const api = window.nolaTranslator!
  const settings = { ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay, locked: true } }
  vi.spyOn(api, 'getSettings').mockResolvedValue(settings)
  const save = vi.spyOn(api, 'updateSettings').mockResolvedValue({ ...settings, overlay: { ...settings.overlay, locked: false, mode: 'free' } })
  const hide = vi.spyOn(api, 'hideOverlay')
  const appearance = vi.spyOn(api, 'openAppearance')
  const { container } = render(<CaptionOverlay />)

  await waitFor(() => expect(container.querySelector('.caption-console')).toHaveAttribute('data-locked', 'true'))
  expect(screen.getByRole('button', { name: '打开字幕设置' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '打开字幕设置' }))
  expect(appearance).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '始终置顶' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '解锁位置' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ overlay: { mode: 'free', locked: false } }))
  fireEvent.click(screen.getByRole('button', { name: '隐藏浮层' }))
  expect(hide).toHaveBeenCalledOnce()
})

it('moves source and translation on their own content changes', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'First sentence.', 1, '第一句。'))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('第一句。'))

  emit(caption('two', 'Second sentence.', 1))
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toHaveTextContent('Second sentence.')
  expect(container.querySelector('.overlay-track-source .overlay-track-out')).toHaveTextContent('First sentence.')
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toBeNull()
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toHaveTextContent('第一句。')

  emit(caption('two', 'Second sentence.', 2, '第二句。'))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('第二句。'))
  expect(container.querySelector('.overlay-track-translation .overlay-track-out')).toHaveTextContent('第一句。')
})

it('delays translation rollover even when a new caption includes both languages', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'First sentence.', 1, '第一句。'))
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('第一句。'))
  emit(caption('two', 'Second sentence.', 1, '第二句。'))
  expect(container.querySelector('.overlay-track-source .overlay-track-in')).toHaveTextContent('Second sentence.')
  expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('第一句。')
  await waitFor(() => expect(container.querySelector('.overlay-track-translation .overlay-track-in')).toHaveTextContent('第二句。'))
})

it('applies separate typography and a fully transparent background', async () => {
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, backgroundOpacity: 0, maxLines: 2, translationMaxLines: 5, translationFontSize: 31 },
  })
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console')).toHaveAttribute('data-transparent-background', 'true'))
  const style = (container.querySelector('.caption-console') as HTMLElement).style
  expect(style.getPropertyValue('--overlay-max-lines')).toBe('2')
  expect(style.getPropertyValue('--overlay-translation-max-lines')).toBe('5')
  expect(style.getPropertyValue('--overlay-translation-font-size')).toBe('31px')
})
