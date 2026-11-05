import { DEFAULT_PREFERENCES } from './preferences'
import { expect, it, vi } from 'vitest'
import { cuesToSrt, createSubtitleTranslation, cueBatches } from './subtitle-translation'
import { parseTimedText, observedSubtitleUrl } from './site-tracks'
vi.mock('./provider-client', () => ({ generate: vi.fn() }))
it('exports millisecond subtitle timestamps', () => {
  expect(cuesToSrt([{ start: 65.123, end: 66.9, text: 'Hello' }])).toBe('1\n00:01:05,123 --> 00:01:06,900\nHello\n')
})
it('parses VTT and TTML without rendering markup', () => {
  expect(parseTimedText('WEBVTT\n\n1\n00:00:01.200 --> 00:00:03.000 align:start\n<b>Hello</b>')[0]).toEqual({ start: 1.2, end: 3, text: 'Hello' })
  expect(parseTimedText('<tt><body><p begin="1s" end="2s">Hello</p></body></tt>')[0]).toEqual({ start: 1, end: 2, text: 'Hello' })
})
it('rejects untrusted observed resources', () => {
  expect(() => observedSubtitleUrl('https://evil.example/sub.vtt', 'x')).toThrow()
  expect(() => observedSubtitleUrl('https://video.twimg.com/sub.vtt', 'x')).not.toThrow()
})

it('applies HLS VTT MPEG timestamp mapping', () => {
  expect(parseTimedText('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00:01.000 --> 00:00:02.000\nCaption')[0]).toEqual({ start: 11, end: 12, text: 'Caption' })
})

it('keeps source-only captions local and restores native caption visibility on stop', async () => {
  const video = document.createElement('video')
  const track = Object.assign(new EventTarget(), { kind: 'subtitles', label: 'English', language: 'en', mode: 'showing', cues: [{ startTime: 0, endTime: 5, text: 'Original sentence.' }] })
  Object.defineProperty(video, 'textTracks', { value: [track] })
  const translate = vi.fn(async () => 'Translated sentence.')
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  subtitles.configure({ ...DEFAULT_PREFERENCES, videoDisplay: 'source' })
  subtitles.selectVideo(video, false)
  await subtitles.start()
  expect(track.mode).toBe('hidden')
  expect(subtitles.at(1)?.lines).toEqual(['Original sentence.'])
  expect(translate).not.toHaveBeenCalled()
  expect(await subtitles.exportSrt()).toContain('Original sentence.')
  expect(document.querySelector('[data-nola-extension="native-caption-suppression"]')).not.toBeNull()
  subtitles.destroy()
  expect(track.mode).toBe('showing')
  expect(document.querySelector('[data-nola-extension="native-caption-suppression"]')).toBeNull()
})

it('batches long transcripts without cutting cues or losing text', () => {
  const cues = Array.from({ length: 15 }, (_, index) => ({ start: index, end: index + 1, text: 'x'.repeat(2000) }))
  const batches = cueBatches(cues)
  expect(batches.length).toBeGreaterThan(1)
  expect(batches.flat()).toEqual(cues)
  expect(batches.every(batch => JSON.stringify(batch).length <= 12000)).toBe(true)
})
