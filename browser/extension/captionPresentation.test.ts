import { describe, expect, it } from 'vitest'
import { CaptionClock, captionLines, deepFullscreenElement, fullscreenCueBounds, subtitleGeometry, visibleControlReserve } from './captionPresentation'
import type { Caption, CaptionConfig } from './store'

const phrase: Caption = { segmentId: 'phrase', revision: 1, startedAtMs: 0, videoStartedAtMs: 12000, videoEndedAtMs: 13000, sourceText: 'Hello', translations: [], isFinal: true }
const config = (patch: Partial<CaptionConfig> = {}): CaptionConfig => ({ showSource: true, showTranslation: false, layout: 'sentence', fontSize: 24, position: 82, sourceLanguage: 'en', targetLanguage: 'zh', ...patch })
describe('live caption presentation', () => {
  it('keeps recognition visible while translation is pending or unavailable', () => {
    expect(captionLines(phrase, config())).toEqual(['Hello'])
    expect(captionLines(phrase, config({ showTranslation: true }))).toEqual(['Hello'])
    expect(captionLines({ ...phrase, translations: [{ targetLanguage: 'zh', state: 'failed', provider: 'test', errorCode: 'translationUnavailable' }] }, config({ showTranslation: true }))).toEqual(['Hello'])
    expect(captionLines(phrase, config({ showSource: false, showTranslation: true }))).toEqual([])
    expect(captionLines(phrase, config({ showSource: false, targetLanguage: 'none' }))).toEqual([])
    expect(captionLines(phrase, config({ showTranslation: false, targetLanguage: 'none' }))).toEqual(['Hello'])
    const translated = { ...phrase, translations: [{ targetLanguage: 'zh', text: '你好', state: 'complete' as const, provider: 'test' }] }
    expect(captionLines(translated, config())).toEqual(['Hello'])
    expect(captionLines(translated, config({ showTranslation: true }))).toEqual(['Hello', '你好'])
    expect(captionLines(translated, config({ showSource: false, showTranslation: true }))).toEqual(['你好'])
  })
  it('expires a phrase once and freezes its remaining lifetime while paused', () => {
    const clock = new CaptionClock()
    expect(clock.update('epoch:phrase:1', 0, false, 1)).toBe(3)
    expect(clock.update('epoch:phrase:1', 2000, true, 1)).toBe(1)
    expect(clock.update('epoch:phrase:1', 20000, false, 1)).toBe(1)
    expect(clock.update('epoch:phrase:1', 26000, false, 1)).toBe(0)
    expect(clock.update('epoch:phrase:1', 27000, false, 1)).toBe(0)
    expect(clock.update('epoch:phrase:2', 28000, false, 1)).toBe(3)
  })
  it('makes an ASR-delayed native fullscreen cue visible on the current frame', () => {
    expect(fullscreenCueBounds(phrase, 18, 4)).toEqual([12, 22])
  })
  it('resolves fullscreen videos inside open shadow roots', () => {
    const host = document.createElement('div'); const shadow = host.attachShadow({ mode: 'open' }); const video = document.createElement('video'); shadow.append(video)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: host })
    Object.defineProperty(shadow, 'fullscreenElement', { configurable: true, value: video })
    expect(deepFullscreenElement(document)).toBe(video)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  })
  it('releases the control reserve when the bar or its parent fades away', () => {
    const container = document.createElement('div')
    const wrapper = document.createElement('div')
    const controls = document.createElement('div')
    container.append(wrapper); wrapper.append(controls); document.body.append(container)
    controls.getBoundingClientRect = () => ({ top: 340, bottom: 400, height: 60 }) as DOMRect
    const frame = { top: 0, bottom: 400, height: 400 }
    expect(visibleControlReserve(controls, container, frame)).toBe(60)
    wrapper.style.opacity = '0'
    expect(visibleControlReserve(controls, container, frame)).toBe(0)
    wrapper.style.opacity = '1'
    expect(visibleControlReserve(controls, container, frame)).toBe(60)
    controls.style.display = 'none'
    expect(visibleControlReserve(controls, container, frame)).toBe(0)
    container.remove()
  })
  it('anchors the bottom five percent above the frame or visible controls regardless of text height', () => {
    expect(subtitleGeometry(400, 0.05, 40, 0)).toEqual({ top: 380, maxHeight: 380 })
    expect(subtitleGeometry(400, 0.05, 80, 60)).toEqual({ top: 320, maxHeight: 320 })
    expect(subtitleGeometry(400, 0.05, 80, 0)).toEqual({ top: 380, maxHeight: 380 })
  })
  it('keeps oversized bilingual phrases within a small video and reserves controls', () => {
    expect(subtitleGeometry(90, 0.18, 180, 22.5)).toEqual({ top: 51.3, maxHeight: 51.3 })
    const layout = subtitleGeometry(360, 0.12, 72, 40)
    expect(layout.top).toBe(276.8)
    expect(layout.top).toBeLessThanOrEqual(320)
    expect(subtitleGeometry(0, 0.18, 72, 40)).toEqual({ top: 0, maxHeight: 0 })
  })
})
