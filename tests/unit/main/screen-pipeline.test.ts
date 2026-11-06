import { expect, it, vi } from 'vitest'
import { ScreenPipeline, mergeScreenLines, type OcrBlock } from '../../../src/main/screen-pipeline'
import { screenConfigSchema } from '../../../src/shared/screen-translation'
import { visibleScreenBlocks } from '../../../src/renderer/features/screen/overlay-layout'

const region = '8ddba01d-f7dd-4ea2-b24e-0a3220212420'
const other = '8ddba01d-f7dd-4ea2-b24e-0a3220212421'
const config = () => screenConfigSchema.parse({ model: 'cloud:google', sourceLanguage: 'en', targetLanguage: 'zh', regions: [{ id: region, x: 0, y: 0, width: 1, height: 1 }, { id: other, x: 0, y: 0, width: 1, height: 1 }] })
const block = (text: string, x = 0, y = 0): OcrBlock => ({ id: '0', text, confidence: 0.99, quad: [[x, y], [x + 100, y], [x + 100, y + 20], [x, y + 20]] })
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

it('publishes slow OCR after current glyph verification despite continuous background changes', async () => {
  const pipeline = new ScreenPipeline(config(), async () => 'translated', () => {}, () => {})
  const candidate = { ...block('Price 100'), visualId: 'glyph-a' }
  pipeline.update(region, [candidate], 1000, 1000, 0, false)
  expect(visibleScreenBlocks(pipeline.blocks())).toHaveLength(0)
  for (let frame = 0; frame < 20; frame++) {
    pipeline.observeRegion(region, new Set(['glyph-a']))
    pipeline.verifyVisual('glyph-a', true, false, frame * 100)
  }
  await settle()
  expect(visibleScreenBlocks(pipeline.blocks())).toHaveLength(1)
  expect(pipeline.blocks()[0].appearancePending).toBe(true)
  pipeline.update(region, [candidate], 1000, 1000, 2200, false)
  expect(visibleScreenBlocks(pipeline.blocks())).toHaveLength(1)
})

it('withdraws changed glyphs before OCR and never lets late MT or obsolete probes reveal them', async () => {
  let finish!: (value: string) => void
  const pipeline = new ScreenPipeline(config(), () => new Promise(resolve => { finish = resolve }), () => {}, () => {})
  pipeline.update(region, [{ ...block('100'), visualId: 'old' }], 1000, 1000, 0, false)
  pipeline.verifyVisual('old', true, false, 100)
  pipeline.verifyVisual('old', false, false, 200)
  finish('late'); await settle()
  expect(visibleScreenBlocks(pipeline.blocks())).toHaveLength(0)
  pipeline.update(region, [{ ...block('101'), visualId: 'new' }], 1000, 1000, 300, false)
  pipeline.verifyVisual('old', true, false, 400)
  expect(pipeline.blocks()[0]).toMatchObject({ text: '101', hidden: true })
})

it('waits for text stability, translates once and retains a result across animated frames', async () => {
  const translate = vi.fn(async () => '译文')
  const pipeline = new ScreenPipeline(config(), translate, () => {}, () => {})
  pipeline.update(region, [block('Price 100')], 1000, 1000, 0)
  expect(translate).not.toHaveBeenCalled()
  pipeline.update(region, [block('Price 100', 1)], 1000, 1000, 100)
  await settle()
  expect(translate).toHaveBeenCalledOnce()
  expect(pipeline.blocks()[0]).toMatchObject({ text: 'Price 100', translation: '译文', status: 'ready' })
  for (let frame = 0; frame < 20; frame++) pipeline.update(region, [block('Price 100', frame % 2)], 1000, 1000, 200 + frame * 100)
  expect(translate).toHaveBeenCalledOnce()
})

it('updates tiny numeric changes, clears disappeared text and rejects obsolete async results', async () => {
  let finish!: (text: string) => void
  const translate = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
  const pipeline = new ScreenPipeline(config(), translate, () => {}, () => {})
  pipeline.update(region, [block('100')], 1000, 1000, 0)
  pipeline.update(region, [block('100')], 1000, 1000, 100)
  const previous = finish
  pipeline.update(region, [block('101')], 1000, 1000, 200)
  expect(pipeline.blocks()[0].translation).toBeUndefined()
  previous('旧译文'); await settle()
  expect(pipeline.blocks()[0]).toMatchObject({ text: '101', status: 'stabilizing' })
  pipeline.update(region, [], 1000, 1000, 300)
  expect(pipeline.blocks()).toEqual([])
})

