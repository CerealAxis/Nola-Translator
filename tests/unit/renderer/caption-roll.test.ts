import { expect, it } from 'vitest'

import { rollingCaptionPages } from '../../../src/renderer/overlay/caption-roll'

it('keeps a growing line in place until it fills the available width', () => {
  expect(rollingCaptionPages('Today we will talk', 360, 20)).toEqual(['Today we will talk'])
  const pages = rollingCaptionPages('Today we will talk about the important topic and challenge the idea', 360, 20)
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.join(' ')).toBe('Today we will talk about the important topic and challenge the idea')
})

it('keeps domains and decimal numbers inside an English sentence', () => {
  expect(rollingCaptionPages('JD.com pages were not counted.', 900, 16)).toEqual(['JD.com pages were not counted.'])
  expect(rollingCaptionPages('The price on JD.com was $7999.00. It later fell.', 900, 16)).toEqual([
    'The price on JD.com was $7999.00.',
    'It later fell.',
  ])
})

it('keeps an English translation together across two visible lines', () => {
  const translation = 'In addition, several models have prices before and after the national subsidy limits being very similar.'
  const pages = rollingCaptionPages(translation, 900, 22, 2)
  expect(pages).toHaveLength(1)
  expect(pages[0].replace(/\s+/g, ' ')).toBe(translation)
  expect(pages[0]).toContain('\n')
})

it('rolls at a sentence boundary with one line and continues in place with two', () => {
  const text = 'The first price was listed. The subsidy changed it.'
  expect(rollingCaptionPages(text, 900, 22, 1)).toEqual([
    'The first price was listed.', 'The subsidy changed it.',
  ])
  expect(rollingCaptionPages(text, 900, 22, 2)).toEqual(['The first price was listed.\nThe subsidy changed it.'])
  const chinese = '这是第一句。这里还有第二句。'
  expect(rollingCaptionPages(chinese, 900, 22, 1)).toEqual(['这是第一句。', '这里还有第二句。'])
  expect(rollingCaptionPages(chinese, 900, 22, 2)).toEqual(['这是第一句。\n这里还有第二句。'])
})

it('does not leave a tiny English tail when a long sentence wraps', () => {
  const pages = rollingCaptionPages(
    'We chose JD.com because the listed price was not counted in the national subsidy.', 900, 22,
  )
  expect(pages.join(' ')).toBe('We chose JD.com because the listed price was not counted in the national subsidy.')
  expect(pages.at(-1)!.length).toBeGreaterThanOrEqual(12)
})

it('counts Chinese glyphs as wider than Latin letters', () => {
  const english = rollingCaptionPages('abcdefghijklmnopqrst', 180, 18)
  const chinese = rollingCaptionPages('我们将讨论为什么社会让我们为休息而感到难过。', 180, 18)
  expect(english).toHaveLength(2)
  expect(chinese.length).toBeGreaterThan(english.length)
})

it('shows long Chinese speech in short clauses even in a wide overlay', () => {
  const pages = rollingCaptionPages('我们这次使用的是慢慢买，它最早能拿到2025年8月份的价格，足够做一年的分析。为了避免不同平台的差异，我们都选用京东自营的价格。', 1200, 17)
  expect(pages.length).toBeGreaterThanOrEqual(4)
  expect(pages[0]).toMatch(/慢慢买，$/)
  expect(pages.some((page) => page.endsWith('。'))).toBe(true)
  expect(pages.every((page) => page.length <= 30)).toBe(true)
})
