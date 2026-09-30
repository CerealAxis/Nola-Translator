import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { CaptionTrack } from '../../../src/renderer/overlay/CaptionTrack'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings'
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

/** Rolling tracks render one joined paragraph, so each track contributes a single block. */
const entries = (container: HTMLElement, track: 'source' | 'translation'): string[] =>
  [...container.querySelectorAll(`.overlay-track-${track} .overlay-track-entry`)]
    .map((node) => node.textContent ?? '')
    .filter((text) => text !== '')

it('flows the source as one continuous block without breaking on sentence boundaries', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'Take a break.', 1, '休息对我们很重要。', false))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['休息对我们很重要。']))
  const translationTrack = container.querySelector('.overlay-track-translation')

  emit(caption('one', 'Take a break. Busy days make us forget to stop, tidy our thoughts and recover.', 2, undefined, false))
  expect(entries(container, 'source')).toEqual(['Take a break. Busy days make us forget to stop, tidy our thoughts and recover.'])
  // A pending revision keeps the finished translation on screen instead of blanking it.
  expect(entries(container, 'translation')).toEqual(['休息对我们很重要。'])
  expect(container.querySelector('.overlay-track-translation')).toBe(translationTrack)
})

it('keeps every finished sentence in the block and grows it on each new segment', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'First sentence.', 1, '第一句。'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['第一句。']))

  emit(caption('two', 'Second sentence.', 1))
  // Source and translation arrive separately, so the translation still shows only the first sentence.
  expect(entries(container, 'source')).toEqual(['First sentence. Second sentence.'])
  expect(entries(container, 'translation')).toEqual(['第一句。'])

  emit(caption('two', 'Second sentence.', 2, '第二句。'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['第一句。第二句。']))
})

it('renders a failed translation instead of leaving a silent gap', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  const failed: EngineEvent = {
    protocolVersion: 1, type: 'caption', requestId: 'failed-1', sessionId: 'session-live',
    segment: { segmentId: 'one', revision: 1, startedAtMs: 1000, sourceText: 'Take a break.', isFinal: true,
      translations: [{ targetLanguage: 'zh', state: 'failed', provider: 'example', errorCode: 'TimeoutError' }] },
  }
  emit(failed)
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['翻译失败 · 请求超时']))
})

it('shows the whole English translation containing a domain', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', '京东页面上的标价是不计国补的。', 1, 'JD.com pages were not counted.'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['JD.com pages were not counted.']))
})

it('keeps both halves of an English translation visible in the same block', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  const translation = 'In addition, several models have prices before and after the national subsidy limits being very similar.'
  emit(caption('one', '另外还有几台机型，国补前后的价格非常接近。', 1, translation))
  await waitFor(() => expect(entries(container, 'translation')).toEqual([translation]))
})

it('keeps one entry per segment and extends it in place', () => {
  const { container, rerender } = render(<CaptionTrack line={null} kind="source" maxLines={2} layout="sentence" />)
  expect(container.querySelectorAll('.overlay-track-entry')).toHaveLength(0)
  rerender(<CaptionTrack line={{ key: 'a', text: 'first' }} kind="source" maxLines={2} layout="sentence" />)
  rerender(<CaptionTrack line={{ key: 'a', text: 'first and second' }} kind="source" maxLines={2} layout="sentence" />)
  expect(container.querySelectorAll('.overlay-track-entry')).toHaveLength(1)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent('first and second')
  rerender(<CaptionTrack line={{ key: 'b', text: 'third' }} kind="source" maxLines={2} layout="sentence" />)
  expect([...container.querySelectorAll('.overlay-track-entry')].map((node) => node.textContent)).toEqual(['first and second', 'third'])
})

it('runs consecutive sentences together in the rolling layout', () => {
  const { container, rerender } = render(<CaptionTrack line={null} kind="source" maxLines={2} layout="rolling" />)
  rerender(<CaptionTrack line={{ key: 'a', text: 'First sentence.' }} kind="source" maxLines={2} layout="rolling" />)
  rerender(<CaptionTrack line={{ key: 'b', text: 'Second sentence.' }} kind="source" maxLines={2} layout="rolling" />)
  // One paragraph, not two blocks: the reference stream never breaks on a sentence boundary.
  expect(container.querySelectorAll('.overlay-track-entry')).toHaveLength(1)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent('First sentence. Second sentence.')
})

it('joins CJK sentences without inserting a space', () => {
  const { container, rerender } = render(<CaptionTrack line={{ key: 'a', text: '第一句。' }} kind="translation" maxLines={2} layout="rolling" />)
  rerender(<CaptionTrack line={{ key: 'b', text: '第二句。' }} kind="translation" maxLines={2} layout="rolling" />)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent('第一句。第二句。')
})