it('sets a maximum text-stability wait and keeps independent regions alive', async () => {
  const translate = vi.fn(async text => `译:${text}`)
  const pipeline = new ScreenPipeline(config(), translate, () => {}, () => {})
  pipeline.update(region, [block('H')], 1000, 1000, 0)
  pipeline.update(other, [block('Other')], 1000, 1000, 0)
  pipeline.update(other, [block('Other')], 1000, 1000, 100)
  pipeline.update(region, [block('He')], 1000, 1000, 500)
  pipeline.update(region, [block('Hello')], 1000, 1000, 1200)
  await settle()
  expect(translate.mock.calls.map(([text]) => text)).toEqual(['Other', 'Hello'])
  expect(pipeline.blocks().filter(block => block.status === 'ready')).toHaveLength(2)
  pipeline.update(region, [], 1000, 1000, 1300)
  expect(pipeline.blocks()[0].text).toBe('Other')
})

it('bounds translation concurrency and retries, and fences all results after stop', async () => {
  const failed = vi.fn()
  const translate = vi.fn(async () => { throw new Error('offline') })
  const pipeline = new ScreenPipeline(config(), translate, () => {}, failed)
  pipeline.update(region, [block('Text')], 1000, 1000, 0)
  pipeline.update(region, [block('Text')], 1000, 1000, 1)
  await settle(); await settle()
  expect(translate).toHaveBeenCalledTimes(2)
  expect(failed).toHaveBeenCalledOnce()
  expect(pipeline.blocks()[0].status).toBe('error')
  pipeline.stop(); pipeline.update(region, [block('New')], 1000, 1000, 2000)
  expect(pipeline.blocks()).toEqual([])
})

it('merges aligned dialogue lines while preserving columns and separated buttons', () => {
  expect(mergeScreenLines([block('Line one'), block('Line two', 0, 25)], 1000)).toMatchObject([{ text: 'Line one\nLine two' }])
  expect(mergeScreenLines([block('Left'), block('Right', 300), block('Button', 0, 90)], 1000)).toHaveLength(3)
})


it('hides outdated text and patches immediately and restores cached text with fresh appearance', async () => {
  const patch = { image: 'data:image/png;base64,test', x: .1, y: .2, width: .2, height: .1 }
  const appearance = { color: '#ffffff', background: '#000000', patches: [patch] }
  const translate = vi.fn(async () => '译文')
  const pipeline = new ScreenPipeline(screenConfigSchema.parse({ regions: [{ id: region, x: 0, y: 0, width: 1, height: 1 }] }), translate, vi.fn(), vi.fn())
  const input = { id: 'hello', text: 'Hello', confidence: .99, quad: [[100, 200], [300, 200], [300, 300], [100, 300]], appearance }
  pipeline.update(region, [input], 1000, 1000, 0)
  pipeline.update(region, [input], 1000, 1000, 600)
  await vi.waitFor(() => expect(pipeline.blocks()[0].status).toBe('ready'))
  pipeline.hideRegion(region)
  expect(pipeline.blocks()[0]).toMatchObject({ hidden: true, appearancePending: true, translation: '译文' })
  expect(visibleScreenBlocks(pipeline.blocks())).toEqual([])
  pipeline.update(region, [{ ...input, appearance: { ...appearance, color: '#ff0000' } }], 1000, 1000, 1200)
  expect(pipeline.blocks()[0]).toMatchObject({ hidden: false, appearancePending: false, translation: '译文', appearance: { color: '#ff0000' } })
  expect(translate).toHaveBeenCalledOnce()
  pipeline.stop()
})

it('keeps a late translation invisible until its source is revalidated', async () => {
  let finish!: (text: string) => void
  const pipeline = new ScreenPipeline(config(), () => new Promise(resolve => { finish = resolve }), vi.fn(), vi.fn())
  pipeline.update(region, [block('Old tooltip')], 1000, 1000, 0)
  pipeline.update(region, [block('Old tooltip')], 1000, 1000, 100)
  pipeline.hideRegion(region)
  finish('旧提示'); await settle()
  expect(visibleScreenBlocks(pipeline.blocks())).toEqual([])
  pipeline.update(region, [block('New tooltip')], 1000, 1000, 200)
  expect(visibleScreenBlocks(pipeline.blocks())).toEqual([])
  pipeline.stop()
})

it('retranslates only text whose effective glossary signature changed', async () => {
  let signature = 'first'
  const translate = vi.fn(async text => `${signature}:${text}`)
  const pipeline = new ScreenPipeline(config(), translate, vi.fn(), vi.fn(), text => text === 'Name' ? signature : '')
  pipeline.update(region, [block('Name'), block('Other', 300)], 1000, 1000, 0)
  pipeline.update(region, [block('Name'), block('Other', 300)], 1000, 1000, 100)
  await settle()
  signature = 'second'
  pipeline.update(region, [block('Name'), block('Other', 300)], 1000, 1000, 200)
  await settle()
  expect(translate.mock.calls.map(([text]) => text)).toEqual(['Name', 'Other', 'Name'])
  expect(pipeline.blocks().find(item => item.text === 'Name')?.translation).toBe('second:Name')
  pipeline.stop()
})
