import type { Dirent } from 'node:fs'
import { appendFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { CaptionSegment, MeetingMeta } from '../shared/contracts'

const META_FILE = 'meeting.json'
const SEGMENTS_FILE = 'segments.jsonl'
const AUDIO_FILE = 'audio.wav'
const MIGRATION_MARKER = 'migrated-history-v1'
const WAV_HEADER_BYTES = 44
/** 16 kHz mono 16-bit PCM, the format audio/recorder.py writes. */
const WAV_BYTES_PER_SECOND = 32_000

function timestamp(milliseconds: number, decimal: ',' | '.'): string {
  const total = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${decimal}${millis.toString().padStart(3, '0')}`
}

function endTime(segments: CaptionSegment[], index: number): number {
  const segment = segments[index]
  if (segment.endedAtMs !== undefined) return segment.endedAtMs
  const next = segments[index + 1]
  return next ? Math.max(segment.startedAtMs, next.startedAtMs - 1) : segment.startedAtMs + 2000
}

function lines(segment: CaptionSegment): string[] {
  return [
    segment.sourceText,
    ...segment.translations.filter((item) => item.state === 'complete' && item.text).map((item) => item.text as string),
  ]
}

export function exportText(segments: CaptionSegment[]): string {
  return segments.map((segment) => lines(segment).join('\n')).join('\n\n')
}

export function exportSrt(segments: CaptionSegment[]): string {
  return segments.map((segment, index) => [
    index + 1,
    `${timestamp(segment.startedAtMs, ',')} --> ${timestamp(endTime(segments, index), ',')}`,
    ...lines(segment),
  ].join('\n')).join('\n\n')
}

export function exportWebVtt(segments: CaptionSegment[]): string {
  const cues = segments.map((segment, index) => [
    `${timestamp(segment.startedAtMs, '.')} --> ${timestamp(endTime(segments, index), '.')}`,
    ...lines(segment),
  ].join('\n')).join('\n\n')
  return `WEBVTT\n\n${cues}`
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function meetingIdFor(at: Date): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `${stamp}-${randomUUID().slice(0, 8)}`
}

function localDayKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function parseSegment(line: string): CaptionSegment | null {
  try {
    const value = JSON.parse(line) as Partial<CaptionSegment>
    if (typeof value?.segmentId !== 'string' || !value.segmentId) return null
    if (typeof value.startedAtMs !== 'number' || !Number.isFinite(value.startedAtMs)) return null
    if (typeof value.sourceText !== 'string') return null
    return {
      ...value,
      revision: typeof value.revision === 'number' ? value.revision : 0,
      isFinal: value.isFinal === true,
      translations: Array.isArray(value.translations) ? value.translations : [],
    } as CaptionSegment
  } catch {
    // A crash mid-append leaves one truncated line; skipping it keeps the rest of the meeting.
    return null
  }
}

function parseSegments(raw: string): CaptionSegment[] {
  const byId = new Map<string, CaptionSegment>()
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue
    const segment = parseSegment(line)
    if (!segment) continue
    const existing = byId.get(segment.segmentId)
    if (existing && existing.revision > segment.revision) continue
    byId.set(segment.segmentId, segment)
  }
  return [...byId.values()].sort((left, right) => left.startedAtMs - right.startedAtMs)
}

async function writeMeta(directory: string, meta: MeetingMeta): Promise<void> {
  const target = join(directory, META_FILE)
  const temporary = `${target}.tmp`
  await writeFile(temporary, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  await rename(temporary, target)
}

export class MeetingStore {
  private readonly cache = new Map<string, MeetingMeta>()
  private readonly queues = new Map<string, Promise<unknown>>()
  /** sessionId -> meetingId, for meetings still recording. */
  private readonly open = new Map<string, string>()

  constructor(private readonly root: string) {}

  private directory(meetingId: string): string {
    return join(this.root, meetingId)
  }

  /** One writer per meeting: caption finals arrive several per second and must not interleave. */
  private serialize<T>(meetingId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(meetingId) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(meetingId, next.catch(() => undefined))
    return next
  }

  async initialize(legacyHistoryPath: string): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.loadAll()
    await this.migrateLegacyHistory(legacyHistoryPath)
  }

  private async loadAll(): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(this.root, { withFileTypes: true })
    } catch {
      return
    }
    const metas = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const raw = await readFile(join(this.root, String(entry.name), META_FILE), 'utf8')
            const meta = JSON.parse(raw) as MeetingMeta
            return typeof meta?.meetingId === 'string' ? meta : null
          } catch {
            return null
          }
        }),
    )
    this.cache.clear()
    for (const meta of metas) if (meta) this.cache.set(meta.meetingId, meta)
    await this.reconcileInterrupted()
  }

  /**
   * `loadAll` runs once per process at startup, so a meta still reading `running` belongs to a
   * session the previous process died with: left alone it keeps no `endedAtMs` and the list shows
   * it in progress forever, and `open` is in-memory only, so no later `finish` can repair it.
   * Only running -> interrupted is written; completed records stay untouched on disk.
   */
  private async reconcileInterrupted(): Promise<void> {
    for (const meta of [...this.cache.values()]) {
      const state = meta.state ?? (meta.endedAtMs === undefined ? 'running' : 'completed')
      if (state !== 'running') continue
      const next: MeetingMeta = { ...meta, state: 'interrupted' }
      this.cache.set(meta.meetingId, next)
      try {
        await this.serialize(meta.meetingId, () => writeMeta(this.directory(meta.meetingId), next))
      } catch (error) {
        // The in-memory entry is already correct, so a read-only directory only costs a stale file.
        console.error('meeting interrupted rewrite failed', error)
      }
    }
  }

  private async migrateLegacyHistory(legacyPath: string): Promise<void> {
    if (this.cache.size > 0) return
    const marker = join(this.root, MIGRATION_MARKER)
    try {
      await stat(marker)
      return
    } catch {
      // No marker yet, so the flat legacy history may still be waiting to be imported.
    }
    let raw: string
    try {
      raw = await readFile(legacyPath, 'utf8')
    } catch {
      return
    }
    const segments = parseSegments(raw).filter((segment) => segment.isFinal)
    await writeFile(marker, new Date().toISOString(), 'utf8')
    if (segments.length === 0) return
    const startedAtMs = Date.now()
    const meetingId = `legacy-${meetingIdFor(new Date(startedAtMs))}`
    const first = segments[0]
    const last = segments[segments.length - 1]
    const contentStartedAtMs = first.startedAtMs
    const contentEndedAtMs = last.endedAtMs ?? last.startedAtMs
    const meta: MeetingMeta = {
      meetingId,
      title: '',
      titleIsCustom: false,
      startedAtMs,
      endedAtMs: startedAtMs + contentEndedAtMs,
      // Same measure as a live recording: content span, not wall-clock.
      durationMs: Math.max(0, contentEndedAtMs - contentStartedAtMs),
      daySequence: 0,
      segmentCount: segments.length,
      sourceLanguage: segments.find((segment) => segment.sourceLanguage)?.sourceLanguage ?? 'auto',
      targetLanguage: segments[0].translations[0]?.targetLanguage ?? 'zh',
      contentStartedAtMs,
      contentEndedAtMs,
    }
    const directory = this.directory(meetingId)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, SEGMENTS_FILE), segments.map((segment) => JSON.stringify(segment)).join('\n') + '\n', 'utf8')
    await writeMeta(directory, meta)
    this.cache.set(meetingId, meta)
  }

  private nextDaySequence(at: number): number {
    const day = localDayKey(at)
    return [...this.cache.values()].filter((meta) => localDayKey(meta.startedAtMs) === day).length
  }

  recordingPathFor(meetingId: string): string {
    return join(this.directory(meetingId), AUDIO_FILE)
  }

  /** Resolves a meeting id that arrived from a renderer-controlled URL; traversal is rejected here. */
  audioPathFor(meetingId: string): string | null {
    if (!/^[0-9A-Za-z-]{1,64}$/.test(meetingId)) return null
    const meta = this.cache.get(meetingId)
    if (!meta?.audioFile) return null
    return join(this.directory(meetingId), meta.audioFile)
  }

  async begin(input: {
    sourceLanguage: string
    targetLanguage: string
    recordAudio: boolean
  }): Promise<MeetingMeta> {
    const startedAtMs = Date.now()
    const meetingId = meetingIdFor(new Date(startedAtMs))
    const meta: MeetingMeta = {
      meetingId,
      title: '',
      titleIsCustom: false,
      startedAtMs,
      state: 'running',
      durationMs: 0,
      daySequence: this.nextDaySequence(startedAtMs),
      segmentCount: 0,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      ...(input.recordAudio ? { audioFile: AUDIO_FILE } : {}),
    }
    await this.serialize(meetingId, async () => {
      await mkdir(this.directory(meetingId), { recursive: true })
      await writeMeta(this.directory(meetingId), meta)
    })
    this.cache.set(meetingId, meta)
    return meta
  }

  /** The engine names the session, so a meeting only becomes "recording" once the start succeeded. */
  attach(meetingId: string, sessionId: string): void {
    this.open.set(sessionId, meetingId)
  }

  async append(sessionId: string, segment: CaptionSegment): Promise<void> {
    if (!segment.isFinal) return
    const meetingId = this.open.get(sessionId)
    if (!meetingId) return
    await this.serialize(meetingId, async () => {
      await appendFile(join(this.directory(meetingId), SEGMENTS_FILE), `${JSON.stringify(segment)}\n`, 'utf8')
    })
    const meta = this.cache.get(meetingId)
    if (meta) {
      /*
       * The content interval covers confirmed segments only, the same batch written to
       * `segments.jsonl`, so duration and captions describe one span. Audio t=0 is when capture
       * produced its first frame; the player aligns captions through `contentStartedAtMs`.
       */
      const end = segment.endedAtMs ?? segment.startedAtMs
      this.cache.set(meetingId, {
        ...meta,
        segmentCount: meta.segmentCount + 1,
        contentStartedAtMs: meta.contentStartedAtMs === undefined
          ? segment.startedAtMs
          : Math.min(meta.contentStartedAtMs, segment.startedAtMs),
        contentEndedAtMs: meta.contentEndedAtMs === undefined
          ? end
          : Math.max(meta.contentEndedAtMs, end),
      })
    }
  }

  async finish(sessionId: string): Promise<MeetingMeta | null> {
    const meetingId = this.open.get(sessionId)
    if (!meetingId) return null
    this.open.delete(sessionId)
    return this.serialize(meetingId, async () => {
      const meta = this.cache.get(meetingId)
      if (!meta) return null
      const audio = await this.resolveAudio(meta)
      /*
       * Both the end instant and the duration come from the content span, never from the wall
       * clock at finalize time. Pausing stops the capture and shifts the engine's caption clock
       * forward, so neither the audio nor the content span contains the paused time: four minutes
       * paused and then ninety minutes of speech is a ninety-minute meeting.
       *
       * With no segments at all: the audio length if there is audio, the wall clock otherwise —
       * a slightly long number beats showing 00:00 as if the recording were broken.
       */
      const started = meta.contentStartedAtMs
      const ended = meta.contentEndedAtMs
      const endedAtMs = ended === undefined ? Date.now() : meta.startedAtMs + ended
      const durationMs = started !== undefined && ended !== undefined
        ? ended - started
        : audio.audioDurationMs ?? Math.max(0, Date.now() - meta.startedAtMs)
      const next: MeetingMeta = {
        ...meta,
        endedAtMs,
        state: 'completed',
        durationMs: Math.max(0, durationMs),
        ...audio,
      }
      await writeMeta(this.directory(meetingId), next)
      this.cache.set(meetingId, next)
      return next
    })
  }

  /** Called when the engine never started the session: `begin()` already wrote the meeting, so remove it rather than list an empty one. */
  async abandon(meetingId: string): Promise<void> {
    for (const [sessionId, value] of [...this.open]) if (value === meetingId) this.open.delete(sessionId)
    await this.serialize(meetingId, async () => {
      this.cache.delete(meetingId)
      await rm(this.directory(meetingId), { recursive: true, force: true })
    })
  }

  /** Trust the WAV header, not the file size: the engine writes zero lengths up front and patches them only on close, so a killed engine leaves a data chunk of length 0. */
  private async resolveAudio(
    meta: MeetingMeta,
  ): Promise<{ audioFile?: string; audioDurationMs?: number }> {
    if (!meta.audioFile) return { audioFile: undefined, audioDurationMs: undefined }
    const path = join(this.directory(meta.meetingId), meta.audioFile)
    try {
      const handle = await open(path, 'r')
      try {
        const header = Buffer.alloc(WAV_HEADER_BYTES)
        await handle.read(header, 0, WAV_HEADER_BYTES, 0)
        if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
          return { audioFile: undefined, audioDurationMs: undefined }
        }
        const dataBytes = header.readUInt32LE(40)
        if (dataBytes === 0) return { audioFile: undefined, audioDurationMs: undefined }
        return { audioFile: meta.audioFile, audioDurationMs: Math.round((dataBytes / WAV_BYTES_PER_SECOND) * 1000) }
      } finally {
        await handle.close()
      }
    } catch {
      return { audioFile: undefined, audioDurationMs: undefined }
    }
  }

  list(): MeetingMeta[] {
    return [...this.cache.values()].sort((left, right) => right.startedAtMs - left.startedAtMs)
  }

  get(meetingId: string): MeetingMeta | null {
    return this.cache.get(meetingId) ?? null
  }

  async segments(meetingId: string): Promise<CaptionSegment[]> {
    try {
      return parseSegments(await readFile(join(this.directory(meetingId), SEGMENTS_FILE), 'utf8'))
    } catch {
      return []
    }
  }

  async rename(meetingId: string, title: string): Promise<MeetingMeta | null> {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('会议名称不能为空')
    return this.serialize(meetingId, async () => {
      const meta = this.cache.get(meetingId)
      if (!meta) return null
      const next: MeetingMeta = { ...meta, title: trimmed.slice(0, 120), titleIsCustom: true }
      await writeMeta(this.directory(meetingId), next)
      this.cache.set(meetingId, next)
      return next
    })
  }

  async setNotes(meetingId: string, notes: string): Promise<MeetingMeta | null> {
    const value = notes.trim() ? notes : undefined
    return this.serialize(meetingId, async () => {
      const meta = this.cache.get(meetingId)
      if (!meta) return null
      const next: MeetingMeta = { ...meta, notes: value }
      await writeMeta(this.directory(meetingId), next)
      this.cache.set(meetingId, next)
      return next
    })
  }

  async remove(meetingId: string): Promise<void> {
    this.open.delete([...this.open.entries()].find(([, value]) => value === meetingId)?.[0] ?? '')
    await this.serialize(meetingId, async () => {
      this.cache.delete(meetingId)
      await rm(this.directory(meetingId), { recursive: true, force: true })
    })
  }
}

export const MEETING_AUDIO_FILE = AUDIO_FILE
export const MEETING_SEGMENTS_FILE = SEGMENTS_FILE
