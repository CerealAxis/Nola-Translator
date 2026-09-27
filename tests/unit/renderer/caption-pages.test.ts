import { expect, it } from 'vitest'
import { captionPages } from '../../../src/renderer/components/caption-pages'

it('splits punctuation-delimited sentences and long partial transcripts', () => {
  expect(captionPages('First sentence. Second sentence!')).toEqual(['First sentence.', 'Second sentence!'])
  const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
  const pages = captionPages(words)
  expect(pages.length).toBeGreaterThan(1)
  expect(pages.join(' ')).toBe(words)
  expect(pages.every((page) => page.length <= 110)).toBe(true)
})
