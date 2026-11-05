import { expect, it } from 'vitest'
import { bilibiliTracks, parseSiteCues, subtitleUrl } from './site-tracks'

it('decodes Bilibili track metadata and preserves cue start and end times', () => {
  const field = (tag: number, bytes: number[]) => [tag * 8 + 2, bytes.length, ...bytes]
  const utf8 = (value: string) => [...new TextEncoder().encode(value)]
  const url = '//aisubtitle.hdslb.com/bfs/subtitle/test.json'
  const encoded = field(1, field(3, [...field(3, utf8('ai-zh')), ...field(4, utf8('中文')), ...field(5, utf8(url))]))
  expect(bilibiliTracks(Uint8Array.from(encoded))).toEqual([{ id: '0', language: 'zh', label: '中文', url }])
  expect(parseSiteCues({ body: [{ from: 1.5, to: 2, content: '你好' }] }, 'bilibili')).toEqual([{ start: 1.5, end: 2, text: '你好' }])
  expect(parseSiteCues({ events: [{ tStartMs: 300, dDurationMs: 150, segs: [{ utf8: 'Hello' }] }] }, 'youtube')).toEqual([{ start: 0.3, end: 0.45, text: 'Hello' }])
  expect(() => subtitleUrl('https://bilibili.com.evil.test/subtitle/a', 'bilibili', 'https://www.bilibili.com')).toThrow()
})
