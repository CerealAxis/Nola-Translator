import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { CaptionSegment } from '../shared/contracts'

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

export class HistoryStore {
  private readonly segments = new Map<string, CaptionSegment>()
  private enabled = false

  constructor(private readonly path: string) {}

  async setEnabled(enabled: boolean): Promise<void> {
    const wasEnabled = this.enabled
    this.enabled = enabled
    if (!enabled) return
    await mkdir(dirname(this.path), { recursive: true })
    if (!wasEnabled && this.segments.size > 0) {
      const content = this.list().map((segment) => JSON.stringify(segment)).join('\n')
      await writeFile(this.path, `${content}\n`, 'utf8')
    }
  }

  async add(segment: CaptionSegment): Promise<void> {
    if (!segment.isFinal) return
    const existing = this.segments.get(segment.segmentId)
    if (existing && existing.revision > segment.revision) return
    this.segments.set(segment.segmentId, structuredClone(segment))
    if (this.enabled) await appendFile(this.path, `${JSON.stringify(segment)}\n`, 'utf8')
  }

  list(): CaptionSegment[] {
    return [...this.segments.values()].sort((left, right) => left.startedAtMs - right.startedAtMs)
  }

  async clear(): Promise<void> {
    this.segments.clear()
    if (this.enabled) await writeFile(this.path, '', 'utf8')
  }

  async restore(): Promise<void> {
    if (!this.enabled) return
    try {
      const content = await readFile(this.path, 'utf8')
      for (const line of content.split(/\r?\n/).filter(Boolean)) {
        const segment = JSON.parse(line) as CaptionSegment
        this.segments.set(segment.segmentId, segment)
      }
    } catch {
      // No history file, or a corrupt one, just means starting from an empty session.
    }
  }
}
