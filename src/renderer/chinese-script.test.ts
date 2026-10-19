import { describe, expect, it } from 'vitest'
import { formatChineseCaption } from './chinese-script'

describe('Chinese caption script', () => {
  it('renders the selected simplified or traditional script', () => {
    expect(formatChineseCaption('汉语字幕', 'zh')).toBe('汉语字幕')
    expect(formatChineseCaption('汉语字幕', 'zh-Hant')).toBe('漢語字幕')
    expect(formatChineseCaption('漢語字幕', 'zh')).toBe('汉语字幕')
  })

  it('leaves auto detection and non-Chinese languages untouched', () => {
    expect(formatChineseCaption('漢語字幕', 'auto')).toBe('漢語字幕')
    expect(formatChineseCaption('hello', 'en')).toBe('hello')
  })
})
