/*
 * Screenshot and layout gate for the caption overlay window.
 *
 * Runs the real preload (`out/preload/index.cjs`), not a fixture: closing the window,
 * session control and minimise all cross the bridge. Engine events are injected the way
 * the main process broadcasts them, with `webContents.send('engine:event', ...)`.
 *
 * Every container list below is counted before it is used: zero is a failure, not
 * "this build has no such content".
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'

const root = process.cwd()
const out = resolve(root, 'artifacts/ui')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const settings = {
  version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '',
  recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'en', audioSource: 'defaultOutput' },
  recording: { keepAudio: true },
  appearance: { reduceMotion: false },
  overlay: {
    mode: 'bottom', colorScheme: 'dark', locked: false, alwaysOnTop: true,
    fontFamily: 'Segoe UI Variable', fontSize: 17, fontWeight: 500,
    translationFontSize: 16, translationFontWeight: 400,
    sourceColor: '#F7F7F7', translationColor: '#D7DEE8',
    backgroundColor: '#0D0E10', backgroundOpacity: 0.96,
    lineHeight: 1.3, translationLineHeight: 1.35,
    showSource: true, showTranslation: true, layout: 'rolling',
  },
  translation: {
    provider: 'local', localModelId: 'hy-mt2-1.8b-q3-k-m', targetLanguage: 'zh',
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '',
    cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini', cloudApiFormat: 'chat-completions',
    translateIntermediate: false,
  },
}

let failures = 0
let checks = 0
/** A miss counts as a failure; `label` appears in the error message. */
function expectFound(label, found, min = 1) {
  checks += 1
  if (found < min) {
    failures += 1
    throw new Error(`${label}: found ${found}, need >= ${min} —— 容器没了，不要当成"没问题"`)
  }
}
function expectTrue(label, ok, detail) {
  checks += 1
  if (!ok) {
    failures += 1
    throw new Error(`${label}: ${JSON.stringify(detail)}`)
  }
}

const emit = (window, type, extra) => window.webContents.send('engine:event', {
  protocolVersion: 1, type, requestId: 'preview', sessionId: 'preview', ...extra,
})
const caption = (extra) => emit(windowRef, 'caption', { segment: { revision: 1, startedAtMs: 0, isFinal: true, ...extra } })

let windowRef = null

