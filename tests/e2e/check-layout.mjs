// Production renderer, deterministic IPC fixture: no devices, credentials or downloads required.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

app.disableHardwareAcceleration()
const output = resolve('artifacts/layout')
const pages = ['captions', 'recognition', 'resources', 'translation', 'appearance', 'history', 'diagnostics']
const settings = {
  version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '', historyEnabled: false,
  recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto' },
  overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 26, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, maxLines: 2, lineHeight: 1.3, translationMaxLines: 2, translationLineHeight: 1.35, showSource: true, showTranslation: true },
  translation: { provider: 'hymt2', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', translateIntermediate: false, targetLanguage: 'zh' },
}
const recognitionResource = { resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 1.7B · 本地流式识别', description: '本地流式识别模型，加载时以 NF4 4-bit 量化运行。', languages: ['zh', 'en', 'ja'], installed: true, installedBytes: 4300000000, state: 'idle', cancellable: false }
const recognitionSmallResource = { resourceId: 'qwen3-asr-0.6b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 0.6B · 本地流式识别', description: '体积更小的同系列流式识别模型。', languages: ['zh', 'en', 'ja'], installed: false, installedBytes: 0, downloadBytes: 1880619678, state: 'idle', cancellable: false }
const translationResource = { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hy-mt2', name: 'Hy-MT2 1.8B · 本地翻译模型', description: '预量化 Q4_K_M 翻译模型，在本机 llama.cpp 上运行。', languages: ['zh', 'en'], installed: true, installedBytes: 1130000000, state: 'idle', cancellable: false }
const m2m100Resource = { resourceId: 'm2m100-418m', kind: 'translationModel', provider: 'm2m100', name: 'M2M100 418M · 本地翻译模型', description: '多对多翻译模型，由 transformers 在本机运行。', languages: ['zh', 'en'], installed: false, installedBytes: 0, downloadBytes: 1941936305, state: 'idle', cancellable: false }
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
  listHistory:async()=>[], clearHistory:async()=>{},exportHistory:async()=>null,
  getDiagnostics:async()=>({'引擎状态':'ready','语音识别':'Qwen3-ASR 1.7B（nf4）','本地翻译':'Hy-MT2 · llama.cpp（cuda）','数据目录':'D:/Models/Nola Translator/very-long-folder-name-for-model-downloads'}),
  copyDiagnostics:async()=>{}, hasTranslationCredential:async()=>false,setTranslationCredential:async()=>{},
  showOverlay:async()=>{},hideOverlay:async()=>{},startSession:async()=>({sessionId:'layout'}),stopSession:async()=>{},
  resizeOverlay:async()=>{},openAppearance:async()=>{},onOpenAppearance:()=>()=>{}
});
contextBridge.exposeInMainWorld('layoutFixture', {emit: e=>eventListeners.forEach(fn=>fn(e))});
`

async function settle(window) {
  // Double rAF only waits for paint; async fixtures (getSettings/listResources/getDiagnostics) need a beat too.
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await new Promise((resolve) => setTimeout(resolve, 330))
}

// destroy() leaves this Electron build unable to load any later window (ERR_FAILED), so always close() and wait.
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
  for (const language of ['zh-CN', 'en']) {
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({uiLanguage:${JSON.stringify(language)}})`)
    for (const width of [760, 900, 901, 1100]) {
      window.setContentSize(width, 780)
      for (let index = 0; index < pages.length; index++) {
        await window.webContents.executeJavaScript(`document.querySelectorAll('.navigation-items .navigation-item')[${index}].click()`)
        await settle(window)
        const overflow = await window.webContents.executeJavaScript(`(() => {
          const containers = [...document.querySelectorAll('.page,.content,.settings-layout,.session-card,.resource-card')];
          return containers.filter(el => el.scrollWidth > el.clientWidth + 2).map(el=>({class:el.className,width:el.clientWidth,scroll:el.scrollWidth}));
        })()`)
        if (overflow.length) failures.push({ language, width, page: pages[index], overflow })
        if (width === 901 || (width === 1100 && pages[index] === 'appearance')) {
          await writeFile(resolve(output, `${language}-${width}-${pages[index]}.png`), (await window.webContents.capturePage()).toPNG())
        }
      }
    }
  }
  // Real mouse input: DOM .click() cannot detect the titlebar drag-region swallowing the language button.
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
  const menuOpened = await window.webContents.executeJavaScript(`!!document.querySelector('.language-menu')`)
  if (!menuOpened) {
    failures.push({ language: 'zh-CN', width: 1100, page: 'language-menu', reason: 'language menu did not open on real mouse click' })
  } else {
    const englishItem = await window.webContents.executeJavaScript(`(() => {
      const items = [...document.querySelectorAll('.language-menu button')]
      return items.some((el) => el.textContent.trim() === 'English')
    })()`)
    if (!englishItem) failures.push({ language: 'zh-CN', width: 1100, page: 'language-menu', reason: 'English menu item missing' })
    await clickAt('.language-menu button:last-child')
    const switched = await window.webContents.executeJavaScript(`({
      lang: document.documentElement.lang,
      firstNav: document.querySelector('.navigation-items .navigation-item')?.textContent?.trim() ?? '',
    })`)
    if (switched.lang !== 'en' || !switched.firstNav.includes('Live captions')) {
      failures.push({ language: 'en', width: 1100, page: 'language-menu', reason: 'switching to English via menu failed', switched })
    }
    await clickAt('.language-button')
    await clickAt('.language-menu button:first-child')
    const restored = await window.webContents.executeJavaScript(`document.documentElement.lang`)
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
      hasZh: text.includes('我们可能会意识到'), hasJa: text.includes('気づくかもしれません'),
      overflow: panel && panel.scrollWidth > panel.clientWidth + 2,
    }
  })()`)
  if (!overlayState.hasZh || !overlayState.hasJa || overlayState.overflow) failures.push({ language: 'overlay', page: 'multitarget', overlayState })
  // 换句滚动动画中间帧：旧句仍在离场、新句正在滚入。
  const nextSegment = { ...segment, segmentId: 'after-roll', revision: 1, startedAtMs: 4000, sourceText: 'Rest is not a luxury; it is how people recover attention and keep making good decisions.', translations: segment.translations }
  await overlay.webContents.executeJavaScript(`window.layoutFixture.emit(${JSON.stringify({ protocolVersion: 1, type: 'caption', requestId: 'qa2', sessionId: 'layout', segment: nextSegment })})`)
  await new Promise((resolve) => setTimeout(resolve, 110))
  const rolling = await overlay.webContents.executeJavaScript(`({
    leaving: document.querySelectorAll('.overlay-track-source .overlay-track-out').length,
    active: document.querySelectorAll('.overlay-track-source .overlay-track-in').length,
    oldVisible: (document.querySelector('.overlay-track-source .overlay-track-out')?.textContent ?? '').includes('We might realize'),
    translationHeld: (document.querySelector('.overlay-track-translation .overlay-track-in')?.textContent ?? '').includes('我们可能会意识到'),
  })`)
  if (rolling.leaving !== 1 || rolling.active !== 1 || !rolling.oldVisible || !rolling.translationHeld) failures.push({ language: 'overlay', page: 'roll-transition', rolling })
  await writeFile(resolve(output, 'overlay-roll-transition.png'), (await overlay.webContents.capturePage()).toPNG())
  await new Promise((resolve) => setTimeout(resolve, 300))
  const settled = await overlay.webContents.executeJavaScript(`document.querySelectorAll('.overlay-track-source .overlay-track-in').length`)
  if (settled !== 1) failures.push({ language: 'overlay', page: 'roll-settled', rows: settled })
  await writeFile(resolve(output, 'overlay-bilingual.png'), (await overlay.webContents.capturePage()).toPNG())
  await overlay.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({overlay:{fontSize:72,translationFontSize:72,locked:false}})`)
  await settle(overlay)
  const largeState = await overlay.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.caption-console')
    return { overflowX: !!panel && panel.scrollWidth > panel.clientWidth + 2, overflowY: !!panel && panel.scrollHeight > panel.clientHeight + 2 }
  })()`)
  if (largeState.overflowX || largeState.overflowY) failures.push({ language: 'overlay', page: 'large-font', largeState })
  await writeFile(resolve(output, 'overlay-large-adjusting.png'), (await overlay.webContents.capturePage()).toPNG())
  await closeWindow(overlay)
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ scenarios: 56, failures }, null, 2))
  console.log(JSON.stringify({ scenarios: 56, failures }))
  app.exit(failures.length ? 1 : 0)
}
app.whenReady().then(main).catch(error => { console.error(error); app.exit(1) })
