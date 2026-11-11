import { describe, expect, it } from 'vitest'
import { fitPdfTranslation, isNearPdfFormula, isPdfTextLine } from './document-pdf-layout'

describe('PDF translation layout', () => {
  it('keeps all text even when a translation is much longer than its source box', () => {
    const text = 'Translated text '.repeat(50)
    const result = fitPdfTranslation(text, 80, 20, 12, (value, size) => value.length * size / 2)
    expect(result.lines.join('')).toBe(text)
    expect(result.verticalScale).toBeLessThan(1)
    expect(result.lines.length * result.size * 1.15 * result.verticalScale).toBeLessThanOrEqual(20)
  })
  it('leaves formulas on the original page', () => {
    expect(isPdfTextLine('T_s = T_b / (1 + λ)')).toBe(false)
    expect(isPdfTextLine('Exploring distant worlds')).toBe(true)
    const formula = { x: 30, y: 100, width: 30, height: 10, text: 'T =' }
    expect(isNearPdfFormula({ x: 65, y: 102, width: 20, height: 10, text: 'ln e' }, [formula])).toBe(true)
    expect(isNearPdfFormula({ x: 30, y: 140, width: 80, height: 10, text: 'next paragraph' }, [formula])).toBe(false)
  })
})
