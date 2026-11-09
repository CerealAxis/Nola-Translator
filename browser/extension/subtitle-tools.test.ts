import { DEFAULT_PREFERENCES } from './preferences'
import { afterEach, expect, it, vi } from 'vitest'
import { cuesToSrt, createSubtitleTranslation, cueBatches } from './subtitle-translation'
import { TRACK_CHANGED, TRACK_REQUEST, TRACK_RESPONSE, TRACK_RESTORE, parseTimedText, observedSubtitleUrl } from './site-tracks'
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

function captionVideo(count: number) {
  const video = document.createElement('video')
  const track = Object.assign(new EventTarget(), { kind: 'subtitles', label: 'English', language: 'en', mode: 'showing', cues: Array.from({ length: count }, (_, index) => ({ startTime: index * 100, endTime: index * 100 + 5, text: `Sentence ${index}` })) })
  Object.defineProperty(video, 'textTracks', { value: [track] })
  return video
}

it('pretranslates the whole track before playback requests a caption and retains translations beyond 512 entries', async () => {
  const translate = vi.fn(async (text: string) => `Translated ${text}`)
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  subtitles.configure(DEFAULT_PREFERENCES)
  subtitles.selectVideo(captionVideo(520), false)
  await subtitles.start()
  await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(520))
  await vi.waitFor(() => expect(subtitles.at(51900)?.translation).toBe('Translated Sentence 519'))
  expect(subtitles.at(1)?.translation).toBe('Translated Sentence 0')
  expect(translate).toHaveBeenCalledTimes(520)
  subtitles.destroy()
})

it('limits pretranslation concurrency, reprioritizes on seek and ignores canceled results', async () => {
  const jobs: { text: string; signal: AbortSignal; resolve(value: string): void }[] = []
  const translate = vi.fn((text: string, _source: string, _target: string, _lane: string, signal: AbortSignal) => new Promise<string>(resolve => { jobs.push({ text, signal, resolve }) }))
  const video = captionVideo(12)
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  subtitles.configure(DEFAULT_PREFERENCES); subtitles.selectVideo(video, false)
  await subtitles.start()
  expect(jobs.map(job => job.text)).toEqual(['Sentence 0', 'Sentence 1', 'Sentence 2'])
  video.currentTime = 800; video.dispatchEvent(new Event('seeking'))
  expect(jobs.slice(0, 3).every(job => job.signal.aborted)).toBe(true)
  expect(jobs.slice(3).map(job => job.text)).toEqual(['Sentence 8', 'Sentence 9', 'Sentence 10'])
  jobs[0].resolve('Stale result')
  await Promise.resolve()
  expect(subtitles.at(1)?.translation).toBeUndefined()
  subtitles.stop()
  expect(jobs.every(job => job.signal.aborted)).toBe(true)
  for (const job of jobs) job.resolve('Stopped')
  await Promise.resolve()
  expect(translate).toHaveBeenCalledTimes(6)
})

it('moves expired queued cues behind playback and continues after an empty translation', async () => {
  const jobs: { text: string; resolve(value: string): void; reject(error: Error): void }[] = []
  const translate = vi.fn((text: string) => new Promise<string>((resolve, reject) => jobs.push({ text, resolve, reject })))
  const video = captionVideo(12)
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  try {
    subtitles.configure(DEFAULT_PREFERENCES); subtitles.selectVideo(video, false)
    await subtitles.start()
    video.currentTime = 800
    jobs[0].reject(new Error('providerEmpty'))
    await vi.waitFor(() => expect(jobs[3]?.text).toBe('Sentence 8'))
    jobs[3].resolve('Current translation')
    await vi.waitFor(() => expect(subtitles.at(800)?.translation).toBe('Current translation'))
  } finally { subtitles.destroy(); for (const job of jobs) job.resolve('Canceled') }
})

