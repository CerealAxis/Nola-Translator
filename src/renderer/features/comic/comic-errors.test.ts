import { expect, it } from 'vitest'
import { comicErrorMessage } from './comic-errors'

it('explains known model errors and keeps unknown diagnostics visible', () => {
  expect(
    comicErrorMessage(
      new Error('Error invoking remote method: Error: comicInvalidModelResult'),
      (key) => key,
    ),
  ).toBe('errorModelResult')
  expect(comicErrorMessage('ocrUnavailable', (key) => key)).toBe(
    'errorOcrUnavailable',
  )
  expect(comicErrorMessage('diskFull: volume D', (key) => key)).toBe(
    'diskFull: volume D',
  )
})
