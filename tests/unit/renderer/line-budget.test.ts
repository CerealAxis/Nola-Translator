import { expect, it } from 'vitest'

import { allocateCaptionLines } from '../../../src/renderer/overlay/line-budget'

const source = { text: '另外还有几台机型，国补前后的价格非常接近。', fontSize: 28, lineHeight: 1.3, maxLines: 3 }
const translation = {
  text: 'In addition, several models have prices before and after the national subsidy limits being very similar.',
  fontSize: 22, lineHeight: 1.35, maxLines: 3,
}

it('uses the actual window height before allowing a second translation line', () => {
  expect(allocateCaptionLines(66, 850, [source, translation])).toEqual([1, 1])
  expect(allocateCaptionLines(96, 850, [source, translation])).toEqual([1, 2])
})

it('gives a source-only track the space left by a hidden translation', () => {
  const longSource = { ...source, fontSize: 17, text: '这是第一句，需要一行。接下来还有第二句，也要继续显示在下一行。' }
  expect(allocateCaptionLines(66, 850, [longSource, { ...translation, text: null }])).toEqual([2, 0])
})
