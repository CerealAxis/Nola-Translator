import { expect, it } from 'vitest'
import { bilibiliTracks, parseSiteCues, parseTimedText, subtitleUrl } from './site-tracks'

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

it('reads Netflix bare tick timestamps and merges simultaneous regions in display order', () => {
  const xml = '<tt xmlns:ttp="urn:ttml:parameter" xmlns:tts="urn:ttml:styling" xml:lang="en" ttp:tickRate="10000000"><head><layout><region xml:id="low" tts:origin="0% 80%"/><region xml:id="high" tts:origin="0% 20%"/></layout></head><body><p begin="10000000" end="30000000" region="low">Second<br/>wrapped line</p><p begin="10000000" end="30000000" region="high">First</p></body></tt>'
  expect(parseTimedText(xml, 'netflix')).toEqual([{ start: 1, end: 3, text: 'First\nSecond wrapped line' }])
})

it('restores an actual Bilibili encoded subtitle path without changing query authentication', () => {
  expect(subtitleUrl("//subtitle.bilibili.com/%01%1B%5C=_%04%12%12%049f%2F%07H%08%29~%16$5%0D.%0B%0AL%03%2C%01%1A%00M:%1Ce%00%0F%1FF%11%1C%0E%1D%2A%01%12%29%0EMF%1BT8@B%25B%13%0E%0DHlE%1AVUZ%06%1C%15&%02:XG%16+%07Y%09%0F%03%0A%08%0A%7BD%1CbK%0B%1C%10?auth_key=fixture", 'bilibili', 'https://www.bilibili.com').href).toBe("https://aisubtitle.hdslb.com/bfs/subtitle/55e2ff0eeef0914a304a6fced375ae0efacdc81b.json?auth_key=fixture")
})

it('handles the second official Bilibili URL format', () => {
  expect(subtitleUrl("//subtitle.bilibili.com/S%13%1BP.%1D%28%29X%2CR%5Ej%1F%25w%0E%02H%5EHO4%14%7B4%08K@%3C%7B%00M%0B%0A%1AM%1A%19%0BI%2A2%14%3C%7D%5DK%16%1FK%14a%1B~%11CZ%13DZ%09DX%5C%2FM%0C%5BrK%06SXU%5DRQY%0B%05p%27Ik3@%11%5D%16%12?auth_key=fixture", 'bilibili', 'https://www.bilibili.com').href).toBe("https://aisubtitle.hdslb.com/bfs/subtitle/308f7a7b1562573b40cace74df1194085b83a12a.json?auth_key=fixture")
})