it('fills the desktop limit from the current cue as soon as it arrives', async () => {
  const jobs: string[] = []
  const translate = vi.fn((text: string, _source: string, _target: string, _lane: string, signal: AbortSignal) => new Promise<string>((_, reject) => {
    jobs.push(text)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const video = captionVideo(18)
  video.currentTime = 500
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  try {
    subtitles.setConcurrency(1)
    subtitles.configure(DEFAULT_PREFERENCES); subtitles.selectVideo(video, false)
    await subtitles.start()
    expect(jobs).toEqual(['Sentence 5'])
    subtitles.setConcurrency(10)
    expect(jobs).toEqual(Array.from({ length: 10 }, (_, index) => `Sentence ${index + 5}`))
  } finally { subtitles.destroy() }
})

it('starts pretranslation when leaving source-only mode and invalidates old translations on target changes', async () => {
  const translate = vi.fn(async (text: string, _source: string, target: string) => `${target}: ${text}`)
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  subtitles.configure({ ...DEFAULT_PREFERENCES, videoDisplay: 'source' }); subtitles.selectVideo(captionVideo(4), false)
  await subtitles.start()
  expect(translate).not.toHaveBeenCalled()
  subtitles.configure(DEFAULT_PREFERENCES)
  await vi.waitFor(() => expect(subtitles.at(1)?.translation).toBe('zh: Sentence 0'))
  subtitles.configure({ ...DEFAULT_PREFERENCES, videoLanguage: 'ja' })
  await vi.waitFor(() => expect(subtitles.at(1)?.translation).toBe('ja: Sentence 0'))
  subtitles.destroy()
})


const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren()
})
function nativeTrack(mode: TextTrackMode, language: string, text = language, kind: TextTrackKind = 'subtitles') {
  return Object.assign(new EventTarget(), { kind, label: language, language, mode, cues: [{ startTime: 0, endTime: 5, text }] })
}
function nativeVideo(initial: ReturnType<typeof nativeTrack>[]) {
  const tracks = [...initial]
  const list = Object.assign(new EventTarget(), { [Symbol.iterator]: () => tracks[Symbol.iterator](),
    add(track: ReturnType<typeof nativeTrack>, first = false) { if (first) tracks.unshift(track); else tracks.push(track); list.dispatchEvent(new Event('addtrack')) },
    remove(track: ReturnType<typeof nativeTrack>) { tracks.splice(tracks.indexOf(track), 1); list.dispatchEvent(new Event('removetrack')) },
  })
  const video = document.createElement('video'); document.body.append(video)
  Object.defineProperty(video, 'textTracks', { value: list })
  return { video, list }
}
function nativeController(translate = vi.fn(async (text: string) => `T ${text}`)) {
  const subtitles = createSubtitleTranslation({ translate, close: vi.fn() }, vi.fn())
  cleanups.push(() => subtitles.destroy())
  subtitles.configure(DEFAULT_PREFERENCES)
  return { subtitles, translate }
}
function trackMessages(reply: (id?: string) => unknown) {
  const listener = (event: Event) => {
    const { nonce, trackId } = JSON.parse((event as CustomEvent<string>).detail)
    document.dispatchEvent(new CustomEvent(TRACK_RESPONSE, { detail: JSON.stringify({ nonce, value: reply(trackId) }) }))
  }
  document.addEventListener(TRACK_REQUEST, listener)
  cleanups.push(() => document.removeEventListener(TRACK_REQUEST, listener))
}

it('keeps existing-subtitle translation unavailable until a track has readable cues', async () => {
  const track = nativeTrack('disabled', 'en')
  track.cues = []
  const { video } = nativeVideo([track])
  const { subtitles, translate } = nativeController()
  subtitles.selectVideo(video, true)
  vi.useFakeTimers()
  const check = subtitles.checkAvailability()
  expect(subtitles.state()).toMatchObject({ availability: 'checking', active: false })
  await vi.advanceTimersByTimeAsync(2100)
  await check
  expect(subtitles.state()).toMatchObject({ availability: 'unavailable', active: false })
  expect(track.mode).toBe('disabled')
  expect(translate).not.toHaveBeenCalled()

  track.cues = [{ startTime: 0, endTime: 5, text: 'Loaded captions' }]
  await subtitles.checkAvailability(true)
  expect(subtitles.state()).toMatchObject({ availability: 'ready', active: false })
  expect(track.mode).toBe('disabled')
  await subtitles.start()
  expect(translate).toHaveBeenCalledWith('Loaded captions', 'en', expect.any(String), 'video', expect.any(AbortSignal))
})

it('prefers the player’s showing source, then subtitles, and excludes Nola and metadata tracks', async () => {
  const first = nativeTrack('disabled', 'en')
  const showing = nativeTrack('showing', 'fr', 'French source', 'captions')
  const own = nativeTrack('showing', 'en'); own.label = 'Nola captions'
  const metadata = nativeTrack('showing', 'meta', 'Not a subtitle', 'metadata')
  const fixture = nativeVideo([first, showing, own, metadata])
  const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false); await subtitles.start()
  expect(subtitles.at(1)?.text).toBe('French source')
  expect(subtitles.state().tracks).toHaveLength(2)
  expect(own.mode).toBe('showing'); expect(metadata.mode).toBe('showing')
  subtitles.stop(); showing.mode = 'disabled'
  await subtitles.start()
  expect(subtitles.at(1)?.text).toBe('en')
})

