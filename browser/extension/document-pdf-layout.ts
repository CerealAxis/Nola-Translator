export interface PdfTextBox { x: number; y: number; width: number; height: number; text: string }

export function isNearPdfFormula(line: PdfTextBox, lines: PdfTextBox[]) {
  return lines.some(candidate => /[=∑∫√≈≠≤≥±×÷]/u.test(candidate.text)
    && Math.abs(line.y - candidate.y) <= Math.max(line.height, candidate.height) * 1.5
    && line.x <= candidate.x + candidate.width + candidate.height * 8
    && candidate.x <= line.x + line.width + line.height * 8)
}

export function isPdfTextLine(text: string) {
  return /[\p{L}]{2}/u.test(text) && !/[=∑∫√≈≠≤≥±×÷]/u.test(text)
}

export function fitPdfTranslation(text: string, width: number, height: number, initialSize: number, measure: (text: string, size: number) => number) {
  let size = Math.max(5, initialSize)
  const wrap = () => {
    const lines: string[] = []
    let line = ''
    for (const character of text) {
      if (character === '\n') { lines.push(line); line = ''; continue }
      if (line && measure(line + character, size) > width) { lines.push(line); line = '' }
      line += character
    }
    if (line) lines.push(line)
    return lines
  }
  let lines = wrap()
  while (size > 5 && lines.length * size * 1.15 > height) {
    size = Math.max(5, size - 0.5)
    lines = wrap()
  }
  return { size, lines, verticalScale: Math.min(1, height / Math.max(1, lines.length * size * 1.15)) }
}
