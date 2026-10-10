import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CaptionSegment } from '../../../src/shared/contracts'
import { MEETING_AUDIO_FILE, MEETING_SEGMENTS_FILE, MeetingStore } from '../../../src/main/meeting-store'

function segment(id: string, startedAtMs: number, text: string, isFinal = true): CaptionSegment {
  return {
    segmentId: id,
    revision: 1,
    startedAtMs,
    sourceText: text,
    isFinal,
    translations: [{ targetLanguage: 'zh', text: `${text}-译`, state: 'complete', provider: 'hymt2' }],
  }
}

/** 44-byte canonical header, matching audio/recorder.py. */
function wavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16_000, 24)
  header.writeUInt32LE(32_000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

describe('MeetingStore', () => {
  let root = ''
  let store: MeetingStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nola-meetings-'))
    store = new MeetingStore(join(root, 'meetings'))
    await store.initialize(join(root, 'history.jsonl'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('一次字幕会话就是一次会议: begin/attach/append/finish 后元数据自洽', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    expect(meeting.endedAtMs).toBeUndefined()
    expect(meeting.segmentCount).toBe(0)
    expect(meeting.audioFile).toBe(MEETING_AUDIO_FILE)

    store.attach(meeting.meetingId, 'session-1')
    await store.append('session-1', segment('a', 0, 'hello'))
    await store.append('session-1', segment('b', 1500, 'world'))
    expect(store.get(meeting.meetingId)?.segmentCount).toBe(2)

    const finished = await store.finish('session-1')
    expect(finished?.endedAtMs).toBeGreaterThanOrEqual(finished?.startedAtMs ?? 0)

    const stored = await store.segments(meeting.meetingId)
    expect(stored.map((item) => item.sourceText)).toEqual(['hello', 'world'])
  })

  it('persists source and completed translation without storing every streamed revision', async () => {
    const meeting = await store.begin({ sourceLanguage: 'en', targetLanguage: 'zh', recordAudio: false })
    store.attach(meeting.meetingId, 'stream-session')
    const base = segment('stream', 0, 'hello')
    const updates = Array.from({ length: 20 }, (_, index): CaptionSegment => ({ ...base, revision: index + 1,
      translations: [{ targetLanguage: 'zh', state: 'pending', provider: 'cloud', text: `partial-${index}` }],
    }))
    await Promise.all(updates.map(update => store.append('stream-session', update)))
    await store.append('stream-session', { ...base, revision: 21 })
    await store.append('stream-session', { ...updates[0], revision: 2 })
    expect(store.get(meeting.meetingId)?.segmentCount).toBe(1)
    const rows = (await readFile(join(root, 'meetings', meeting.meetingId, MEETING_SEGMENTS_FILE), 'utf8')).trim().split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).not.toContain('partial-')
    expect((await store.segments(meeting.meetingId))[0].translations[0].text).toBe('hello-译')
    await store.finish('stream-session')
  })

  it('中间结果不落盘, 未 attach 的会话写入被丢弃', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    await store.append('session-x', segment('a', 0, 'orphan'))
    store.attach(meeting.meetingId, 'session-1')
    await store.append('session-1', segment('b', 0, 'partial', false))
    expect(await store.segments(meeting.meetingId)).toEqual([])
    expect(store.get(meeting.meetingId)?.segmentCount).toBe(0)
  })

  it('重启后按 sessionId 找回会议, 崩溃残留的孤儿会议不受影响', async () => {
    const first = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(first.meetingId, 'session-a')
    await store.append('session-a', segment('a', 0, 'kept'))
    await store.finish('session-a')
    const second = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(second.meetingId, 'session-b')

    const reopened = new MeetingStore(join(root, 'meetings'))
    await reopened.initialize(join(root, 'history.jsonl'))
    expect((await reopened.segments(first.meetingId)).map((item) => item.sourceText)).toEqual(['kept'])
    // A crashed engine sends no sessionStopped, so an unfinished meeting survives a restart.
    expect(reopened.get(second.meetingId)?.endedAtMs).toBeUndefined()
  })

  it('同一天的会议按 _1/_2 递增, 不同天重新从 0 开始', async () => {
    const store2 = new MeetingStore(join(root, 'seq'))
    await store2.initialize(join(root, 'history.jsonl'))
    const fakeNow = vi.spyOn(Date, 'now')
    fakeNow.mockReturnValue(new Date(2026, 8, 29, 22, 50, 0).getTime())
    expect((await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })).daySequence).toBe(0)
    expect((await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })).daySequence).toBe(1)
    fakeNow.mockRestore()
  })

  it('跨天后序号重新从 0 开始', async () => {
    const store2 = new MeetingStore(join(root, 'seq2'))
    await store2.initialize(join(root, 'history.jsonl'))
    const fakeNow = vi.spyOn(Date, 'now')
    fakeNow.mockReturnValue(new Date(2026, 8, 29, 22, 50, 0).getTime())
    await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    expect((await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })).daySequence).toBe(2)
    fakeNow.mockReturnValue(new Date(2026, 8, 30, 9, 0, 0).getTime())
    expect((await store2.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })).daySequence).toBe(0)
    fakeNow.mockRestore()
  })

  it('音频时长来自 WAV 头, 引擎被杀留下的空文件不挂到会议上', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(meeting.meetingId, 'session-1')
    await writeFile(join(root, 'meetings', meeting.meetingId, MEETING_AUDIO_FILE), wavHeader(32_000 * 43))
    const finished = await store.finish('session-1')
    expect(finished?.audioDurationMs).toBe(43_000)

    const crashed = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(crashed.meetingId, 'session-2')
    await writeFile(join(root, 'meetings', crashed.meetingId, MEETING_AUDIO_FILE), wavHeader(0))
    expect((await store.finish('session-2'))?.audioFile).toBeUndefined()
  })

  it('audioPathFor 拒绝任何越界 meetingId', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(meeting.meetingId, 'session-1')
    await writeFile(join(root, 'meetings', meeting.meetingId, MEETING_AUDIO_FILE), wavHeader(32_000))
    await store.finish('session-1')
    expect(store.audioPathFor(meeting.meetingId)).toContain(MEETING_AUDIO_FILE)
    expect(store.audioPathFor('../../../Windows/System32')).toBeNull()
    expect(store.audioPathFor('a/../../b')).toBeNull()
    expect(store.audioPathFor('no-such-meeting')).toBeNull()
  })

  it('重命名落盘并保留, 删除连目录一起清掉', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    const renamed = await store.rename(meeting.meetingId, '  周会  ')
    expect(renamed).toMatchObject({ title: '周会', titleIsCustom: true })
    await expect(store.rename(meeting.meetingId, '   ')).rejects.toThrow('会议名称不能为空')

    const reopened = new MeetingStore(join(root, 'meetings'))
    await reopened.initialize(join(root, 'history.jsonl'))
    expect(reopened.get(meeting.meetingId)?.title).toBe('周会')

    await store.remove(meeting.meetingId)
    expect(store.get(meeting.meetingId)).toBeNull()
    await expect(readFile(join(root, 'meetings', meeting.meetingId, 'meeting.json'), 'utf8')).rejects.toThrow()
  })

  it('abandon 清掉从未真正开始的会议目录', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    await store.abandon(meeting.meetingId)
    expect(store.list()).toEqual([])
    await expect(readFile(join(root, 'meetings', meeting.meetingId, 'meeting.json'), 'utf8')).rejects.toThrow()
  })

  it('旧 history.jsonl 只迁一次, 且跳过中间结果与被截断的那一行', async () => {
    await writeFile(
      join(root, 'history.jsonl'),
      [
        JSON.stringify(segment('a', 0, 'first')),
        JSON.stringify(segment('b', 1000, 'partial', false)),
        '{"segmentId":"c","startedAtMs":2000,"sourceTe',
        JSON.stringify(segment('d', 3000, 'last')),
      ].join('\n'),
      'utf8',
    )
    const legacy = new MeetingStore(join(root, 'legacy'))
    await legacy.initialize(join(root, 'history.jsonl'))
    const meetings = legacy.list()
    expect(meetings).toHaveLength(1)
    expect((await legacy.segments(meetings[0].meetingId)).map((item) => item.sourceText)).toEqual(['first', 'last'])

    // The marker the first import wrote keeps the second startup from re-importing.
    const again = new MeetingStore(join(root, 'legacy'))
    await again.initialize(join(root, 'history.jsonl'))
    expect(again.list()).toHaveLength(1)
  })

  it('乱序与重复的 segment 按 revision 收敛, 并按时间排序', async () => {
    const meeting = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    store.attach(meeting.meetingId, 'session-1')
    await store.append('session-1', segment('b', 2000, 'second'))
    await store.append('session-1', segment('a', 1000, 'first'))
    await store.append('session-1', segment('b', 2000, 'stale'))
    await store.append('session-1', { ...segment('b', 2000, 'second'), revision: 2 })
    const stored = await store.segments(meeting.meetingId)
    expect(stored.map((item) => [item.segmentId, item.sourceText])).toEqual([
      ['a', 'first'],
      ['b', 'second'],
    ])
  })

  it('列表按开始时间倒序', async () => {
    const fakeNow = vi.spyOn(Date, 'now')
    fakeNow.mockReturnValue(new Date(2026, 8, 29, 10, 0, 0).getTime())
    const older = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    fakeNow.mockReturnValue(new Date(2026, 8, 29, 12, 0, 0).getTime())
    const newer = await store.begin({ sourceLanguage: 'auto', targetLanguage: 'zh', recordAudio: true })
    fakeNow.mockRestore()
    expect(store.list().map((item) => item.meetingId)).toEqual([newer.meetingId, older.meetingId])
  })
})
