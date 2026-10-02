// Runs the production renderer against a stub preload, so no engine, devices, credentials or downloads are needed.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

app.disableHardwareAcceleration()
const output = resolve('artifacts/layout')
const pages = ['captions', 'recognition', 'resources', 'translation', 'appearance', 'history', 'diagnostics']
// Bind navigation by visible label, never by DOM index: reordering or inserting a nav item used to
// check the wrong page while the run still reported success. tests/unit/renderer/overlay-controls.test.tsx
// says the same thing about selector bindings in this codebase.
const pageLabels = {
  'zh-CN': ['实时字幕', '语音识别', '模型与资源', '翻译', '外观', '会议记录', '诊断'],
  en: ['Live captions', 'Speech recognition', 'Models & Resources', 'Translation', 'Appearance', 'Meetings', 'Diagnostics'],
}
const settings = {
  version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '',
  recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto', audioSource: 'defaultOutput' },
  overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 26, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, lineHeight: 1.3, translationLineHeight: 1.35, showSource: true, showTranslation: true, layout: 'rolling' },
  translation: { provider: 'hymt2', hymt2ModelId: 'hy-mt2-1.8b-q3-k-m', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', translateIntermediate: false, targetLanguage: 'zh' },
}
const recognitionResource = { resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 1.7B · 本地流式识别', description: '本地流式识别模型，加载时以 NF4 4-bit 量化运行。', languages: ['zh', 'en', 'ja'], installed: true, installedBytes: 4300000000, state: 'idle', cancellable: false }
const recognitionSmallResource = { resourceId: 'qwen3-asr-0.6b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 0.6B · 本地流式识别', description: '体积更小的同系列流式识别模型。', languages: ['zh', 'en', 'ja'], installed: false, installedBytes: 0, downloadBytes: 1880619678, state: 'idle', cancellable: false }
const translationResource = { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hy-mt2', name: 'Hy-MT2 1.8B · 本地翻译模型', description: '预量化 Q4_K_M 翻译模型，在本机 llama.cpp 上运行。', languages: ['zh', 'en'], installed: true, installedBytes: 1130000000, state: 'idle', cancellable: false }
const m2m100Resource = { resourceId: 'm2m100-418m', kind: 'translationModel', provider: 'm2m100', name: 'M2M100 418M · 本地翻译模型', description: '多对多翻译模型，由 transformers 在本机运行。', languages: ['zh', 'en'], installed: false, installedBytes: 0, downloadBytes: 1941936305, state: 'idle', cancellable: false }
const meetingLongTitle = '2026年09月29日_产品评审与跨部门对齐会议纪要以及下一阶段里程碑确认'
const meetingFixtures = [
  { meetingId: 'm-finished', title: meetingLongTitle, titleIsCustom: true, startedAtMs: 1788000000000, endedAtMs: 1788000043000, durationMs: 43000, daySequence: 0, segmentCount: 3, sourceLanguage: 'auto', targetLanguage: 'zh', audioFile: 'audio.wav', audioDurationMs: 43000 },
  { meetingId: 'm-live', title: '', titleIsCustom: false, startedAtMs: 1788000500000, durationMs: 9500, daySequence: 1, segmentCount: 1, sourceLanguage: 'auto', targetLanguage: 'zh' },
]
const meetingSegments = [
  { segmentId: 's1', revision: 1, startedAtMs: 0, endedAtMs: 20000, sourceText: 'But if you totally Frank the magic of Tesla Shanghai is because of Chinese and be totally be honest in China at least it is yes what we have is but has such China team is just incredibly talented and hardworking and trustworthy. They have the quality is excellent and the efficiency is excellent.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '但如果你完全坦率地说，特斯拉的魔力，上海是因为中国人，完全是因为在中国，至少我们，有这样的中国团队是令人难以置信的人才，勤奋和值得信赖的，他们有。质量很好，效率也很好。所以它有上海工厂，A:是一颗宝石，你知道它很漂亮，它实际上很漂亮，如果有人去过那里的话。', state: 'complete', provider: 'hymt2' }] },
  { segmentId: 's2', revision: 1, startedAtMs: 20500, endedAtMs: 43000, sourceText: 'So it has the Shanghai factory, a is a gem and it is beautiful actually if anyone has ever been there, we also care a lot about taking care of the workers and making sure that good health care and good food.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '所以它有上海工厂，A:是一颗宝石，你知道它很漂亮，它实际上很漂亮，如果有人去过那里的话。我们也很关心照顾工人，并确保这一点。良好的医疗保健和良好的食物。', state: 'complete', provider: 'hymt2' }] },
]
const preloadSource = `
const {contextBridge} = require('electron');
let settings = ${JSON.stringify(settings)};
const settingsListeners = new Set(), eventListeners = new Set();
const update = async (patch) => {
  settings = {...settings, ...patch, recognition:{...settings.recognition,...patch.recognition}, overlay:{...settings.overlay,...patch.overlay}, translation:{...settings.translation,...patch.translation}};
  settingsListeners.forEach(fn=>fn(settings)); return settings;
};
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings:async()=>settings, updateSettings:update,
  onSettingsChanged:fn=>{settingsListeners.add(fn); return ()=>settingsListeners.delete(fn)},
  onEngineEvent:fn=>{eventListeners.add(fn); return ()=>eventListeners.delete(fn)},
  listDevices:async()=>[], listResources:async()=>({storagePath:'D:/Models/Nola Translator/very-long-folder-name-for-model-downloads/models',resources:[${JSON.stringify(recognitionResource)},${JSON.stringify(recognitionSmallResource)},${JSON.stringify(translationResource)},${JSON.stringify(m2m100Resource)}]}),
  getModelStorage:async()=>({activePath:'D:/Models/Nola Translator', configuredPath:'E:/Downloads/models-and-translation-packages/another-long-directory',restartRequired:true}),
  chooseModelStorageDirectory:async()=>null, restartApp:async()=>{},
  listMeetings:async()=>${JSON.stringify(meetingFixtures)},
  getMeeting:async id=>${JSON.stringify(meetingFixtures)}.find(m=>m.meetingId===id)??null,
  readMeeting:async()=>${JSON.stringify(meetingSegments)},
  renameMeeting:async(id,title)=>Object.assign({},${JSON.stringify(meetingFixtures)}.find(m=>m.meetingId===id)??{meetingId:id},{title,titleIsCustom:true}),
  deleteMeeting:async()=>true,
  exportMeeting:async()=>'D:/exports/meeting.srt',
  getMeetingAudioUrl:async id=>(${JSON.stringify(meetingFixtures)}.find(m=>m.meetingId===id)?.audioFile?'nola-audio://local/'+id+'/audio.wav':null),
  getDiagnostics:async()=>({'引擎状态':'ready','语音识别':'Qwen3-ASR 1.7B（nf4）','本地翻译':'Hy-MT2 · llama.cpp（cuda）','数据目录':'D:/Models/Nola Translator/very-long-folder-name-for-model-downloads'}),
  copyDiagnostics:async()=>{}, hasTranslationCredential:async()=>false,setTranslationCredential:async()=>{},
  showOverlay:async()=>{},hideOverlay:async()=>{},startSession:async()=>({sessionId:'layout',meetingId:'m-live'}),stopSession:async()=>{},
  resizeOverlay:async()=>{},openAppearance:async()=>{},onOpenAppearance:()=>()=>{}
});
contextBridge.exposeInMainWorld('layoutFixture', {emit: e=>eventListeners.forEach(fn=>fn(e))});
`

// The detail view is a child of the list, so a broken back button would strand the rest of the run
// on a page it can no longer navigate away from. Assert the return trip instead of assuming it.
async function clickBack(window) {
  return window.webContents.executeJavaScript(`(() => {
    const back = document.querySelector('.meeting-detail-header .icon-button');
    if (!back) return false;
    back.click(); return true;
  })()`)
}

async function settle(window) {
  // Double rAF only covers paint; the async fixture calls (getSettings/listResources/getDiagnostics) need extra time.
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await new Promise((resolve) => setTimeout(resolve, 330))
}

// Never destroy(): this Electron build fails to load any later window (ERR_FAILED). Always close() and wait.
function closeWindow(window) {
  return new Promise((resolve) => {
    if (window.isDestroyed()) { resolve(); return }
    window.once('closed', resolve)
    window.close()
  })
}

async function main() {
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)
  const window = new BrowserWindow({ width: 1180, height: 780, show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
  await window.loadFile(resolve('out/renderer/index.html'))
  const failures = []
  let scenarios = 0
  const overflowOf = async (page) => {
    scenarios += 1
    return window.webContents.executeJavaScript(`(() => {
      const containers = [...document.querySelectorAll('.page,.content,.settings-layout,.session-card,.resource-card,.meeting-page,.meeting-panes,.meeting-pane,.meeting-player')];
      return containers.filter(el => el.scrollWidth > el.clientWidth + 2).map(el=>({class:el.className,width:el.clientWidth,scroll:el.scrollWidth}));
    })()`)
  }
  for (const language of ['zh-CN', 'en']) {
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({uiLanguage:${JSON.stringify(language)}})`)
    for (const width of [760, 900, 901, 1100]) {
      window.setContentSize(width, 780)
      for (let index = 0; index < pages.length; index++) {
        await window.webContents.executeJavaScript(`(() => {
          const label = ${JSON.stringify(pageLabels[language][index])};
          const item = [...document.querySelectorAll('.navigation-items .navigation-item')].find(node => node.textContent.trim() === label);
          if (!item) throw new Error('navigation item not found: ' + label);
          item.click();
        })()`)
        await settle(window)
        const overflow = await overflowOf(pages[index])
        if (overflow.length) failures.push({ language, width, page: pages[index], overflow })
        if (width === 901 || (width === 1100 && pages[index] === 'appearance')) {
          await writeFile(resolve(output, `${language}-${width}-${pages[index]}.png`), (await window.webContents.capturePage()).toPNG())
        }
        if (pages[index] !== 'history') continue
        // The meetings list is only half the feature: open the detail view too, where a long meeting
        // name, the two text columns, the divider and the audio player all have to fit.
        const opened = await window.webContents.executeJavaScript(`(() => {
          const name = document.querySelector('.meeting-title-button');
          if (!name) return false;
          name.click(); return true;
        })()`)
        if (!opened) { failures.push({ language, width, page: 'meeting-detail', reason: 'no meeting row was clickable' }); continue }
        await settle(window)
        const detailOverflow = await overflowOf('meeting-detail')
        if (detailOverflow.length) failures.push({ language, width, page: 'meeting-detail', overflow: detailOverflow })
        // Horizontal overflow alone cannot see a wrapped pane: a two-column grid holding three
        // children pushes 译文 into a second row under 原文 and leaves the right half empty, with
        // every container still fitting its width. Compare the boxes instead.
        const paneLayout = await window.webContents.executeJavaScript(`(() => {
          const panes = document.querySelector('.meeting-panes');
          if (!panes) return null;
          const [source, divider, target] = [...panes.children];
          if (!source || !divider || !target) return null;
          const a = source.getBoundingClientRect(), b = target.getBoundingClientRect();
          return {
            columns: getComputedStyle(panes).gridTemplateColumns.split(' ').length,
            sameRow: Math.abs(a.top - b.top) < 4,
            sideBySide: a.right <= b.left + 1,
            sourceWidth: Math.round(a.width), targetWidth: Math.round(b.width),
          };
        })()`)
        scenarios += 1
        if (!paneLayout || paneLayout.columns !== 3 || !paneLayout.sameRow || !paneLayout.sideBySide
          || paneLayout.sourceWidth < 40 || paneLayout.targetWidth < 40) {
          failures.push({ language, width, page: 'meeting-detail-panes', paneLayout })
        }
        if (width === 1100) await writeFile(resolve(output, `${language}-${width}-meeting-detail.png`), (await window.webContents.capturePage()).toPNG())
        const wentBack = await clickBack(window)
        await settle(window)
        scenarios += 1
        const backAtList = await window.webContents.executeJavaScript(`!document.querySelector('.meeting-detail-page') && !!document.querySelector('.meeting-page')`)
        if (!wentBack || !backAtList) failures.push({ language, width, page: 'meeting-back', wentBack, backAtList })
      }
    }
  }
  // Real mouse input: DOM .click() cannot reveal the titlebar drag-region swallowing the language button.
  window.setContentSize(1100, 780)
  await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({uiLanguage:'zh-CN'})`)
  await settle(window)
  const clickAt = async (selector) => {
    const point = await window.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (!point) return false
    await window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    await window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await settle(window)
    return true
  }
  await clickAt('.language-button')
  scenarios += 1
  const menuOpened = await window.webContents.executeJavaScript(`!!document.querySelector('.language-menu')`)
  if (!menuOpened) {
    failures.push({ language: 'zh-CN', width: 1100, page: 'language-menu', reason: 'language menu did not open on real mouse click' })
  } else {
    const englishItem = await window.webContents.executeJavaScript(`(() => {
      const items = [...document.querySelectorAll('.language-menu button')]
      return items.some((el) => el.textContent.trim() === 'English')
    })()`)
    if (!englishItem) failures.push({ language: 'zh-CN', width: 1100, page: 'language-menu', reason: 'English menu item missing' })
    scenarios += 1
    await clickAt('.language-menu button:last-child')
    const switched = await window.webContents.executeJavaScript(`({
      lang: document.documentElement.lang,
      firstNav: document.querySelector('.navigation-items .navigation-item')?.textContent?.trim() ?? '',
    })`)
    scenarios += 1
    if (switched.lang !== 'en' || !switched.firstNav.includes('Live captions')) {
      failures.push({ language: 'en', width: 1100, page: 'language-menu', reason: 'switching to English via menu failed', switched })
    }
    await clickAt('.language-button')
    await clickAt('.language-menu button:first-child')
    const restored = await window.webContents.executeJavaScript(`document.documentElement.lang`)
    scenarios += 1
    if (restored !== 'zh-CN') failures.push({ language: 'zh-CN', width: 1100, page: 'language-menu', reason: 'switching back to Chinese failed', restored })
  }
  await closeWindow(window)
  const overlay = new BrowserWindow({ width: 880, height: 260, show: false, transparent: true, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
  await overlay.loadFile(resolve('out/renderer/index.html'), { query: { overlay: '1' } })
  await settle(overlay)
  const segment = { segmentId: 'current', revision: 1, startedAtMs: 0, isFinal: true, sourceText: 'We might realize that doing nothing is not only okay, but also important for a healthy, balanced life.', translations: [
    { targetLanguage: 'zh', text: '我们可能会意识到，适当放松不仅没有问题，也对健康、平衡的生活十分重要。', state: 'complete', provider: 'hymt2' },
    { targetLanguage: 'ja', text: '何もしないことも問題ではないし、健康でバランスの取れた生活に重要だと気づくかもしれません。', state: 'complete', provider: 'hymt2' },
  ] }
  await overlay.webContents.executeJavaScript(`window.layoutFixture.emit(${JSON.stringify({ protocolVersion: 1, type: 'caption', requestId: 'qa', sessionId: 'layout', segment })})`)
  await settle(overlay)
  const overlayState = await overlay.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.caption-console')
    const text = panel?.innerText ?? ''
    return {
      hasZh: text.includes('平衡的生活十分重要'), hasJa: text.includes('づくかもしれません'),
      overflow: panel && panel.scrollWidth > panel.clientWidth + 2,
    }
  })()`)
  scenarios += 1
  if (!overlayState.hasZh || !overlayState.hasJa || overlayState.overflow) failures.push({ language: 'overlay', page: 'multitarget', overlayState })
  // The next sentence must extend the same block instead of replacing it: the finished sentences stay
  // in the flow, the block rolls upward, and the translation keeps its own lag.
  const nextSegment = { ...segment, segmentId: 'after-roll', revision: 1, startedAtMs: 4000, sourceText: 'Rest is not a luxury; it is how people recover attention and keep making good decisions.', translations: segment.translations }
  await overlay.webContents.executeJavaScript(`window.layoutFixture.emit(${JSON.stringify({ protocolVersion: 1, type: 'caption', requestId: 'qa2', sessionId: 'layout', segment: nextSegment })})`)
  await new Promise((resolve) => setTimeout(resolve, 110))
  const rolling = await overlay.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.overlay-track-source')
    const content = track?.querySelector('.overlay-track-content')
    const flow = track?.querySelector('.overlay-track-flow')
    return {
      entries: track?.querySelectorAll('.overlay-track-entry').length ?? 0,
      kept: (track?.textContent ?? '').includes('balanced life.'),
      translationEntries: document.querySelectorAll('.overlay-track-translation .overlay-track-entry').length,
      translationHeld: (document.querySelector('.caption-console-translations')?.textContent ?? '').includes('平衡的生活十分重要'),
      shifted: content instanceof HTMLElement && flow instanceof HTMLElement
        && content.getBoundingClientRect().top < flow.getBoundingClientRect().top,
      rolling: track?.dataset.rolling,
    }
  })()`)
  // `shifted` is the geometry of the roll itself — the content block translated above the flow top —
  // and `rolling` is the component's own overflow flag. Without both, a regression that stops the
  // block from translating upward would still pass, because every other field is DOM structure.
  scenarios += 1
  if (rolling.entries !== 2 || !rolling.kept || rolling.translationEntries !== 2 || !rolling.translationHeld
    || !rolling.shifted || rolling.rolling !== 'true') {
    failures.push({ language: 'overlay', page: 'roll-up', rolling })
  }
  await writeFile(resolve(output, 'overlay-roll-transition.png'), (await overlay.webContents.capturePage()).toPNG())
  await new Promise((resolve) => setTimeout(resolve, 300))
  const settled = await overlay.webContents.executeJavaScript(`document.querySelectorAll('.overlay-track-source .overlay-track-entry').length`)
  scenarios += 1
  if (settled !== 2) failures.push({ language: 'overlay', page: 'roll-settled', rows: settled })
  await writeFile(resolve(output, 'overlay-bilingual.png'), (await overlay.webContents.capturePage()).toPNG())
  await overlay.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({overlay:{fontSize:72,translationFontSize:72,locked:false}})`)
  await settle(overlay)
  const largeState = await overlay.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.caption-console')
    return { overflowX: !!panel && panel.scrollWidth > panel.clientWidth + 2, overflowY: !!panel && panel.scrollHeight > panel.clientHeight + 2 }
  })()`)
  scenarios += 1
  if (largeState.overflowX || largeState.overflowY) failures.push({ language: 'overlay', page: 'large-font', largeState })
  await writeFile(resolve(output, 'overlay-large-adjusting.png'), (await overlay.webContents.capturePage()).toPNG())
  await closeWindow(overlay)
  // Counted as the run goes: a hard-coded total silently stops describing what was verified.
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ scenarios, failures }, null, 2))
  console.log(JSON.stringify({ scenarios, failures }))
  app.exit(failures.length ? 1 : 0)
}
app.whenReady().then(main).catch(error => { console.error(error); app.exit(1) })
