/*
 * Layout acceptance gate (`npm run test:layout`). Runs the built renderer with a
 * stubbed preload, so it needs no engine, microphone, model or network.
 *
 * The page list is maintained by hand. Each entry asserts the `data-page` the
 * route root actually renders, so a route that moves fails here instead of
 * quietly dropping out of the run.
 *
 * Every lookup container carries a `min`. A `querySelectorAll` that matches
 * nothing leaves the overflow checks vacuously green, so an empty match is a
 * failure rather than a skipped page section.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

app.disableHardwareAcceleration()
const output = resolve('artifacts/layout')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const SETTINGS_TABS = ['general', 'audio', 'translation', 'appearance', 'storage', 'browser', 'advanced']

/** Each entry names the `data-page` its route root renders, which is what the run asserts; the settings tabs all collapse to `settings`. */
const PAGES = [
  { name: 'home', hash: '#/' },
  { name: 'workspace', hash: '#/workspace' },
  { name: 'overlay', hash: '#/overlay' },
  { name: 'records', hash: '#/records' },
  { name: 'models', hash: '#/models' },
  ...SETTINGS_TABS.map((tab) => ({ name: `settings/${tab}`, hash: `#/settings/${tab}`, page: 'settings' })),
  { name: 'record-detail', hash: '#/records/m-finished', page: 'record' },
]

/** 760 is the window's minWidth; 900/901 straddle the settings page's 850px stack breakpoint, 1100 sits on its 1100px one. */
const WIDTHS = [760, 900, 901, 1100]
const HEIGHT = 780

/** The shell present on every route; one nav button per entry in main.tsx's navigation array. */
const SHELL_GROUPS = [
  { name: 'app-shell', selector: '.nola-app-shell', min: 1 },
  { name: 'titlebar', selector: '.nola-titlebar', min: 1 },
  { name: 'sidebar-nav', selector: '.nola-sidebar-nav', min: 1 },
  { name: 'nav-button', selector: '.nola-sidebar-nav .nola-nav-button', min: 6 },
  { name: 'main', selector: '.nola-main', min: 1 },
  { name: 'route-content', selector: '.nola-main .nola-route-content', min: 1 },
]

/** Shell containers that break sideways first when the window is too narrow. */
const SHELL_OVERFLOW = [
  { name: 'main', selector: '.nola-main', min: 1 },
  { name: 'sidebar', selector: '.nola-sidebar', min: 1 },
  { name: 'titlebar', selector: '.nola-titlebar', min: 1 },
  { name: 'nav-button', selector: '.nola-nav-button', min: 6 },
  { name: 'nav-label', selector: '.nola-nav-label', min: 6 },
  { name: 'route-content', selector: '.nola-route-content', min: 1 },
]

