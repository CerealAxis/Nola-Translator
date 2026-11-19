import { expect, it, vi } from 'vitest'
import { editDistanceBelow, mergeScreenLines, ScreenPipeline, type OcrBlock } from '../../../src/main/screen-pipeline'
import { screenConfigSchema } from '../../../src/shared/screen-translation'

const region = { id: 'first', x: 0.1, y: 0.2, width: 0.5, height: 0.6 }
const other = { ...region, id: 'second' }
const config = screenConfigSchema.parse({ sourceLanguage: 'en', targetLanguage: 'zh' })
const box = (text: string, x = 0, y = 0, w = 80, h = 20): OcrBlock =>
  ({ text, quad: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] })

it('uses the reference edit-distance cutoff, including insertions and deletions', () => {
  expect(editDistanceBelow('ABC', 'XYZ', 3)).toBe(false)
  expect(editDistanceBelow('ABC', 'XC', 3)).toBe(true)
  expect(editDistanceBelow('AB', 'AAXY', 3)).toBe(false)
  expect(editDistanceBelow('123HP', '124HP', 3)).toBe(true)
  expect(editDistanceBelow('123HP', '', 3)).toBe(false)
})

it('dispatches the first reading immediately and compares each reading to the previous OCR', async () => {
  const translate = vi.fn(async (text: string) => `translated:${text}`)
  const pipeline = new ScreenPipeline(config, translate, () => {}, () => {})
  pipeline.update(region, [box('life 100')], 200, 100)
  await vi.waitFor(() => expect(pipeline.blocks()[0]).toMatchObject({ translation: 'translated:life 100', x: 0.1, y: 0.2 }))
  pipeline.update(region, [box('life 200')], 200, 100)
  pipeline.update(region, [box('life 220')], 200, 100)
  pipeline.update(region, [box('life 222')], 200, 100)
  expect(translate).toHaveBeenCalledOnce()
  expect(pipeline.blocks()[0].text).toBe('life 100')
  pipeline.update(region, [box('life 222', 40)], 200, 100, true)
  await vi.waitFor(() => expect(pipeline.blocks()[0]).toMatchObject({ translation: 'translated:life 222', x: 0.2 }))
  pipeline.update(region, [], 200, 100)
  expect(pipeline.blocks()).toEqual([])
})

it('accepts one-character changes when the persisted text threshold is zero', async () => {
  const translate = vi.fn(async (text: string) => text.toUpperCase())
  const pipeline = new ScreenPipeline({ ...config, textChangeThreshold: 0 }, translate, () => {}, () => {})
  pipeline.update(region, [box('life 100')], 200, 100)
  await vi.waitFor(() => expect(pipeline.blocks()[0].translation).toBe('LIFE 100'))
  pipeline.update(region, [box('life 101')], 200, 100)
  await vi.waitFor(() => expect(pipeline.blocks()[0].translation).toBe('LIFE 101'))
  pipeline.update(region, [box('life 101')], 200, 100)
  expect(translate).toHaveBeenCalledTimes(2)
})

it('keeps other regions valid and rejects a late translation from a superseded region revision', async () => {
  let complete!: (text: string) => void
  const translate = vi.fn((text: string) => text === 'first text'
    ? new Promise<string>(resolve => { complete = resolve }) : Promise.resolve(text.toUpperCase()))
  const pipeline = new ScreenPipeline(config, translate, () => {}, () => {})
  pipeline.update(region, [box('first text')], 200, 100)
  pipeline.update(other, [box('second area')], 200, 100)
  pipeline.update(region, [box('new text')], 200, 100)
  expect(translate.mock.calls.map(([text]) => text)).toEqual(['first text'])
  complete('stale translation')
  await vi.waitFor(() => expect(pipeline.blocks().map(block => block.translation)).toEqual(['NEW TEXT', 'SECOND AREA']))
  expect(translate.mock.calls.map(([text]) => text)).toEqual(['first text', 'second area', 'new text'])
})

it('reuses repeated results and reapplies only the matching glossary change', async () => {
  let signature = 'original'
  const translate = vi.fn(async (text: string) => `${text}-${signature}`)
  const pipeline = new ScreenPipeline(config, translate, () => {}, () => {}, text => text === 'Name' ? signature : '')
  pipeline.update(region, [box('Name'), box('Other', 100)], 200, 100)
  await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
  pipeline.update(region, [box('Name'), box('Other', 100)], 200, 100, true)
  expect(translate).toHaveBeenCalledTimes(2)
  signature = 'updated'
  pipeline.refreshRules()
  await vi.waitFor(() => expect(pipeline.blocks()[0].translation).toBe('Name-updated'))
  expect(translate.mock.calls.map(([text]) => text)).toEqual(['Name', 'Other', 'Name'])
})

it('refreshes blur and position for unchanged OCR text without sending another translation', async () => {
  const translate = vi.fn(async () => 'translated')
  const pipeline = new ScreenPipeline(config, translate, () => {}, () => {})
  const patch = { x: 0.1, y: 0.2, width: 0.3, height: 0.25, image: 'data:image/png;base64,first' }
  pipeline.update(region, [{ ...box('North entrance'), patches: [patch], ink: '#fedcba' }], 200, 100)
  await vi.waitFor(() => expect(pipeline.blocks()[0].translation).toBe('translated'))
  expect(pipeline.blocks()[0].patches?.[0]).toMatchObject({ x: 0.15000000000000002, y: 0.32 })
  const updated = { ...patch, x: 0.25, image: 'data:image/png;base64,second' }
  pipeline.update(region, [{ ...box('North entrance', 40), patches: [updated], ink: '#ffffff' }], 200, 100)
  expect(pipeline.blocks()[0]).toMatchObject({ translation: 'translated', x: 0.2, ink: '#ffffff',
    patches: [{ image: updated.image, x: 0.225 }] })
  expect(translate).toHaveBeenCalledOnce()
})

it('uses relative box distance, continuation separators and rotated unions', () => {
  const text = [box('Short', 0, 0, 35), box('longer continuation', 0, 24, 100), box('Side', 160)]
  expect(mergeScreenLines(text, false, ' ').map(block => block.text)).toEqual(['Short\nlonger continuation', 'Side'])
  expect(mergeScreenLines([box('Wrap'), box('continues', 0, 24, 70)], false, ' ')[0].text).toBe('Wrap continues')
  const tilted = [{ text: 'Left', quad: [[0, 0], [20, 10], [15, 20], [-5, 10]] },
    { text: 'right', quad: [[19, 10], [39, 20], [34, 30], [14, 20]] }]
  const [merged] = mergeScreenLines(tilted, false, ' ')
  expect(merged.quad[1][1] - merged.quad[0][1]).toBeCloseTo((merged.quad[1][0] - merged.quad[0][0]) / 2)
})