it('replaces the sentence when a new segment revises what is already on screen', () => {
  const first = 'Analyst：Just shut yourself up and make money, but now is not the time to argue about this. Some people say this is you.'
  const second = 'Analyst：Just shut yourself up and make money is enough, but now is not the time to argue about this. Some people say, this is exactly what you are.'
  const { container, rerender } = render(<CaptionTrack line={{ key: 'a', text: first }} kind="translation" maxLines={4} layout="rolling" />)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent(first)

  // A revision of the same sentence arrives under a new segment id: swap it in, never stack it.
  rerender(<CaptionTrack line={{ key: 'b', text: second }} kind="translation" maxLines={4} layout="rolling" />)
  expect(container.querySelectorAll('.overlay-track-entry')).toHaveLength(1)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent(second)
})

it('appends a genuinely new sentence after what is on screen', () => {
  const { container, rerender } = render(<CaptionTrack line={{ key: 'a', text: 'Take a break.' }} kind="source" maxLines={4} layout="rolling" />)
  rerender(<CaptionTrack line={{ key: 'b', text: 'Busy days make us forget to stop.' }} kind="source" maxLines={4} layout="rolling" />)
  expect(container.querySelectorAll('.overlay-track-entry')).toHaveLength(1)
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent('Take a break. Busy days make us forget to stop.')
})

it('appends only the part of a new sentence that is not already on screen', () => {
  const { container, rerender } = render(<CaptionTrack line={{ key: 'a', text: 'Take a break.' }} kind="source" maxLines={4} layout="rolling" />)
  rerender(<CaptionTrack line={{ key: 'b', text: 'Take a break. Busy days make us forget to stop.' }} kind="source" maxLines={4} layout="rolling" />)
  // The seam is stated twice otherwise, which is what used to read as a duplicated result.
  expect(container.querySelector('.overlay-track-entry')).toHaveTextContent('Take a break. Busy days make us forget to stop.')
})

it('keeps the source in its own slot while a pending translation arrives', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'Source only', 1))
  const source = container.querySelector('.caption-console-stage > .overlay-track-source')
  expect(source).not.toBeNull()
  expect(entries(container, 'translation')).toEqual([])
  emit(caption('one', 'Source only', 2, '译文'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['译文']))
  expect(container.querySelector('.caption-console-stage > .overlay-track-source')).toBe(source)
})

it('keeps the translation on screen when a later segment carries none', async () => {
  const { emit } = listen()
  const { container } = render(<CaptionOverlay />)
  emit(caption('one', 'Take a break.', 1, '休息一下。'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['休息一下。']))
  const track = container.querySelector('.overlay-track-translation')

  // Pausing the audio produces an intermediate that carries no translation at all.
  emit({
    protocolVersion: 1, type: 'caption', requestId: 'two-1', sessionId: 'session-live',
    segment: {
      segmentId: 'two', revision: 1, startedAtMs: 2000, sourceText: 'Busy days make us forget to stop.', isFinal: false,
      translations: [],
    },
  })

  // The track stays mounted with its transcript: an untranslated segment must not blank the history.
  expect(container.querySelector('.overlay-track-translation')).toBe(track)
  expect(entries(container, 'translation')).toEqual(['休息一下。'])
  expect(entries(container, 'source')).toEqual(['Take a break. Busy days make us forget to stop.'])

  emit(caption('two', 'Busy days make us forget to stop.', 2, '忙碌的日子让我们忘记停下。'))
  await waitFor(() => expect(entries(container, 'translation')).toEqual(['休息一下。忙碌的日子让我们忘记停下。']))
  expect(container.querySelector('.overlay-track-translation')).toBe(track)
})

it('hides a track entirely when the user turns it off', async () => {
  const { emit } = listen()
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay, showTranslation: false },
  })
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console-translations')).toBeNull())
  emit(caption('one', 'Source only', 1))
  expect(entries(container, 'source')).toEqual(['Source only'])
  expect(container.querySelector('.caption-console-translations')).toBeNull()
})

it('reveals the control rows from a pointer anywhere on the card, not just over a button', () => {
  const { container } = render(<CaptionOverlay />)
  const card = container.querySelector('.caption-console') as HTMLElement
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 200, width: 800, height: 200, toJSON: () => ({}),
  })
  const pointerAt = (x: number, y: number): void => {
    act(() => { fireEvent(window, new MouseEvent('mousemove', { clientX: x, clientY: y })) })
  }
  expect(card).toHaveAttribute('data-hover', 'false')

  // A corner of the card that no control overlaps, which is the case enter/leave used to miss.
  pointerAt(4, 196)
  expect(card).toHaveAttribute('data-hover', 'true')
  pointerAt(600, 100)
  expect(card).toHaveAttribute('data-hover', 'true')

  act(() => { fireEvent(document, new MouseEvent('mouseleave')) })
  expect(card).toHaveAttribute('data-hover', 'false')

  pointerAt(840, 4)
  expect(card).toHaveAttribute('data-hover', 'false')
})