/** The page's own content; too few means a section failed to render. */
const PAGE_GROUPS = {
  home: [
    { name: 'home', selector: '.nola-home', min: 1 },
    { name: 'hero', selector: '.nola-home-hero', min: 1 },
    { name: 'entry-card', selector: '.nola-home__entries .nola-entry', min: 4 },
    { name: 'recent', selector: '.nola-home__recent', min: 1 },
    { name: 'recent-table', selector: '.nola-home__recent .nola-records-table', min: 1 },
  ],
  workspace: [
    { name: 'workspace', selector: '.nola-workspace', min: 1 },
    { name: 'heading', selector: '.nola-workspace-heading', min: 1 },
    { name: 'toolbar', selector: '[data-slot="workspace-toolbar"]', min: 1 },
    { name: 'toolbar-segmented', selector: '.nola-workspace-toolbar .nola-segmented', min: 1 },
    { name: 'body', selector: '.nola-workspace-body', min: 1 },
    { name: 'transcript', selector: '.nola-workspace-transcript', min: 1 },
  ],
  overlay: [
    { name: 'overlay-page', selector: '.nola-overlay-page', min: 1 },
    { name: 'preview-card', selector: '.nola-overlay-preview', min: 1 },
    { name: 'caption-preview', selector: '.nola-caption-preview', min: 1 },
    { name: 'preview-source', selector: '.nola-caption-preview__source', min: 1 },
    { name: 'preview-translation', selector: '.nola-caption-preview__translation', min: 1 },
    { name: 'overlay-field', selector: '.nola-overlay-fields .nola-overlay-field', min: 4 },
  ],
  records: [
    { name: 'record-page', selector: '.nola-record-page', min: 1 },
    { name: 'record-card', selector: '.nola-record-page .nola-record-card', min: 1 },
    { name: 'records-table', selector: '.nola-records-table', min: 1 },
    // RecordsTable stamps each row `data-testid="recent-<meetingId>"`, and the fixture holds two meetings.
    { name: 'record-row', selector: '[data-testid^="recent-m-"]', min: 2 },
    { name: 'open-meeting', selector: '.nola-records-table__open', min: 2 },
  ],
  record: [
    { name: 'record-detail', selector: '.nola-record-detail', min: 1 },
    { name: 'back', selector: '.nola-record-detail__back', min: 1 },
    { name: 'reading-card', selector: '.nola-record-detail__reading', min: 1 },
    { name: 'dual', selector: '.nola-dual', min: 1 },
    { name: 'dual-headers', selector: '.nola-dual__headers', min: 1 },
    { name: 'dual-scroll', selector: '.nola-dual__scroll', min: 1 },
    // One pair per segment; the fixture's meeting has two.
    { name: 'dual-pair', selector: '.nola-dual__scroll .nola-dual__pair', min: 2 },
    { name: 'audio-player', selector: '.nola-record-audio', min: 1 },
  ],
  models: [
    { name: 'models-page', selector: '.models-page', min: 1 },
    { name: 'overview', selector: '.models-overview', min: 1 },
    { name: 'current-model', selector: '.models-current', min: 2 },
    { name: 'tabs', selector: '.models-tabs', min: 1 },
    { name: 'models-grid', selector: '.models-grid', min: 1 },
    { name: 'model-card', selector: '.models-grid .models-card', min: 4 },
    { name: 'storage-card', selector: '.models-storage', min: 1 },
  ],
  settings: [
    { name: 'settings-page', selector: '.settings-page', min: 1 },
    { name: 'settings-tabs', selector: '.settings-tabs', min: 1 },
    { name: 'settings-nav', selector: '.settings-nav', min: 1 },
    // Every tab stays mounted, so the count is the same whichever one is active.
    { name: 'settings-tab', selector: '.settings-nav [role="tab"]', min: 7 },
    { name: 'settings-panels', selector: '.settings-panels', min: 1 },
    { name: 'settings-group', selector: '.settings-panels .settings-group', min: 1 },
  ],
}