it('suppresses every native caption and restores disabled, hidden and newer player mode choices', async () => {
  const disabled = nativeTrack('disabled', 'en')
  const showing = nativeTrack('showing', 'fr')
  const hidden = nativeTrack('hidden', 'de')
  const fixture = nativeVideo([disabled, showing, hidden]); const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false)
  await subtitles.start('local-0')
  expect([disabled.mode, showing.mode, hidden.mode]).toEqual(['hidden', 'hidden', 'hidden'])
  showing.mode = 'showing'; fixture.list.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(subtitles.at(1)?.text).toBe('fr'))
  expect(showing.mode).toBe('hidden')
  disabled.mode = 'showing'; fixture.list.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(subtitles.at(1)?.text).toBe('en'))
  expect(disabled.mode).toBe('hidden')
  subtitles.stop()
  expect([disabled.mode, showing.mode, hidden.mode]).toEqual(['showing', 'showing', 'hidden'])
})

it('waits for late native tracks and asynchronously loaded cues', async () => {
  vi.useFakeTimers()
  const track = nativeTrack('disabled', 'en'); track.cues = []
  const fixture = nativeVideo([]); const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false); const starting = subtitles.start()
  await vi.advanceTimersByTimeAsync(300)
  fixture.list.add(track)
  await vi.advanceTimersByTimeAsync(200)
  expect(track.mode).toBe('hidden')
  track.cues.push({ startTime: 0, endTime: 5, text: 'Loaded later' })
  fixture.video.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(100); await starting
  expect(subtitles.at(1)?.text).toBe('Loaded later')
  subtitles.stop(); expect(track.mode).toBe('disabled')
})

it('refreshes cue additions outside the active range and keeps stable menu identities', async () => {
  vi.useFakeTimers()
  const track = nativeTrack('showing', 'en')
  const fixture = nativeVideo([track]); const { subtitles, translate } = nativeController()
  subtitles.selectVideo(fixture.video, false); await subtitles.start()
  const id = subtitles.state().trackId
  const extra = nativeTrack('disabled', 'fr'); fixture.list.add(extra, true)
  expect(extra.mode).toBe('disabled')
  expect(subtitles.state().tracks.find(item => item.language === 'en')?.id).toBe(id)
  track.cues.push({ startTime: 100, endTime: 105, text: 'Future appended cue' })
  await vi.advanceTimersByTimeAsync(300)
  expect(subtitles.state().transcript?.map(cue => cue.text)).toContain('Future appended cue')
  expect(translate).toHaveBeenCalledWith('Future appended cue', 'en', 'zh', 'video', expect.any(AbortSignal))
})

it('reselects a remaining source when the selected track disappears', async () => {
  const selected = nativeTrack('showing', 'en')
  const remaining = nativeTrack('disabled', 'fr')
  const fixture = nativeVideo([selected, remaining]); const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false); await subtitles.start()
  const old = subtitles.state().trackId
  fixture.list.remove(selected)
  await vi.waitFor(() => expect(subtitles.at(1)?.text).toBe('fr'))
  expect(subtitles.state().trackId).not.toBe(old)
  expect(selected.mode).toBe('showing')
})

it('cancels loading and disconnects old-video cue updates when switching players', async () => {
  vi.useFakeTimers()
  const old = nativeTrack('disabled', 'en'); old.cues = []
  const first = nativeVideo([old]); const next = nativeVideo([nativeTrack('showing', 'fr')])
  const { subtitles } = nativeController()
  subtitles.selectVideo(first.video, false); const pending = subtitles.start()
  await vi.advanceTimersByTimeAsync(200)
  subtitles.selectVideo(next.video, false)
  await vi.advanceTimersByTimeAsync(200); await pending
  expect(old.mode).toBe('disabled')
  expect(subtitles.at(1)?.text).toBe('fr')
  old.cues.push({ startTime: 0, endTime: 5, text: 'Stale old video' }); old.dispatchEvent(new Event('cuechange'))
  await vi.advanceTimersByTimeAsync(9000)
  expect(subtitles.at(1)?.text).toBe('fr'); expect(subtitles.state().error).toBeUndefined()
})

it('fails a bounded cue wait and releases the loading mode', async () => {
  vi.useFakeTimers()
  const track = nativeTrack('disabled', 'en'); track.cues = []
  const fixture = nativeVideo([track]); const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false); const starting = subtitles.start()
  await vi.advanceTimersByTimeAsync(8100); await starting
  expect(subtitles.state()).toMatchObject({ active: false, error: 'browserSubtitleReadFailed' })
  expect(track.mode).toBe('disabled')
})