app.disableHardwareAcceleration()
void app.whenReady().then(async () => {
  // Settings are the only channel this script drives. Close, minimise and session control
  // only fire from user actions, so their handlers stay unregistered.
  ipcMain.handle('app:get-settings', () => settings)
  ipcMain.handle('app:update-settings', () => settings)
  const window = new BrowserWindow({
    width: 900, height: 218, show: false, frame: false, transparent: true,
    webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), contextIsolation: true, sandbox: true },
  })
  windowRef = window
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { query: { overlay: '1' } })
  // Must be shown: a hidden window throttles its animation timeline, so the 320ms
  // transform on `.nola-caption-track-content` never advances and the roll reads a false 0.
  window.showInactive()
  await delay(500)

  // -- 1. Empty state: the structure must actually be in the DOM ---------------------
  let structure = await window.webContents.executeJavaScript(`(() => ({
    window: document.querySelectorAll('.nola-overlay-window').length,
    card: document.querySelectorAll('.nola-caption-card').length,
    stage: document.querySelectorAll('.nola-caption-stage').length,
    source: document.querySelectorAll('.nola-caption-track[data-kind="source"]').length,
    translation: document.querySelectorAll('.nola-caption-track[data-kind="translation"]').length,
    actions: document.querySelectorAll('.nola-caption-actions').length,
    actionButtons: document.querySelectorAll('.nola-caption-actions .nola-caption-action').length,
    controls: document.querySelectorAll('[data-slot="overlay-controls"]').length,
    scrims: document.querySelectorAll('.nola-caption-scrim[data-edge]').length,
    bilingual: document.querySelector('.nola-caption-card')?.getAttribute('data-bilingual'),
    locked: document.querySelector('.nola-caption-card')?.getAttribute('data-locked'),
    scheme: document.querySelector('.nola-caption-card')?.getAttribute('data-scheme'),
  }))()`)
  expectFound('overlay-window', structure.window)
  expectFound('caption-card', structure.card)
  expectFound('caption-stage', structure.stage)
  expectFound('source-track', structure.source)
  expectFound('translation-track', structure.translation)
  expectFound('caption-actions', structure.actions)
  expectFound('caption-action-button', structure.actionButtons, 6)
  expectFound('overlay-controls', structure.controls)
  expectFound('caption-scrim', structure.scrims, 2)
  expectTrue('card state flags', structure.bilingual === 'true' && structure.locked === 'false' && structure.scheme === 'dark', structure)

  // -- 2. First sentence: both tracks carry it and neither is empty ------------------
  await emit(window, 'sessionStarted')
  await caption({
    segmentId: 'preview-segment',
    sourceText: 'We will discuss why society makes us feel bad for resting.',
    translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '我们将讨论为什么社会让我们为休息而感到难过。' }],
  })
  await delay(600)
  const first = await window.webContents.executeJavaScript(`(() => ({
    source: document.querySelector('.nola-caption-track[data-kind="source"] .nola-caption-track-content')?.textContent ?? '',
    target: document.querySelector('.nola-caption-track[data-kind="translation"] .nola-caption-track-content')?.textContent ?? '',
    sourceLines: document.querySelector('.nola-caption-track[data-kind="source"]')?.style.getPropertyValue('--nola-overlay-visible-lines'),
    targetLines: document.querySelector('.nola-caption-track[data-kind="translation"]')?.style.getPropertyValue('--nola-overlay-visible-lines'),
    sourceSegments: document.querySelectorAll('.nola-caption-track[data-kind="source"] .nola-caption-segment').length,
    targetSegments: document.querySelectorAll('.nola-caption-track[data-kind="translation"] .nola-caption-segment').length,
  }))()`)
  expectFound('first source segment', first.sourceSegments)
  expectFound('first target segment', first.targetSegments)
  expectTrue('first sentence rendered on both tracks',
    first.source.includes('society makes us feel bad') && first.target.includes('让我们为休息而感到难过'), first)
  // A track budgeted zero lines has nowhere to render, so both must get at least one.
  expectTrue('line budget', Number.parseInt(first.sourceLines, 10) >= 1 && Number.parseInt(first.targetLines, 10) >= 1,
    { sourceLines: first.sourceLines, targetLines: first.targetLines })
  await writeFile(resolve(out, 'overlay-console.png'), (await window.webContents.capturePage()).toPNG())

  // -- 3. A second final segment, shot twice while the 320ms scroll is still running --
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 1, startedAtMs: 2000, isFinal: true, sourceText: 'Taking a break is important for a healthy, balanced life.', translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '休息对健康而平衡的生活很重要。' }] } })
  await delay(70)
  await writeFile(resolve(out, 'overlay-source-transition.png'), (await window.webContents.capturePage()).toPNG())
  await delay(110)
  await writeFile(resolve(out, 'overlay-translation-transition.png'), (await window.webContents.capturePage()).toPNG())

  // -- 4. Source only: the translation track must disappear, not just empty out ------
  settings.overlay.showTranslation = false
  window.webContents.send('settings:changed', settings)
  await delay(400)
  const sourceOnly = await window.webContents.executeJavaScript(`(() => ({
    source: document.querySelectorAll('.nola-caption-track[data-kind="source"]').length,
    translation: document.querySelectorAll('.nola-caption-track[data-kind="translation"]').length,
    bilingual: document.querySelector('.nola-caption-card')?.getAttribute('data-bilingual'),
  }))()`)
  expectFound('source-only source track', sourceOnly.source)
  expectTrue('translation track removed when showTranslation is false',
    sourceOnly.translation === 0 && sourceOnly.bilingual === 'false', sourceOnly)
  await writeFile(resolve(out, 'overlay-source-only.png'), (await window.webContents.capturePage()).toPNG())
  settings.overlay.showTranslation = true
  window.webContents.send('settings:changed', settings)
  await delay(300)

  // -- 5. Unconfirmed revision: the source scrolls on by exactly its own overflow -----
  // Text that fits never scrolls, and a scroller that failed looks the same as none, so
  // the fonts are pushed to 40/34 first to force an overflow that has to be handled.
  settings.overlay.fontSize = 40
  settings.overlay.translationFontSize = 34
  window.webContents.send('settings:changed', settings)
  await delay(300)
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 2, startedAtMs: 2000, isFinal: false, sourceText: 'Taking a break is important for a healthy, balanced life. We can return to our work with a clearer mind and more energy than before.', translations: [{ targetLanguage: 'zh', state: 'pending', provider: 'example' }] } })
  await delay(70)
  await writeFile(resolve(out, 'overlay-line-roll.png'), (await window.webContents.capturePage()).toPNG())
  // Measure only once the 320ms transition has settled; mid-transition the computed
  // matrix is an interpolation rather than the settled one.
  await delay(400)
  const roll = await window.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.nola-caption-track[data-kind="source"]')
    const content = track?.querySelector('.nola-caption-track-content')
    const flow = track?.querySelector('.nola-caption-track-flow')
    if (!(content instanceof HTMLElement) || !(flow instanceof HTMLElement)) return null
    const computed = getComputedStyle(content).transform
    const matrix = new DOMMatrixReadOnly(computed === 'none' ? '' : computed)
    const overflow = content.offsetHeight - flow.clientHeight
    return {
      segments: track.querySelectorAll('.nola-caption-segment').length,
      rolling: track.getAttribute('data-rolling'),
      shiftY: matrix.f,
      overflow,
    }
  })()`)
  expectTrue('roll probe found the track', roll !== null, { roll })
  expectFound('source stream segments', roll.segments, 2)
  expectTrue('caption block rolled up by exactly its own overflow',
    roll.overflow > 0 && roll.rolling === 'true' && Math.abs(roll.shiftY + roll.overflow) <= 1, roll)

  // -- 6. Big type in a squeezed bar: the tail must roll out of view, not stretch it -
  settings.overlay.fontSize = 28
  settings.overlay.translationFontSize = 22
  window.webContents.send('settings:changed', settings)
  // The bar is squeezed until the text genuinely overflows; 160 DIP is above the 109 that
  // `overlayMinimumHeight` returns at 28/22, so the real bar can reach this height too.
  window.setSize(900, 160)
  await delay(400)
  /*
   * The previous step left an unconfirmed segment, and `OverlayRoot` renders the interim
   * ahead of the last final one. Only a final carrying the same segmentId clears it, so
   * this step must reuse `preview-next` before the English segment can become current.
   */
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 3, startedAtMs: 2000, isFinal: true, sourceText: 'Taking a break is important for a healthy, balanced life.', translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '休息对健康而平衡的生活很重要。' }] } })
  await delay(200)
  const englishTranslation = 'In addition, several models have prices before and after the national subsidy limits being very similar.'
  await emit(window, 'caption', { segment: { segmentId: 'preview-english', revision: 1, startedAtMs: 3000, isFinal: true, sourceText: '另外还有几台机型，国补前后的价格非常接近。', translations: [{ targetLanguage: 'en', state: 'complete', provider: 'example', text: englishTranslation }] } })
  await delay(500)
  const narrow = await window.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.nola-caption-track[data-kind="translation"]')
    const flow = track?.querySelector('.nola-caption-track-flow')
    return {
      text: track?.textContent?.replace(/\\s+/g, ' ') ?? '',
      segments: track?.querySelectorAll('.nola-caption-segment').length ?? 0,
      lines: track?.style.getPropertyValue('--nola-overlay-visible-lines'),
      rolling: track?.getAttribute('data-rolling'),
      clipped: flow instanceof HTMLElement && flow.scrollHeight > flow.clientHeight + 2,
    }
  })()`)
  expectFound('english translation segment', narrow.segments)
  expectTrue('compact English subtitle still rolls at least one line',
    narrow.text.includes(englishTranslation) && Number.parseInt(narrow.lines, 10) >= 1
    && narrow.rolling === 'true' && narrow.clipped, narrow)

  window.setSize(900, 230)
  await delay(500)
  /*
   * Bilingual is stacked, not side by side: `.nola-caption-stage` is
   * `flex-direction: column`, so the source sits above the translation. Both rects are
   * measured rather than the direction assumed, because a wrong guess fails silently.
   */
  const english = await window.webContents.executeJavaScript(`(() => {
    const source = document.querySelector('.nola-caption-track[data-kind="source"]')
    const translation = document.querySelector('.nola-caption-track[data-kind="translation"]')
    const card = document.querySelector('.nola-caption-card')
    const a = source?.getBoundingClientRect()
    const b = translation?.getBoundingClientRect()
    return {
      text: translation?.textContent?.replace(/\\s+/g, ' ') ?? '',
      segments: translation?.querySelectorAll('.nola-caption-segment').length ?? 0,
      lines: translation?.style.getPropertyValue('--nola-overlay-visible-lines'),
      stacked: Boolean(a && b) && a.top < b.top && a.bottom <= b.top + 1,
      sourceHeight: a ? Math.round(a.height) : 0,
      targetHeight: b ? Math.round(b.height) : 0,
      a: a ? { top: Math.round(a.top), bottom: Math.round(a.bottom) } : null,
      b: b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null,
      cardOverflowX: Boolean(card) && card.scrollWidth > card.clientWidth + 2,
    }
  })()`)
  expectFound('english translation segment after resize', english.segments)
  expectTrue('bilingual tracks stack and the card does not overflow',
    english.text.includes(englishTranslation) && Number.parseInt(english.lines, 10) >= 1
    && english.stacked && english.sourceHeight > 0 && english.targetHeight > 0
    && !english.cardOverflowX, english)
  await writeFile(resolve(out, 'overlay-english-translation.png'), (await window.webContents.capturePage()).toPNG())

  // -- 7. Zero opacity: the background must be truly transparent, not merely pale ---
  settings.overlay.backgroundOpacity = 0
  window.webContents.send('settings:changed', settings)
  await delay(300)
  const transparent = await window.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.nola-caption-card')
    const style = card ? getComputedStyle(card) : null
    return {
      flag: card?.getAttribute('data-transparent'),
      backgroundColor: style?.backgroundColor,
      backdropFilter: style?.backdropFilter,
      boxShadow: style?.boxShadow,
    }
  })()`)
  expectTrue('fully transparent background', transparent.flag === 'true'
    && transparent.backgroundColor === 'rgba(0, 0, 0, 0)', transparent)

  await mkdir(out, { recursive: true })
  console.log(JSON.stringify({ checks, failures }))
  window.destroy()
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
