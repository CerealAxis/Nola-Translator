import { expect, it } from 'vitest'

import { rollingCaptionPages } from '../../../src/renderer/overlay/caption-roll'

it('keeps a growing line in place until it fills the available width', () => {
  expect(rollingCaptionPages('Today we will talk', 360, 20)).toEqual(['Today we will talk'])
  const pages = rollingCaptionPages('Today we will talk about the important topic and challenge the idea', 360, 20)
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.join(' ')).toBe('Today we will talk about the important topic and challenge the idea')
})

it('counts Chinese glyphs as wider than Latin letters', () => {
  const english = rollingCaptionPages('abcdefghijklmnopqrst', 180, 18)
  const chinese = rollingCaptionPages('我们将讨论为什么社会让我们为休息而感到难过。', 180, 18)
  expect(english).toHaveLength(2)
  expect(chinese.length).toBeGreaterThan(english.length)
})