const MEETING_LONG_TITLE = '2026年09月29日_产品评审与跨部门对齐会议纪要以及下一阶段里程碑确认'
const MEETINGS = [
  { meetingId: 'm-finished', title: MEETING_LONG_TITLE, titleIsCustom: true, startedAtMs: 1788000000000, endedAtMs: 1788000043000, durationMs: 43000, daySequence: 0, segmentCount: 3, sourceLanguage: 'auto', targetLanguage: 'zh', audioFile: 'audio.wav', audioDurationMs: 43000, notes: '' },
  { meetingId: 'm-live', title: '', titleIsCustom: false, startedAtMs: 1788000500000, durationMs: 9500, daySequence: 1, segmentCount: 1, sourceLanguage: 'auto', targetLanguage: 'zh', notes: '' },
]
const SEGMENTS = [
  { segmentId: 's1', revision: 1, startedAtMs: 0, endedAtMs: 20000, sourceText: 'But if you totally Frank the magic of Tesla Shanghai is because of Chinese and be totally be honest in China at least it is yes what we have is but has such China team is just incredibly talented and hardworking and trustworthy. They have the quality is excellent and the efficiency is excellent.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '但如果你完全坦率地说，特斯拉的魔力，上海是因为中国人，完全是因为在中国，至少我们，有这样的中国团队是令人难以置信的人才，勤奋和值得信赖的，他们有。质量很好，效率也很好。所以它有上海工厂，A:是一颗宝石，你知道它很漂亮，它实际上很漂亮，如果有人去过那里的话。', state: 'complete', provider: 'hymt2' }] },
  { segmentId: 's2', revision: 1, startedAtMs: 20500, endedAtMs: 43000, sourceText: 'So it has the Shanghai factory, a is a gem and it is beautiful actually if anyone has ever been there, we also care a lot about taking care of the workers and making sure that good health care and good food.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '所以它有上海工厂，A:是一颗宝石，你知道它很漂亮，它实际上很漂亮，如果有人去过那里的话。我们也很关心照顾工人，并确保这一点。良好的医疗保健和良好的食物。', state: 'complete', provider: 'hymt2' }] },
]
const RESOURCES = {
  storagePath: 'D:/Models/Nola Translator/very-long-folder-name-for-model-downloads/models',
  resources: [
    { resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 1.7B', description: '本地流式识别模型，加载时以 NF4 4-bit 量化运行。', languages: ['zh', 'en', 'ja'], installed: true, installedBytes: 4300000000, state: 'idle', cancellable: false },
    { resourceId: 'qwen3-asr-0.6b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 0.6B', description: '体积更小的同系列流式识别模型。', languages: ['zh', 'en', 'ja'], installed: false, installedBytes: 0, downloadBytes: 1880619678, state: 'idle', cancellable: false },
    { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2 1.8B Q4_K_M', description: '预量化 Q4_K_M 翻译模型，在本机 llama.cpp 上运行。', languages: ['zh', 'en'], installed: true, installedBytes: 1130000000, state: 'idle', cancellable: false },
    { resourceId: 'm2m100-418m', kind: 'translationModel', provider: 'm2m100', name: 'M2M100 418M', description: '多对多翻译模型，由 transformers 在本机运行。', languages: ['zh', 'en'], installed: false, installedBytes: 0, downloadBytes: 1941936305, state: 'idle', cancellable: false },
  ],
}

/**
 * The stub `window.nolaTranslator` the pages under test read, plus
 * `layoutFixture` so this script can inject the engine events a real main
 * process would send. It covers the methods those pages call, not preload's
 * full surface — the engine-state read, for one, is left out and the store
 * swallows the failure.
 */
const preloadSource = `
const {contextBridge} = require('electron');
let settings = {
  version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '',
  recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto', audioSource: 'defaultOutput' },
  recording: { keepAudio: true },
  appearance: { reduceMotion: false },
  overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 26, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, lineHeight: 1.3, translationLineHeight: 1.35, showSource: true, showTranslation: true, layout: 'rolling' },
  translation: { provider: 'local', localModelId: 'hy-mt2-1.8b-q3-k-m', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini', cloudApiFormat: 'chat-completions', translateIntermediate: false, targetLanguage: 'zh' },
};
const meetings = ${JSON.stringify(MEETINGS)};
const segments = ${JSON.stringify(SEGMENTS)};
const resources = ${JSON.stringify(RESOURCES)};
const settingsListeners = new Set(), eventListeners = new Set();
const merge = (base, patch) => {
  const next = { ...base, ...patch };
  for (const group of ['recognition', 'recording', 'appearance', 'overlay', 'translation']) {
    if (patch[group]) next[group] = { ...(base[group] ?? {}), ...patch[group] };
  }
  return next;
};
const update = async (patch) => {
  settings = merge(settings, patch ?? {});
  settingsListeners.forEach(fn => fn(settings));
  return settings;
};
const emit = (event) => eventListeners.forEach(fn => fn(event));
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings: async () => settings,
  updateSettings: update,
  onSettingsChanged: fn => { settingsListeners.add(fn); return () => settingsListeners.delete(fn) },
  onEngineEvent: fn => { eventListeners.add(fn); return () => eventListeners.delete(fn) },
  onOpenAppearance: () => () => {},
  listDevices: async () => [],
  listResources: async () => resources,
  manageResource: async (id) => resources.resources.find(r => r.resourceId === id),
  getModelStorage: async () => ({ activePath: 'D:/Models/Nola Translator', configuredPath: 'E:/Downloads/models-and-translation-packages/another-long-directory', restartRequired: true }),
  chooseModelStorageDirectory: async () => null,
  restartApp: async () => {},
  listMeetings: async () => meetings,
  getMeeting: async id => meetings.find(m => m.meetingId === id) ?? null,
  readMeeting: async () => segments,
  renameMeeting: async (id, title) => Object.assign({}, meetings.find(m => m.meetingId === id) ?? { meetingId: id }, { title, titleIsCustom: true }),
  setMeetingNotes: async (id, notes) => Object.assign({}, meetings.find(m => m.meetingId === id) ?? { meetingId: id }, { notes }),
  deleteMeeting: async () => true,
  exportMeeting: async () => 'D:/exports/meeting.srt',
  getMeetingAudioUrl: async id => (meetings.find(m => m.meetingId === id)?.audioFile ? 'nola-audio://local/' + id + '/audio.wav' : null),
  getDiagnostics: async () => ({ '引擎状态': 'ready', '语音识别': 'Qwen3-ASR 1.7B（nf4）', '本地翻译': 'Hy-MT2 · llama.cpp（cuda）' }),
  copyDiagnostics: async () => {},
  hasTranslationCredential: async () => false,
  setTranslationCredential: async () => {},
  showOverlay: async () => {},
  hideOverlay: async () => {},
  closeOverlay: async () => {},
  minimizeOverlay: async () => {},
  resizeOverlay: async () => {},
  openAppearance: async () => {},
  startSession: async () => ({ sessionId: 'layout', meetingId: 'm-live' }),
  stopSession: async () => {},
  setSessionPaused: async () => {},
});
contextBridge.exposeInMainWorld('layoutFixture', { emit });
`

// Two rAFs only cover paint; the stub's async bridge calls need wall-clock time on top.
async function settle(window) {
  await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  await delay(220)
}

/**
 * Sets the hash, then waits for `data-page` to actually reach the target
 * instead of assuming a fixed delay covered the switch.
 *
 * A reload is no substitute: it re-runs the stub preload, so the in-memory
 * settings fall back to their initial `uiLanguage` — an artefact of the stub
 * that the real main process would not reproduce.
 */
async function goto(window, hash, page) {
  await window.webContents.executeJavaScript(`(() => {
    const h = ${JSON.stringify(hash)}
    if (location.hash !== h) location.hash = h
  })()`)
  if (window.webContents.isLoading()) {
    await new Promise((done) => window.webContents.once('did-finish-load', done))
  }
  let reached = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    reached = await window.webContents.executeJavaScript(`document.querySelector('[data-page]')?.getAttribute('data-page') === ${JSON.stringify(page)}`)
    if (reached) break
    await delay(50)
  }
  await settle(window)
  return reached
}

function closeWindow(window) {
  return new Promise((done) => {
    if (window.isDestroyed()) { done(); return }
    window.once('closed', done)
    window.close()
  })
}

/** Real input events: the title bar is an `-webkit-app-region: drag` strip, which swallows a DOM `.click()`. */
async function clickAt(window, selector) {
  const point = await window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (!point) return false
  await window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
  await window.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await settle(window)
  return true
}

async function main() {
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)

  const failures = []
  let scenarios = 0
  const fail = (context, reason, extra) => failures.push({ ...context, reason, ...(extra ?? {}) })

  const window = new BrowserWindow({ width: 1180, height: HEIGHT, show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) console.log(`[renderer] ${message}`)
  })
  await window.loadFile(resolve('out/renderer/index.html'))

  /**
   * Counts and sideways overflow for a group of containers, collected in one
   * `executeJavaScript` round trip. Too few elements and an element that
   * overflows are two independent failures.
   */
  const probeGroups = (groups) => window.webContents.executeJavaScript(`(() => {
    const groups = ${JSON.stringify(groups)}
    return groups.map((group) => {
      const elements = [...document.querySelectorAll(group.selector)]
      return {
        name: group.name,
        selector: group.selector,
        min: group.min,
        found: elements.length,
        overflows: elements
          .filter((el) => el.scrollWidth > el.clientWidth + 2)
          .map((el) => ({ className: String(el.className).slice(0, 90), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })),
      }
    })
  })()`)

  for (const language of ['zh-CN', 'en']) {
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ uiLanguage: ${JSON.stringify(language)} })`)
    await settle(window)
    for (const width of WIDTHS) {
      window.setContentSize(width, HEIGHT)
      for (const target of PAGES) {
        const context = { language, width, page: target.name }
        const expected = target.page ?? target.name

        const reached = await goto(window, target.hash, expected)
        scenarios += 1
        if (!reached) {
          fail(context, `route did not render: expected data-page="${expected}" at ${target.hash}`)
          continue
        }

        // The ErrorBoundary fallback holds the only <pre> in the app, so one appearing means a
        // page crashed. It lands inside .nola-main only when a page-level boundary caught it.
        scenarios += 1
        const crashed = await window.webContents.executeJavaScript(`(() => {
          const pre = document.querySelector('.nola-main pre')
          return pre ? String(pre.textContent ?? '').slice(0, 200) : ''
        })()`)
        if (crashed) fail(context, 'error boundary rendered (page crashed)', { crashed })

        // Shell and page containers in one count pass, each with its own `min`.
        for (const group of await probeGroups([...SHELL_GROUPS, ...(PAGE_GROUPS[expected] ?? [])])) {
          scenarios += 1
          if (group.found < group.min) {
            fail(context, `container not found: ${group.name} "${group.selector}" found ${group.found}, need >= ${group.min}`)
          }
        }

        // Sideways overflow: the shell and card containers break first.
        for (const group of await probeGroups(SHELL_OVERFLOW)) {
          scenarios += 1
          if (group.found < group.min) {
            fail(context, `overflow probe matched nothing: ${group.name} "${group.selector}" found ${group.found}, need >= ${group.min}`)
          }
          if (group.overflows.length > 0) fail(context, `horizontal overflow in ${group.name}`, { overflows: group.overflows })
        }

        // The page as a whole must not scroll sideways. No class names involved, so it still
        // holds when every selector above has gone stale.
        scenarios += 1
        const pageOverflow = await window.webContents.executeJavaScript(`({
          docScroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          html: document.documentElement.lang,
        })`)
        if (pageOverflow.docScroll > pageOverflow.inner + 2) {
          fail(context, 'document scrolls horizontally', { pageOverflow })
        }
        scenarios += 1
        if (pageOverflow.html !== language) {
          fail(context, `documentElement.lang is "${pageOverflow.html}", expected "${language}"`, { pageOverflow })
        }

        if (width === 901 || (width === 1100 && target.name === 'settings/appearance')) {
          await writeFile(resolve(output, `${language}-${width}-${target.name.replace('/', '-')}.png`), (await window.webContents.capturePage()).toPNG())
        }
      }

      // A record detail is a child of the list: long title, dual columns, separators and the
      // player all have to fit.
      scenarios += 1
      const reached = await goto(window, '#/records/m-finished', 'record')
      if (!reached) {
        fail({ language, width, page: 'record-detail' }, 'route did not render: expected data-page="record"')
      } else {
        const dualLayout = await window.webContents.executeJavaScript(`(() => {
          const dual = document.querySelector('.nola-dual')
          const pairs = [...document.querySelectorAll('.nola-dual__scroll .nola-dual__pair')]
          const first = pairs[0]
          const cells = first ? [...first.querySelectorAll(':scope > .nola-dual__cell')] : []
          const a = cells[0]?.getBoundingClientRect()
          const b = cells[1]?.getBoundingClientRect()
          return {
            pairs: pairs.length,
            cellsPerPair: cells.length,
            containerWidth: dual ? Math.round(dual.clientWidth) : 0,
            sameRow: Boolean(a && b) && Math.abs(a.top - b.top) < 4,
            sideBySide: Boolean(a && b) && a.right <= b.left + 1,
            sourceWidth: a ? Math.round(a.width) : 0,
            targetWidth: b ? Math.round(b.width) : 0,
            longTitleFits: [...document.querySelectorAll('.nola-record-detail__header')].every((el) => el.scrollWidth <= el.clientWidth + 2),
          }
        })()`)
        /*
         * Sideways overflow cannot see "wrapped onto a second row": a two-column
         * grid holding three children pushes the translation down while every
         * container width still measures correct, so this compares geometry.
         *
         * Both shapes are valid — `home-records.css` collapses
         * `.nola-dual__pair` to one column at `@container (max-width: 680px)`, so a
         * narrow window stacks — but each shape has to actually materialise.
         */
        const stacked = dualLayout.containerWidth <= 680
        const shapeOk = stacked
          ? !dualLayout.sideBySide && dualLayout.sourceWidth > 40
          : dualLayout.sameRow && dualLayout.sideBySide && dualLayout.sourceWidth >= 40 && dualLayout.targetWidth >= 40
        if (dualLayout.pairs < 2 || dualLayout.cellsPerPair !== 2 || !shapeOk || !dualLayout.longTitleFits) {
          fail({ language, width, page: 'record-detail-panes' }, stacked ? 'dual column did not stack below the 680px container breakpoint' : 'dual column reading layout broke', { dualLayout })
        }
        if (width === 1100) await writeFile(resolve(output, `${language}-${width}-record-detail.png`), (await window.webContents.capturePage()).toPNG())
      }

      // The back button: without it the rest of the width sweep stays trapped on the detail page.
      scenarios += 1
      const wentBack = await clickAt(window, '.nola-record-detail__back')
      const backAtList = await window.webContents.executeJavaScript(`document.querySelector('[data-page]')?.getAttribute('data-page') === 'records'`)
      if (!wentBack || !backAtList) fail({ language, width, page: 'record-back' }, 'back button did not return to the records list', { wentBack, backAtList })
    }
  }

  // Real input event: the dropdown lives in the title bar's drag region, where a DOM .click() proves nothing.
  window.setContentSize(1100, HEIGHT)
  await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ uiLanguage: 'zh-CN' })`)
  await goto(window, '#/', 'home')
  const LANG_LABEL = { 'zh-CN': '界面语言', en: 'Interface language' }
  const LANG_TRIGGER = (language) => `button[data-slot="dropdown-trigger"].nola-titlebar-icon[aria-label="${LANG_LABEL[language]}"]`

  scenarios += 1
  if (!await clickAt(window, LANG_TRIGGER('zh-CN'))) {
    fail({ language: 'zh-CN', width: 1100, page: 'language-menu' }, 'language dropdown trigger not found or not clickable')
  } else {
    const menu = await window.webContents.executeJavaScript(`(() => {
      const items = [...document.querySelectorAll('[data-slot="menu-item"]')]
      return { count: items.length, texts: items.map(el => el.textContent.trim()) }
    })()`)
    scenarios += 1
    // Every HeroUI v3 Dropdown.Menu item carries [data-slot="menu-item"], so match on text rather than order.
    if (menu.count < 2 || !menu.texts.includes('English') || !menu.texts.includes('简体中文')) {
      fail({ language: 'zh-CN', width: 1100, page: 'language-menu' }, 'language menu items missing', { menu })
    } else {
      scenarios += 1
      const picked = await window.webContents.executeJavaScript(`(() => {
        const item = [...document.querySelectorAll('[data-slot="menu-item"]')].find(el => el.textContent.trim() === 'English')
        if (!item) return false
        item.click(); return true
      })()`)
      await settle(window)
      const switched = await window.webContents.executeJavaScript(`({
        lang: document.documentElement.lang,
        firstNav: document.querySelector('.nola-sidebar-nav .nola-nav-button .nola-nav-label')?.textContent?.trim() ?? '',
      })`)
      scenarios += 1
      if (!picked || switched.lang !== 'en' || !switched.firstNav.includes('Home')) {
        fail({ language: 'en', width: 1100, page: 'language-menu' }, 'switching to English via the menu failed', { picked, switched })
      }
      // Back to Chinese, so the language path is covered in both directions.
      await clickAt(window, LANG_TRIGGER('en'))
      const restored = await window.webContents.executeJavaScript(`(() => {
        const item = [...document.querySelectorAll('[data-slot="menu-item"]')].find(el => el.textContent.trim() === '简体中文')
        if (!item) return ''
        item.click(); return 'clicked'
      })()`)
      await settle(window)
      scenarios += 1
      const backLang = await window.webContents.executeJavaScript('document.documentElement.lang')
      if (restored !== 'clicked' || backLang !== 'zh-CN') {
        fail({ language: 'zh-CN', width: 1100, page: 'language-menu' }, 'switching back to Chinese failed', { restored, backLang })
      }
    }
  }

  await closeWindow(window)

  // `?overlay=1` renders OverlayRoot instead of the shell (main.tsx), so the overlay needs its own window.
  const overlay = new BrowserWindow({ width: 880, height: 260, show: false, transparent: true, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true } })
  await overlay.loadFile(resolve('out/renderer/index.html'), { query: { overlay: '1' } })
  /*
   * The window has to be shown. `caption-card.css` gives
   * `.nola-caption-track-content` a 320ms transform transition, and Chromium
   * throttles rAF and compositing in a hidden window, so the animation never
   * advances and the computed transform stays at identity.
   */
  overlay.showInactive()
  await settle(overlay)
  const segment = {
    segmentId: 'current', revision: 1, startedAtMs: 0, isFinal: true,
    sourceText: 'We might realize that doing nothing is not only okay, but also important for a healthy, balanced life.',
    translations: [
      { targetLanguage: 'zh', text: '我们可能会意识到，适当放松不仅没有问题，也对健康、平衡的生活十分重要。', state: 'complete', provider: 'hymt2' },
      { targetLanguage: 'ja', text: '何もしないことも問題ではないし、健康でバランスの取れた生活に重要だと気づくかもしれません。', state: 'complete', provider: 'hymt2' },
    ],
  }
  // The overlay document starts no session, so the store only learns a sessionId from this event.
  const emit = (type, extra) => overlay.webContents.executeJavaScript(
    `window.layoutFixture.emit(${JSON.stringify({ protocolVersion: 1, type, requestId: 'layout', sessionId: 'layout', ...extra })})`,
  )
  await emit('sessionStarted')
  await emit('caption', { segment })
  await settle(overlay)

  const OVERLAY_GROUPS = [
    { name: 'overlay-window', selector: '.nola-overlay-window', min: 1 },
    { name: 'caption-card', selector: '.nola-caption-card', min: 1 },
    { name: 'caption-stage', selector: '.nola-caption-stage', min: 1 },
    { name: 'source-track', selector: '.nola-caption-track[data-kind="source"]', min: 1 },
    { name: 'translation-track', selector: '.nola-caption-track[data-kind="translation"]', min: 1 },
    { name: 'translation-wrap', selector: '.nola-caption-translations', min: 1 },
    { name: 'actions', selector: '.nola-caption-actions', min: 1 },
    // Position · lock · pin │ appearance · minimize · close — OverlayRoot's action row.
    { name: 'action-button', selector: '.nola-caption-actions .nola-caption-action', min: 6 },
    { name: 'controls', selector: '[data-slot="overlay-controls"]', min: 1 },
  ]
  for (const group of OVERLAY_GROUPS) {
    scenarios += 1
    const found = await overlay.webContents.executeJavaScript(`document.querySelectorAll(${JSON.stringify(group.selector)}).length`)
    if (found < group.min) {
      fail({ language: 'overlay', page: 'structure' }, `container not found: ${group.name} "${group.selector}" found ${found}, need >= ${group.min}`)
    }
  }

  scenarios += 1
  const bilingual = await overlay.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.nola-caption-card')
    const stage = document.querySelector('.nola-caption-stage')
    const text = stage?.textContent ?? ''
    return {
      hasZh: text.includes('平衡的生活十分重要'),
      // 译文轨道只画一条：OverlayRoot 取的是 translations 里第一条 complete 的译文，
      // 与旧浮窗「每个目标语言各画一条」不同。设置里 targetLanguage 也是单数。
      translationSegments: document.querySelectorAll('.nola-caption-track[data-kind="translation"] .nola-caption-segment').length,
      cardOverflowX: Boolean(card) && card.scrollWidth > card.clientWidth + 2,
      stageOverflowX: Boolean(stage) && stage.scrollWidth > stage.clientWidth + 2,
    }
  })()`)
  if (!bilingual.hasZh || bilingual.translationSegments !== 1 || bilingual.cardOverflowX || bilingual.stageOverflowX) {
    fail({ language: 'overlay', page: 'multitarget' }, 'overlay lost the configured target language or overflowed', { bilingual })
  }

  // The next sentence has to join the same text flow rather than replace it: the finished
  // sentence stays in the stream, the block scrolls up, the translation trails a step behind.
  // Its translation text must differ — identical text is folded as a revision by
  // `CaptionTrack`'s `mergeLine`, so the translation track would never reach two segments.
  await emit('caption', { segment: {
    ...segment,
    segmentId: 'after-roll',
    startedAtMs: 4000,
    sourceText: 'Rest is not a luxury; it is how people recover attention and keep making good decisions.',
    translations: [{ targetLanguage: 'zh', text: '休息不是奢侈；它是人们恢复注意力、继续做出好决定的方式。', state: 'complete', provider: 'hymt2' }],
  } })
  await delay(120)
  scenarios += 1
  const rolling = await overlay.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.nola-caption-track[data-kind="source"]')
    const content = track?.querySelector('.nola-caption-track-content')
    const flow = track?.querySelector('.nola-caption-track-flow')
    return {
      segments: track?.querySelectorAll('.nola-caption-segment').length ?? 0,
      kept: (track?.textContent ?? '').includes('balanced life.'),
      translationSegments: document.querySelectorAll('.nola-caption-track[data-kind="translation"] .nola-caption-segment').length,
      translationHeld: (document.querySelector('.nola-caption-translations')?.textContent ?? '').includes('平衡的生活十分重要'),
      hasContent: Boolean(content),
      hasFlow: Boolean(flow),
      // 组件自己的溢出标志：entries 变了就已经是 true，不用等动画。
      rolling: track?.getAttribute('data-rolling'),
    }
  })()`)
  if (!rolling.hasContent || !rolling.hasFlow || rolling.segments !== 2 || !rolling.kept
    || rolling.translationSegments !== 2 || !rolling.translationHeld || rolling.rolling !== 'true') {
    fail({ language: 'overlay', page: 'roll-up' }, 'caption did not accumulate into one continuous stream', { rolling })
  }

  /*
   * The 320ms transform transition on `.nola-caption-track-content` has to finish
   * first; read mid-transition and the computed matrix is still the start value.
   *
   * The assertion is on how far it *should* move, not that it moved: the shift
   * must equal the block's own overflow of the flow
   * (`content.offsetHeight - flow.clientHeight`, which is what `CaptionTrack`
   * measures). A hardcoded `translateY(-4px)` would pass a `shiftY < 0` check.
   */
  await delay(420)
  scenarios += 1
  const settledRoll = await overlay.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.nola-caption-track[data-kind="source"]')
    const content = track?.querySelector('.nola-caption-track-content')
    const flow = track?.querySelector('.nola-caption-track-flow')
    if (!(content instanceof HTMLElement) || !(flow instanceof HTMLElement)) return null
    const computed = getComputedStyle(content).transform
    const matrix = new DOMMatrixReadOnly(computed === 'none' ? '' : computed)
    const overflow = content.offsetHeight - flow.clientHeight
    return { shiftY: matrix.f, overflow, hasOverflow: overflow > 0 }
  })()`)
  if (!settledRoll || !settledRoll.hasOverflow
    || Math.abs(settledRoll.shiftY + settledRoll.overflow) > 1 || settledRoll.shiftY >= -0.5) {
    fail({ language: 'overlay', page: 'roll-geometry' }, 'caption block did not translate up by exactly its own overflow', { settledRoll })
  }
  await writeFile(resolve(output, 'overlay-roll-transition.png'), (await overlay.webContents.capturePage()).toPNG())

  await delay(300)
  scenarios += 1
  const settledSegments = await overlay.webContents.executeJavaScript(`document.querySelectorAll('.nola-caption-track[data-kind="source"] .nola-caption-segment').length`)
  if (settledSegments !== 2) fail({ language: 'overlay', page: 'roll-settled' }, `source stream settled to ${settledSegments} segments, expected 2`)
  await writeFile(resolve(output, 'overlay-bilingual.png'), (await overlay.webContents.capturePage()).toPNG())

  // The caption must not break the glass at a large font size.
  await overlay.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ overlay: { fontSize: 72, translationFontSize: 72, locked: false } })`)
  await settle(overlay)
  scenarios += 1
  const largeState = await overlay.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.nola-caption-card')
    const stage = document.querySelector('.nola-caption-stage')
    return {
      overflowX: Boolean(card) && card.scrollWidth > card.clientWidth + 2,
      overflowY: Boolean(card) && card.scrollHeight > card.clientHeight + 2,
      stageOverflowX: Boolean(stage) && stage.scrollWidth > stage.clientWidth + 2,
      hasCard: Boolean(card),
    }
  })()`)
  if (!largeState.hasCard || largeState.overflowX || largeState.overflowY || largeState.stageOverflowX) {
    fail({ language: 'overlay', page: 'large-font' }, 'overlay overflowed at 72px', { largeState })
  }
  await writeFile(resolve(output, 'overlay-large-adjusting.png'), (await overlay.webContents.capturePage()).toPNG())
  await closeWindow(overlay)

  // Counted as it runs: a hardcoded total stops describing what was actually checked.
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ scenarios, failures }, null, 2))
  console.log(JSON.stringify({ scenarios, failures }, null, 2))
  app.exit(failures.length ? 1 : 0)
}

app.whenReady().then(main).catch((error) => { console.error(error); app.exit(1) })