it('cleans cue tags and entities without rendering HTML and sorts their timings', async () => {
  const track = nativeTrack('showing', 'en')
  track.cues = [{ startTime: 4, endTime: 5, text: 'Later' }, { startTime: 0, endTime: 3, text: '<v Bob> Hello &amp; <b>world</b>\n &lt;tag&gt; </v>' }, { startTime: 8, endTime: 7, text: 'Invalid' }]
  const fixture = nativeVideo([track]); const { subtitles } = nativeController()
  subtitles.selectVideo(fixture.video, false); await subtitles.start()
  expect(subtitles.state().transcript).toEqual([{ start: 0, end: 3, text: 'Hello & world\n<tag>' }, { start: 4, end: 5, text: 'Later' }])
})

it('ignores late export translations after cancellation', async () => {
  let finish!: (text: string) => void
  const translate = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
  const fixture = nativeVideo([nativeTrack('showing', 'en')])
  const { subtitles } = nativeController(translate)
  subtitles.configure({ ...DEFAULT_PREFERENCES, videoDisplay: 'source' }); subtitles.selectVideo(fixture.video, false); await subtitles.start()
  const exported = subtitles.exportSrt(true)
  const rejection = expect(exported).rejects.toMatchObject({ name: 'AbortError' })
  subtitles.stop(); finish('Stale translated text'); await rejection
  expect(subtitles.state().transcript).toEqual([])
})

it('falls back to the native showing source when a requested platform track fails', async () => {
  vi.stubGlobal('location', { hostname: 'x.com' })
  const showing = nativeTrack('showing', 'fr')
  const fixture = nativeVideo([nativeTrack('disabled', 'en'), showing])
  trackMessages(id => id ? null : [{ id: 'remote', label: 'Remote', language: 'en' }])
  const { subtitles } = nativeController(); subtitles.selectVideo(fixture.video, false); await subtitles.start('remote')
  expect(subtitles.at(1)?.text).toBe('fr'); expect(subtitles.state().trackId).toBe('local-1')
})

it('restarts an active source on external track changes and restores Netflix only after ownership', async () => {
  vi.stubGlobal('location', { hostname: 'www.netflix.com' })
  const fixture = nativeVideo([])
  let text = 'First platform track'
  trackMessages(id => id ? [{ start: 0, end: 5, text }] : [{ id: 'remote', label: 'Remote', language: 'en' }])
  const restore = vi.fn(); document.addEventListener(TRACK_RESTORE, restore); cleanups.push(() => document.removeEventListener(TRACK_RESTORE, restore))
  const { subtitles } = nativeController(); subtitles.selectVideo(fixture.video, false); await subtitles.start()
  expect(subtitles.at(1)?.text).toBe('First platform track')
  text = 'New external selection'; document.dispatchEvent(new Event(TRACK_CHANGED))
  await vi.waitFor(() => expect(subtitles.at(1)?.text).toBe('New external selection'))
  expect(restore).toHaveBeenCalledTimes(1)
  subtitles.stop(); subtitles.stop(); expect(restore).toHaveBeenCalledTimes(2)
  subtitles.destroy(); document.dispatchEvent(new Event(TRACK_CHANGED)); expect(subtitles.state().active).toBe(false)
})


it.each(['change', 'poll'])('follows an external native source switch via %s and restores the latest selection', async trigger => {
  vi.useFakeTimers()
  const first = nativeTrack('showing', 'en', 'English source')
  const second = nativeTrack('disabled', 'fr', 'French source')
  const fixture = nativeVideo([first, second]); const { subtitles, translate } = nativeController()
  subtitles.selectVideo(fixture.video, false); await subtitles.start()
  const firstId = subtitles.state().trackId
  first.mode = 'disabled'; second.mode = 'showing'
  if (trigger === 'change') fixture.list.dispatchEvent(new Event('change'))
  await vi.advanceTimersByTimeAsync(300)
  expect(subtitles.state().trackId).not.toBe(firstId)
  expect(subtitles.at(1)?.text).toBe('French source')
  expect(subtitles.at(1)?.translation).toBe('T French source')
  expect(translate).toHaveBeenCalledWith('French source', 'fr', 'zh', 'video', expect.any(AbortSignal))
  expect(second.mode).toBe('hidden')
  subtitles.stop()
  expect(first.mode).toBe('disabled')
  expect(second.mode).toBe('showing')
})