it('cycles bilingual, source only and translation only from one pill', async () => {
  const api = window.nolaTranslator!
  let current: AppSettings = { ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay } }
  vi.spyOn(api, 'getSettings').mockImplementation(async () => current)
  vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => {
    current = {
      ...current, ...patch,
      recognition: { ...current.recognition, ...patch.recognition },
      overlay: { ...current.overlay, ...patch.overlay },
      translation: { ...current.translation, ...patch.translation },
    }
    return current
  })
  const { container } = render(<CaptionOverlay />)
  const pill = (): HTMLButtonElement =>
    container.querySelector('[data-caption-display-toggle]') as HTMLButtonElement

  expect(pill()).toHaveTextContent('双语')
  fireEvent.click(pill())
  await waitFor(() => expect(pill()).toHaveTextContent('原文'))
  expect(container.querySelector('.caption-console-translations')).toBeNull()

  fireEvent.click(pill())
  await waitFor(() => expect(pill()).toHaveTextContent('译文'))
  expect(container.querySelector('.caption-console-stage > .overlay-track-source')).toBeNull()

  fireEvent.click(pill())
  await waitFor(() => expect(pill()).toHaveTextContent('双语'))
  expect(current.overlay.showSource).toBe(true)
  expect(current.overlay.showTranslation).toBe(true)
})

it('starts and stops a session from the mic button', async () => {
  const api = window.nolaTranslator!
  const start = vi.spyOn(api, 'startSession').mockResolvedValue({ sessionId: 'session-live' })
  const stop = vi.spyOn(api, 'stopSession').mockResolvedValue(undefined)
  const { container } = render(<CaptionOverlay />)
  const mic = container.querySelector('.caption-mic') as HTMLButtonElement
  expect(mic).toHaveAttribute('aria-label', '开始字幕')

  fireEvent.click(mic)
  await waitFor(() => expect(start).toHaveBeenCalledOnce())
  expect(start.mock.calls[0][0]).toMatchObject({ sourceLanguage: 'auto', targetLanguages: ['zh'], audioSource: { kind: 'defaultOutput' } })
  await waitFor(() => expect(container.querySelector('.caption-mic')).toHaveAttribute('aria-label', '停止字幕'))

  fireEvent.click(container.querySelector('.caption-mic')!)
  await waitFor(() => expect(stop).toHaveBeenCalledWith('session-live'))
})

it('sends a missing model to the resource page instead of starting a doomed session', async () => {
  const api = window.nolaTranslator!
  vi.spyOn(api, 'listResources').mockResolvedValue({ storagePath: '', resources: [] })
  const start = vi.spyOn(api, 'startSession')
  const appearance = vi.spyOn(api, 'openAppearance')
  const { container } = render(<CaptionOverlay />)
  fireEvent.click(container.querySelector('.caption-mic')!)
  await waitFor(() => expect(appearance).toHaveBeenCalledWith('resources'))
  expect(start).not.toHaveBeenCalled()
  expect(container.querySelector('.caption-console-notice')).toHaveTextContent('模型尚未安装')
})

it('opens the matching settings page from the model and language pills', async () => {
  const appearance = vi.spyOn(window.nolaTranslator!, 'openAppearance')
  const { container } = render(<CaptionOverlay />)
  const [, model, language] = [...container.querySelectorAll('.caption-console-controls button')]

  expect(model).toHaveTextContent('Hy-MT2')
  expect(language).toHaveTextContent('自动 → 中')
  fireEvent.click(model)
  expect(appearance).toHaveBeenCalledWith('translation')
  fireEvent.click(language)
  expect(appearance).toHaveBeenCalledWith('captions')
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
  expect(appearance).toHaveBeenCalledWith('appearance')
  expect(screen.getByRole('button', { name: '始终置顶' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '解锁位置' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ overlay: { mode: 'free', locked: false } }))
  fireEvent.click(screen.getByRole('button', { name: '隐藏浮层' }))
  expect(hide).toHaveBeenCalledOnce()
})

it('applies separate typography and a fully transparent background', async () => {
  vi.spyOn(window.nolaTranslator!, 'getSettings').mockResolvedValue({
    ...DEFAULT_SETTINGS,
    overlay: { ...DEFAULT_SETTINGS.overlay, backgroundOpacity: 0, translationFontSize: 31 },
  })
  const { container } = render(<CaptionOverlay />)
  await waitFor(() => expect(container.querySelector('.caption-console')).toHaveAttribute('data-transparent-background', 'true'))
  const style = (container.querySelector('.caption-console') as HTMLElement).style
  expect(style.getPropertyValue('--overlay-translation-font-size')).toBe('31px')
})
