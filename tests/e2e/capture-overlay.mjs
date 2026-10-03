/*
 * 悬浮字幕窗的截图 + 版式门禁。
 *
 * 走的是**真实 preload**（`out/preload/index.cjs`）而不是夹具：这扇窗的很多行为
 * 就在桥接的另一头（关窗、停会话、真最小化），夹具 preload 测不到。引擎事件用
 * `webContents.send('engine:event', ...)` 灌进来，等价于引擎在说话。
 *
 * ⚠️ 与 check-layout.mjs 同一条纪律：每一个"用来查找的容器列表"都必须先断言数量 > 0。
 * 查不到就是 FAIL，不能当成"这一版没有这块内容，跳过"。旧版就是用旧类名
 * querySelectorAll 拿到空数组，然后把"没查到"当成"没问题"报了绿灯。
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
    provider: 'hymt2', hymt2ModelId: 'hy-mt2-1.8b-q3-k-m', targetLanguage: 'zh',
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '',
    openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini',
    ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', translateIntermediate: false,
  },
}

let failures = 0
let checks = 0
/** 查不到就算失败。`label` 会进错误信息。 */
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
  // 只有设置这一条通道是这扇窗真正要用的；其余 invoke 会 reject 并落进 store.error，
  // 浮窗不读 meetings / models，所以不影响这里的断言。
  ipcMain.handle('app:get-settings', () => settings)
  ipcMain.handle('app:update-settings', () => settings)
  const window = new BrowserWindow({
    width: 900, height: 218, show: false, frame: false, transparent: true,
    webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), contextIsolation: true, sandbox: true },
  })
  windowRef = window
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { query: { overlay: '1' } })
  // 必须显示：`.nola-caption-track-content` 有 320ms 的 transform 过渡，隐藏窗的 rAF
  // 被节流，动画不推进，上滚断言会读到一个假的 0。
  window.showInactive()
  await delay(500)

  // -- 1. 空态：结构必须真的在 -----------------------------------------------------
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

  // -- 2. 第一句：两条轨道都有内容，且都不是空的 ------------------------------------
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
  // 行预算：两条轨道都必须至少分到 1 行，否则字幕根本没地方显示。
  expectTrue('line budget', Number.parseInt(first.sourceLines, 10) >= 1 && Number.parseInt(first.targetLines, 10) >= 1,
    { sourceLines: first.sourceLines, targetLines: first.targetLines })
  await writeFile(resolve(out, 'overlay-console.png'), (await window.webContents.capturePage()).toPNG())

  // -- 3. 第二句：修订（未确认）不应把整块换掉 ------------------------------------
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 1, startedAtMs: 2000, isFinal: true, sourceText: 'Taking a break is important for a healthy, balanced life.', translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '休息对健康而平衡的生活很重要。' }] } })
  await delay(70)
  await writeFile(resolve(out, 'overlay-source-transition.png'), (await window.webContents.capturePage()).toPNG())
  await delay(110)
  await writeFile(resolve(out, 'overlay-translation-transition.png'), (await window.webContents.capturePage()).toPNG())

  // -- 4. 只显示原文：译文轨道必须真的消失，而不是"变空" ---------------------------
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

  // -- 5. 未确认句段：原文继续上滚，且位移正好等于超出高度 --------------------------
  // 先把字号推到 40/34：这块玻璃只有 218px 高，17px 的正文才两三行，**装得下就不滚**，
  // "没滚"和"滚坏了"在断言里长得一模一样。必须先造出一个真的装不下的局面。
  settings.overlay.fontSize = 40
  settings.overlay.translationFontSize = 34
  window.webContents.send('settings:changed', settings)
  await delay(300)
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 2, startedAtMs: 2000, isFinal: false, sourceText: 'Taking a break is important for a healthy, balanced life. We can return to our work with a clearer mind and more energy than before.', translations: [{ targetLanguage: 'zh', state: 'pending', provider: 'example' }] } })
  await delay(70)
  await writeFile(resolve(out, 'overlay-line-roll.png'), (await window.webContents.capturePage()).toPNG())
  // 320ms 过渡跑完再量（见文件头：过渡途中读计算值拿到的是起点矩阵）。
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

  // -- 6. 大字号 + 只放得下一行的轨道：尾巴必须滚出视野，而不是把卡片撑高 -----------
  settings.overlay.fontSize = 28
  settings.overlay.translationFontSize = 22
  window.webContents.send('settings:changed', settings)
  // 把玻璃压矮，行预算才会掉到 1 行。**装得下就不滚**，所以"没滚"和"滚坏了"在断言里
  // 长得一模一样 —— 这一步必须先造出一个真的装不下的局面，否则断言是空的。
  //
  // 160 是 28/22 号字下**合法**的下限再加一点余量：`overlayMinimumHeight` 算出 153
  // （= 2 × max(36.4, 29.7) + 6 gap + 60 上下 padding + 12 卡片内缩 + 2 slack）。
  // 原来这里写的是 130 —— 那时公式还没算卡片那 6px 内缩，130 刚好还在线下一点点，
  // 译文轨道能分到 1 行；内缩一加，130 就掉到 0 行了。真窗走的是 `setMinimumSize`，
  // 用户根本进不了 130，所以这个数当时就是个只存在于测试里的非法高度。
  window.setSize(900, 160)
  await delay(400)
  /*
   * 上一幕留了一条**未确认**句段，而 OverlayRoot 是 `session.interim ?? segments.at(-1)`：
   * interim 优先，不先把它确认掉，后面那条英文 final 永远轮不到当"当前句"。
   * 同 segmentId 的 final 到达时 `appendFinal` 才会清掉 interim —— 走别的 id 清不掉。
   */
  await emit(window, 'caption', { segment: { segmentId: 'preview-next', revision: 3, startedAtMs: 2000, isFinal: true, sourceText: 'Taking a break is important for a healthy, balanced life.', translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '休息对健康而平衡的生活很重要。' }] } })
  await delay(200)
  const englishTranslation = 'In addition, several models have prices before and after the national subsidy limits being very similar.'
  await emit(window, 'caption', { segment: { segmentId: 'preview-english', revision: 1, startedAtMs: 3000, isFinal: true, sourceText: '另外还有几台机型，国补前后的价格非常接近。', translations: [{ targetLanguage: 'en', state: 'complete', provider: 'example', text: englishTranslation }] } })
  await delay(500)
  /*
   * 一行高的轨道要装下整句，并把尾巴滚出视野。所以"只放得下一行"仍然必须成立：
   * 可见行数 >= 1、这条译文仍在流里、且 data-rolling 标成 true。
   */
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
   * 双语**上下堆叠**：`.nola-caption-stage` 就是 `flex-direction: column`，原文在上、译文在下。
   * `caption-card.css` 里那段注释写得很清楚 —— 左右分栏曾经存在，因为"940×104 的窗高"
   * 是个错的数字而删掉了；字幕窗默认 218px，扣掉 stage 的 22/38px padding 还剩 158px，
   * 上下堆叠够读。
   *
   * ⚠️ `OverlayRoot.tsx` 的文件头注释还写着"双语模式下两条轨道左右分栏"，**那一句已经过时**，
   * 与 CSS 相反。以 CSS 为准。
   * （判据别照着 OverlayRoot 的注释写 —— 我第一版就是照它写的左右分栏，然后稳定地红。
   *   实测：stage 901×230，stageDir=column，原文 top22/bottom95、译文 top101/bottom160。）
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

  // -- 7. 零不透明度：背景必须真的透明，而不是"看起来很淡" -------------------------
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
