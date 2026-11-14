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
import { app, BrowserWindow, protocol } from 'electron'
import { build } from 'esbuild'

const defaultsBundle = await build({ entryPoints: ['src/shared/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { DEFAULT_SETTINGS } = await import('data:text/javascript;base64,' + Buffer.from(defaultsBundle.outputFiles[0].text).toString('base64'))
const screenBundle = await build({ entryPoints: ['src/shared/screen-translation.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { screenConfigSchema } = await import('data:text/javascript;base64,' + Buffer.from(screenBundle.outputFiles[0].text).toString('base64'))
const SCREEN_CONFIG = screenConfigSchema.parse({})

app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'nola-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const output = resolve('artifacts/layout')
app.setPath('userData', resolve(output, `electron-cache-${process.pid}`))
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

const SETTINGS_TABS = ['general', 'audio', 'appearance', 'browser', 'shortcuts', 'engine', 'storage', 'glossary', 'help']

/** Each entry names the `data-page` its route root renders, which is what the run asserts; the settings tabs all collapse to `settings`. */
const PAGES = [
  { name: 'home', hash: '#/' },
  { name: 'workspace', hash: '#/workspace' },
  { name: 'overlay', hash: '#/overlay' },
  { name: 'meeting', hash: '#/meeting' },
  { name: 'screen-translation', hash: '#/screen-translation' },
  { name: 'records', hash: '#/records' },
  { name: 'models', hash: '#/models' },
  ...SETTINGS_TABS.map((tab) => ({ name: `settings/${tab}`, hash: `#/settings/${tab}`, page: 'settings' })),
  { name: 'record-detail', hash: '#/records/m-finished', page: 'record' },
]

/** Exercise narrow desktop windows and both sides of the medium layout range. */
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
  { name: 'nav-label', selector: '.nola-nav-label', min: 6, ellipsis: true },
  { name: 'route-content', selector: '.nola-route-content', min: 1 },
]

/** The page's own content; too few means a section failed to render. */
const PAGE_GROUPS = {
  home: [
    { name: 'home', selector: '.nola-home', min: 1 },
    { name: 'hero', selector: '.nola-home-poster', min: 1 },
    { name: 'feature-card', selector: '.nola-home-feature-card', min: 6 },
    { name: 'recent', selector: '.nola-home__recent', min: 1 },
    { name: 'recent-row', selector: '.nola-home__recent .nola-home-list-row', min: 1 },
  ],
  workspace: [
    { name: 'quick-settings', selector: '.nola-overlay-page', min: 1 },
    { name: 'preview-card', selector: '.nola-overlay-preview', min: 1 },
    { name: 'caption-preview', selector: '.nola-caption-preview', min: 1 },
    { name: 'session-controls', selector: '[data-onboarding="quick-settings"] [role="combobox"], [data-onboarding="quick-settings"] [role="group"], [data-onboarding="quick-settings"] [role="switch"]', min: 6 },
    { name: 'audio-source', selector: '[data-onboarding="quick-audio"] [role="combobox"]', min: 1 },
    { name: 'language-direction', selector: '[data-onboarding="quick-language"] [role="combobox"]', min: 2 },
  ],
  overlay: [
    { name: 'overlay-page', selector: '.nola-overlay-page', min: 1 },
    { name: 'preview-card', selector: '.nola-overlay-preview', min: 1 },
    { name: 'caption-preview', selector: '.nola-caption-preview', min: 1 },
    { name: 'preview-source', selector: '.nola-caption-preview__source', min: 1 },
    { name: 'preview-translation', selector: '.nola-caption-preview__translation', min: 1 },
    { name: 'overlay-controls', selector: '[data-onboarding="quick-settings"] [role="combobox"], [data-onboarding="quick-settings"] [role="group"], [data-onboarding="quick-settings"] [role="switch"]', min: 6 },
    { name: 'audio-source', selector: '[data-onboarding="quick-audio"] [role="combobox"]', min: 1 },
    { name: 'language-direction', selector: '[data-onboarding="quick-language"] [role="combobox"]', min: 2 },
  ],
  meeting: [
    { name: 'meeting-stage', selector: '[data-slot="meeting-stage"]', min: 1 },
    { name: 'meeting-settings', selector: '[data-slot="meeting-settings"]', min: 1 },
    { name: 'meeting-fields', selector: '[data-page="meeting"] [data-slot="field"]', min: 4 },
  ],
  'screen-translation': [
    { name: 'screen-page', selector: '[data-slot="screen-page"]', min: 1 },
    { name: 'screen-header', selector: '[data-page="screen-translation"] header .nola-display', min: 1 },
    { name: 'screen-cards', selector: '[data-page="screen-translation"] [data-slot="card"]', min: 1 },
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
    { name: 'back', selector: '.nola-record-detail nav a[href="#/records"]', min: 1 },
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
    { name: 'heading', selector: '[data-onboarding="models-page-heading"] h1', min: 1 },
    { name: 'model-management-actions', selector: '[data-onboarding="models-page-heading"] button', min: 2 },
    { name: 'tabs', selector: '.models-tabs', min: 1 },
    { name: 'catalog-tab', selector: '.models-tabs [role="tab"]', min: 4 },
    { name: 'models-grid', selector: '.models-grid', min: 1 },
    { name: 'model-card', selector: '.models-grid .models-card', min: 3 },
  ],
  settings: [
    { name: 'settings-page', selector: '.settings-page', min: 1 },
    { name: 'settings-nav', selector: '[data-settings-navigation]', min: 1 },
    // Every tab stays mounted, so the count is the same whichever one is active.
    { name: 'settings-category', selector: '[data-settings-navigation] button[aria-current="page"]', min: 1 },
    { name: 'settings-panels', selector: '.settings-panels', min: 1 },
    { name: 'settings-group', selector: '.settings-panels :is(.settings-group, .shortcuts-page__table, .browser-settings__list)', min: 1 },
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
// A valid local recording keeps media loading independent of custom protocols or network.
const audioSamples = 8000
const fixtureWav = Buffer.alloc(44 + audioSamples * 2)
fixtureWav.write('RIFF', 0)
fixtureWav.writeUInt32LE(fixtureWav.length - 8, 4)
fixtureWav.write('WAVEfmt ', 8)
fixtureWav.writeUInt32LE(16, 16)
fixtureWav.writeUInt16LE(1, 20)
fixtureWav.writeUInt16LE(1, 22)
fixtureWav.writeUInt32LE(audioSamples, 24)
fixtureWav.writeUInt32LE(audioSamples * 2, 28)
fixtureWav.writeUInt16LE(2, 32)
fixtureWav.writeUInt16LE(16, 34)
fixtureWav.write('data', 36)
fixtureWav.writeUInt32LE(audioSamples * 2, 40)
const fixtureAudioUrl = 'nola-audio://local/layout/audio.wav'
const suiteId = '7a643bd5-d87b-4ec8-a80f-31cdb4e292f3'
const suitePageId = 'e0344cb6-a6dd-4c67-bba1-c533de38236b'
const suiteProject = { id: suiteId, title: '夜航 · 第一卷', revision: 1, updatedAt: '2026-11-06T00:00:00.000Z', pageCount: 1, chapterCount: 1,
  config: { sourceLanguage: 'ja', targetLanguage: 'zh', model: '', readingDirection: 'rtl', glossary: { mode: 'auto' } },
  chapters: [{ id: suiteId, title: '第一章' }], pages: [{ id: suitePageId, chapterId: suiteId, name: '001.png', width: 600, height: 800,
    regions: [{ id: suiteId, sourceText: '灯台へ行こう。', targetText: '去灯塔吧。', x: 310, y: 65, width: 180, height: 180, confidence: 0.98, locked: false, ignored: false,
      style: { fontSize: 24, color: '#000000', direction: 'vertical-rl', align: 'center' }, qa: [] }], status: 'translated', hasClean: false, hasRendered: false }], jobs: [], canUndo: true, canRedo: false }
const suiteImage = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><g fill="#f0f0f0" stroke="#222" stroke-width="4"><rect x="25" y="25" width="550" height="350"/><rect x="25" y="400" width="550" height="375"/><path d="M25 375L180 150L300 375M25 775L310 480L575 775"/></g><ellipse cx="400" cy="155" rx="95" ry="110" fill="white" stroke="#222" stroke-width="3"/><text x="355" y="155" font-size="24">灯台へ</text><text x="355" y="190" font-size="24">行こう。</text></svg>').toString('base64')

const preloadSource = `
const {contextBridge} = require('electron');
const defaults = ${JSON.stringify(DEFAULT_SETTINGS)};
let settings = {
  ...defaults,
  version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '', onboardingSeen: true,
  recognition: { ...defaults.recognition, modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto', audioSource: 'defaultOutput' },
  recording: { keepAudio: true },
  appearance: { reduceMotion: false },
  overlay: { mode: 'bottom', colorScheme: 'dark', alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 26, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, lineHeight: 1.3, translationLineHeight: 1.35, showSource: true, showTranslation: true, layout: 'rolling' },
  translation: { ...defaults.translation, provider: 'local', localModelId: 'hy-mt2-1.8b-q3-k-m', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', cloudEndpoint: 'https://api.openai.com/v1', cloudModel: 'gpt-4.1-mini', cloudApiFormat: 'chat-completions', translateIntermediate: false, targetLanguage: 'zh' },
};
const meetings = ${JSON.stringify(MEETINGS)};
const segments = ${JSON.stringify(SEGMENTS)};
const resources = ${JSON.stringify(RESOURCES)};
const settingsListeners = new Set(), eventListeners = new Set();
const screenState = { status: 'ready', config: ${JSON.stringify(SCREEN_CONFIG)}, sessionId: '58d3e446-7ec8-4b51-8173-127527e59888', epoch: 0, blocks: [], shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0, ocr: { installed: false, state: 'idle' } };
let meetingState = { state: 'idle', passthroughActive: false, segments: [] };
const meetingListeners = new Set(), screenListeners = new Set();
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
  desktopData: { snapshot: async () => ({ root: 'D:/Data', usage: { configuration: 10240, content: 10485760, audio: 204800, models: 1073741824, credentials: 512, logs: 1048576 } }), backup: async () => false, restore: async () => false },
  getSettings: async () => settings,
  updateSettings: update,
  onSettingsChanged: fn => { settingsListeners.add(fn); return () => settingsListeners.delete(fn) },
  onEngineEvent: fn => { eventListeners.add(fn); return () => eventListeners.delete(fn) },
  onOverlayMenuChanged: () => () => {},
  onOverlayLockChanged: () => () => {},
  onOverlayVisibilityChanged: () => () => {},
  getOverlayVisibility: async () => false,
  onOpenAppearance: () => () => {},
  getEngineState: async () => 'ready',
  browserConnection: async () => ({ enabled: false, registered: false, connections: 0, sessionActive: false, captionServiceActive: false, browsers: [] }),
  listDevices: async () => ${JSON.stringify(process.argv.includes('--meeting-settings') ? [{"deviceId": "mic", "kind": "microphone", "name": "Microphone (Realtek Audio)", "isDefault": true}, {"deviceId": "ears", "kind": "systemOutput", "name": "Headphones (Realtek Audio)", "isDefault": true}, {"deviceId": "cable-in", "kind": "systemOutput", "name": "CABLE Input", "isDefault": false}, {"deviceId": "cable-out", "kind": "microphone", "name": "CABLE Output", "isDefault": false}, {"deviceId": "process:teams", "kind": "processAudio", "name": "Microsoft Teams", "isDefault": false}] : [])},
  meetingMode: {
    snapshot: async () => meetingState,
    onChanged: callback => { meetingListeners.add(callback); return () => meetingListeners.delete(callback) },
    cancelAudioTest: async () => {},
    setPaused: async paused => ({ ...meetingState, paused }),
  },
  screenTranslation: {
    snapshot: async () => screenState,
    sources: async () => [],
    command: async command => { if (command.action === 'shortcuts') { Object.assign(screenState.config, command.shortcuts); screenListeners.forEach(fn => fn(screenState)) } return screenState },
    onChanged: callback => { screenListeners.add(callback); return () => screenListeners.delete(callback) },
  },
  gameTranslation: {
    snapshot: async () => ({ version: 1, revision: 0, status: 'idle', lines: [], hookAvailable: true,
      profiles: [{ id: '${suiteId}', name: '夜航', sourceLanguage: 'ja', targetLanguage: 'zh', source: 'auto', strategy: 'auto', glossarySelection: { mode: 'auto' } }] }),
    sources: async () => [{ kind: 'window', id: 'window:42:0', name: '夜航', thumbnail: '', width: 1280, height: 720 }],
    onChanged: () => () => {},
  },
  comic: { listProjects: async () => [${JSON.stringify(suiteProject)}], openProject: async () => (${JSON.stringify(suiteProject)}),
    image: async () => ${JSON.stringify(suiteImage)}, onChanged: () => () => {} },
  glossary: { snapshot: async () => ({ schemaVersion: 1, revision: 0, matchingRevision: 0, enabled: true,
    libraries: [{ id: '${suiteId}', name: '游戏专名', description: '', enabled: true, scope: { mode: 'global' },
      entries: [{ id: '${suiteId}', source: 'A小', target: 'A Short', targetLanguage: 'en', caseSensitive: true, enabled: true }] }] }), onChanged: () => () => {} },
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
  getMeetingAudioUrl: async id => (meetings.find(m => m.meetingId === id)?.audioFile ? ${JSON.stringify(fixtureAudioUrl)} : null),
  listComputeDevices: async () => ({ devices: [], notes: [], torchVersion: '', activePlan: null }),
  getRuntimes: async () => ({ recipes: [], packages: [], recommendation: { engineId: null, llamaId: null, reasons: [] }, hardware: { adapters: [], nvidiaDriver: null, notes: [] }, local: { engine: { status: 'missing', managed: false, path: '', reason: '' }, llama: { status: 'missing', managed: false, path: '', reason: '' }, crisp: { status: 'missing', managed: false, path: '', reason: '' } }, operation: null, lastError: null, directory: '' }),
  getDiagnostics: async () => ({ '引擎状态': 'ready', '语音识别': 'Qwen3-ASR 1.7B（nf4）', '本地翻译': 'Hy-MT2 · llama.cpp（cuda）' }),
  copyDiagnostics: async () => {},
  checkLatestRelease: async () => ({ currentVersion: '1.0.7', latestVersion: null, updateAvailable: false, releaseName: null, releaseNotes: '', releaseUrl: null }),
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
  gateway: {
    snapshot: async () => ({ state: 'stopped', address: '', port: 0, connections: 0, activeRequests: 0, services: {}, requests: [] }),
    onChanged: () => () => {},
  },
});
contextBridge.exposeInMainWorld('layoutFixture', { emit,
  meeting: value => { meetingState = value; meetingListeners.forEach(callback => callback(value)) },
  screen: value => { Object.assign(screenState, value); screenListeners.forEach(callback => callback({ ...screenState })) },
});
`

// Two rAFs only cover paint; the stub's async bridge calls need wall-clock time on top.
async function settle(window) {
  if (process.argv.includes('--sidebar-resize') || process.argv.includes('--translation-suite') || process.argv.includes('--settings-navigation') || process.argv.includes('--meeting-stage') || process.argv.includes('--meeting-settings') || process.argv.includes('--screen-page')) {
    // Hidden windows throttle animation frames; state and computed layout are asserted below.
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    if (process.argv.includes('--meeting-settings') || process.argv.includes('--screen-page')) await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
    await delay(process.argv.includes('--screen-page') ? 250 : 100)
    return
  }
  await window.webContents.executeJavaScript('(async () => { await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); await document.fonts.ready; await new Promise(done => requestAnimationFrame(done)); })()')
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
  protocol.handle('nola-audio', () => new Response(fixtureWav, { headers: { 'Content-Type': 'audio/wav' } }))
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)

  const failures = []
  let scenarios = 0
  const fail = (context, reason, extra) => failures.push({ ...context, reason, ...(extra ?? {}) })

  // Hidden layout probes still need compositor frames to settle and receive test input.
  const window = new BrowserWindow({ width: 1180, height: HEIGHT, show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } })
  window.webContents.on('console-message', details => {
    if (details.level === 'error') console.log(`[renderer] ${details.message}`)
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
      const clipped = (el) => {
        if (!group.ellipsis) return false
        const style = getComputedStyle(el), rect = el.getBoundingClientRect()
        const button = el.closest('.nola-nav-button'), bounds = button?.getBoundingClientRect()
        return style.overflowX === 'hidden' && style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap'
          && rect.width > 0 && bounds && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
          && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
          && button.getAttribute('aria-label') === el.textContent.trim()
      }
      return {
        name: group.name,
        selector: group.selector,
        min: group.min,
        found: elements.length,
        overflows: elements
          .filter((el) => !el.classList.contains('sr-only') && el.scrollWidth > el.clientWidth + 2 && !clipped(el))
          .map((el) => ({ className: String(el.className).slice(0, 90), text: el.textContent?.trim().slice(0, 100), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })),
      }
    })
  })()`)

  if (process.argv.includes('--sidebar-resize')) {
    const sidebarSnapshot = () => window.webContents.executeJavaScript(`(() => {
      const sidebar = document.querySelector('.nola-sidebar'), route = document.querySelector('.nola-route-content');
      const icon = document.querySelector('[data-slot="sidebar-trigger"] svg');
      return { width: sidebar?.getBoundingClientRect().width, state: sidebar?.dataset.state,
        alignment: route && icon ? icon.getBoundingClientRect().left - route.getBoundingClientRect().left - parseFloat(getComputedStyle(route).paddingLeft) : null,
        overflow: [...document.querySelectorAll('.nola-shell-content, .nola-main, .nola-route-content')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => ({ name: el.className, width: el.clientWidth, scroll: el.scrollWidth })),
        saved: localStorage.getItem('nola-sidebar-width'), crashed: [...document.querySelectorAll('.nola-main button')].some(button => ['重新载入界面', 'Reload the window'].includes(button.textContent?.trim())) };
    })()`)
    const verify = async (context, width) => {
      const state = await sidebarSnapshot(); scenarios++;
      if (Math.abs(state.width - width) > 2) fail(context, 'sidebar width mismatch', state);
      if (state.overflow.length || state.crashed) fail(context, 'page overflow or crash after resizing', state);
      if (state.alignment === null || Math.abs(state.alignment) > 1.5) fail(context, 'titlebar icon does not align with page content', state);
    }
    const dragTo = async width => {
      const handle = await window.webContents.executeJavaScript(`(() => { const r = document.querySelector('.nola-sidebar-resizer').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      window.webContents.sendInputEvent({ type: 'mouseMove', ...handle });
      window.webContents.sendInputEvent({ type: 'mouseDown', ...handle, button: 'left', clickCount: 1 });
      for (let step = 1; step <= 12; step++) {
        window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(handle.x + (width - handle.x) * step / 12), y: handle.y, modifiers: ['leftButtonDown'] });
        await delay(12);
      }
      await delay(80);
      window.webContents.sendInputEvent({ type: 'mouseUp', x: width, y: handle.y, button: 'left', clickCount: 1 });
      await delay(150);
    }
    window.setContentSize(1360, 900);
    await goto(window, '#/', 'home');
    await verify({ phase: 'initial' }, 272);
    await dragTo(248);
    await verify({ phase: 'drag' }, 248);
    const saved = await sidebarSnapshot(); scenarios++;
    if (Math.abs(Number(saved.saved) - 248) > 2) fail({ phase: 'persist' }, 'expanded pixel width not saved', saved);
    await dragTo(160);
    await verify({ phase: 'automatic-collapse' }, 56);
    const collapsed = await sidebarSnapshot(); scenarios++;
    if (collapsed.state !== 'collapsed') fail({ phase: 'automatic-collapse' }, 'navigation labels were not collapsed', collapsed);
    await clickAt(window, '[data-slot="sidebar-trigger"]'); await delay(100);
    const restored = await sidebarSnapshot(); scenarios++;
    if (restored.width < 208 || restored.width > 320) fail({ phase: 'restore' }, 'toggle did not restore an expanded width', restored);
    await dragTo(248);
    const beforeReload = await sidebarSnapshot();
    await new Promise(done => { window.webContents.once('did-finish-load', done); window.reload() }); await settle(window);
    await verify({ phase: 'reload' }, beforeReload.width);
    await window.webContents.executeJavaScript(`document.querySelector('.nola-sidebar-resizer').focus()`);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); await delay(100);
    await verify({ phase: 'keyboard-collapse' }, 56);
    await dragTo(500);
    await verify({ phase: 'maximum-clamp' }, 320);
    await dragTo(190);
    await verify({ phase: 'minimum-clamp' }, 208);
    await dragTo(160);
    await verify({ phase: 'minimum-collapse' }, 56);
    const suite = [...PAGES, { name: 'model-gateway', hash: '#/model-gateway' },
      { name: 'game-translation', hash: '#/game-translation' }, { name: 'comic-translation', hash: '#/comic-translation' },
      { name: 'comic-editor', page: 'comic-translation', hash: '#/comic-translation/' + suiteId },
      { name: 'comic-reader', page: 'comic-translation', hash: '#/comic-translation/' + suiteId + '/reader' }];
    for (const theme of ['light', 'dark']) {
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ theme: ${JSON.stringify(theme)}, appearance: { reduceMotion: true } })`);
      for (const size of [208, 320, 56]) {
        await goto(window, '#/', 'home');
        await dragTo(size === 56 ? 160 : size);
        for (const target of suite) {
          const context = { theme, size, page: target.name };
          if (!await goto(window, target.hash, target.page ?? target.name)) fail(context, 'route did not render');
          await verify(context, size);
        }
        await goto(window, '#/', 'home');
        await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
        await writeFile(resolve(output, `sidebar-${theme}-${size}.png`), (await window.webContents.capturePage()).toPNG());
      }
    }
    for (const width of [640, 768]) {
      window.setContentSize(width, 900); await settle(window);
      if (width === 640) {
        await dragTo(248); await verify({ phase: 'narrow-manual-expand' }, 248);
        await clickAt(window, '[data-slot="sidebar-trigger"]'); await delay(100);
      }
      for (const target of suite) { await goto(window, target.hash, target.page ?? target.name); await verify({ phase: 'narrow', width, page: target.name }, 56); }
    }
    window.setContentSize(1536, 900); window.webContents.setZoomFactor(2); await settle(window);
    for (const target of suite) { await goto(window, target.hash, target.page ?? target.name); await verify({ phase: 'zoom200', page: target.name }, 56); }
    await writeFile(resolve(output, 'sidebar-results.json'), JSON.stringify({ scenarios, failures }, null, 2));
    console.log(JSON.stringify({ scenarios, failures }, null, 2)); app.exit(failures.length ? 1 : 0); return;
  }

  if (process.argv.includes('--desktop-data')) {
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) for (const width of [760, 1180]) {
      window.setContentSize(width, 900)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme, appearance: { reduceMotion: true } })})`)
      await goto(window, '#/settings/storage', 'settings')
      await settle(window)
      const state = await window.webContents.executeJavaScript(`(() => {
        const group = document.querySelector('#desktop-data-backup');
        group?.scrollIntoView({ block: 'center' });
        return { buttons: group?.querySelectorAll('button').length, rows: document.querySelector('#desktop-data-usage')?.querySelectorAll('.settings-row').length,
          overflow: document.documentElement.scrollWidth > innerWidth + 2 };
      })()`)
      scenarios++
      if (state.buttons !== 2 || state.overflow || !state.rows) fail({ language, theme, width }, 'desktop data controls failed', { state })
      if (language === 'zh-CN') await writeFile(resolve(output, `desktop-data-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
      await window.webContents.executeJavaScript(`document.querySelector('#desktop-data-backup button').click()`)
      await settle(window)
      const modal = await window.webContents.executeJavaScript(`(() => {
        const dialog = document.querySelector('[role="dialog"]'), rect = dialog?.getBoundingClientRect();
        return { switches: dialog?.querySelectorAll('[role="switch"]').length, fits: rect && rect.x >= 0 && rect.right <= innerWidth + 1 && rect.y >= 0 && rect.bottom <= innerHeight + 1 };
      })()`)
      scenarios++
      if (modal.switches !== 3 || !modal.fits) fail({ language, theme, width }, 'backup dialog failed', { modal })
      if (language === 'zh-CN') await writeFile(resolve(output, `desktop-backup-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await settle(window)
    }
    await writeFile(resolve(output, 'desktop-data-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    window.destroy(); app.exit(failures.length ? 1 : 0); return
  }

  if (process.argv.includes('--translation-suite')) {
    const pages = [
      ['screen', '#/screen-translation', 'screen-translation'],
      ['games', '#/game-translation', 'game-translation'],
      ['game', `#/game-translation/${suiteId}`, 'game-translation'],
      ['bookshelf', '#/comic-translation', 'comic-translation'],
      ['editor', `#/comic-translation/${suiteId}`, 'comic-translation'],
      ['reader', `#/comic-translation/${suiteId}/reader`, 'comic-translation'],
      ['glossary', '#/settings/glossary', 'settings'],
      ['terms', `#/settings/glossary/${suiteId}`, 'settings'],
    ].filter(([name]) => !process.argv.includes('--comic-editor') || name === 'editor')
    for (const language of ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'zh-HK']) for (const theme of ['light', 'dark']) for (const width of [1180, 760]) {
      window.setContentSize(width, 900)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme, appearance: { reduceMotion: true } })})`)
      for (const [name, hash, page] of pages) {
        await goto(window, hash, page)
        await delay(180)
        const required = { screen: '.screen-page', games: '.game-library', game: '#game-name', bookshelf: '.comic-bookshelf', editor: '.comic-inspector', reader: '.comic-editor--reader', glossary: '.settings-panels', terms: '.settings-panels table' }[name]
        const state = await window.webContents.executeJavaScript(`(() => {
          const main = document.querySelector('.nola-main');
          return { text: main?.innerText, overflow: document.documentElement.scrollWidth > innerWidth + 2,
            crashed: !!main?.querySelector('pre'), heading: main?.querySelector('h1')?.innerText,
            required: !!document.querySelector(${JSON.stringify(required)}),
            imagesReady: [...document.querySelectorAll('.comic-canvas img')].every(img => img.complete && img.naturalWidth > 0),
            contentOverflow: [...document.querySelectorAll('.game-page, .comic-page, .screen-page, .settings-panels, .comic-inspector, .comic-canvas__tools')].some(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) };
        })()`)
        scenarios++
        if (!state.text || !state.required || !state.imagesReady || state.crashed || state.overflow || state.contentOverflow || /数据仅留|不捕获屏幕/.test(state.text)) fail({ language, theme, width, page: name }, 'Translation suite layout failed', { state })
        if (language === 'zh-CN') await writeFile(resolve(output, `suite-${name}-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
      }
    }
    await writeFile(resolve(output, process.argv.includes('--comic-editor') ? 'translation-suite-editor-results.json' : 'translation-suite-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    window.destroy()
    app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--settings-navigation')) {
    // Expanded hit targets do not represent visible overflow.
    await window.webContents.insertCSS('.settings-page .switch::after, .settings-page .slider__thumb::after { content: none !important; }')
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) for (const [width, height] of [[760, 560], [1180, 780], [1920, 1140]]) {
      console.log('Settings navigation:', language, theme, width)
      window.setContentSize(width, height)
      await delay(250)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme, appearance: { reduceMotion: true } })})`)
      let layout
      for (const tab of (process.argv.includes('--settings-audio') ? ['audio'] : SETTINGS_TABS)) {
        const context = { language, theme, width, tab }
        await goto(window, `#/settings/${tab}`, 'settings')
        if (!layout) await delay(250)
        scenarios++
        const state = await window.webContents.executeJavaScript(`(() => {
          const nav = document.querySelector('[data-settings-navigation]');
          const selected = nav.querySelector('[aria-current="page"]');
          const tabs = [...nav.querySelectorAll('button[data-onboarding^="settings-"]')];
          const panel = document.querySelector('.settings-panels');
          const headingRect = document.querySelector('.settings-page__heading').getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const stage = panel.querySelector('.nola-overlay-stage');
          const stageRect = stage?.getBoundingClientRect();
          return { lang: document.documentElement.lang, selected: selected?.dataset.onboarding, count: tabs.length,
            layout: [headingRect.left, headingRect.top, panelRect.left, panelRect.top, panelRect.width],
            preview: stage && {
              flat: !stage.closest('[data-slot="card"]') && stage.children.length === 1 && !!stage.firstElementChild.matches('.nola-caption-preview'),
              aligned: Math.abs(stageRect.left - panelRect.left) < 1 && Math.abs(stageRect.width - panelRect.width) < 1,
            },
            order: tabs.map(el => el.dataset.onboarding.replace('settings-', '')),
            icons: tabs.map(el => el.querySelector('svg')?.getAttribute('class')),
            crashed: !!document.querySelector('.nola-main pre'),
            sourceLanguageGroup: !!panel.querySelector('[data-onboarding="recognition-service"]'),
            groups: panel.querySelectorAll('.settings-group, [data-slot="card"], .shortcuts-page__table, .browser-settings__list').length,
            overflow: [...document.querySelectorAll('.settings-page, .settings-panels, .settings-group, .settings-row__label, .settings-control-field, .settings-page button')].filter(el => el.clientWidth > 0 && !el.matches('input, [role="switch"]') && !el.classList.contains('sr-only') && getComputedStyle(el).overflowX !== 'auto' && el.scrollWidth > el.clientWidth + 2).map(el => ({ className: String(el.className), text: el.textContent.slice(0, 80) })),
            collapsed: panel.querySelectorAll('[data-slot="accordion-trigger"]').length,
            sections: [...panel.querySelectorAll('.settings-group')].map(el => {
              const heading = el.querySelector('h2');
              const fields = el.querySelector('.settings-group__fields');
              const r = fields.getBoundingClientRect();
              const h = heading.getBoundingClientRect();
              const flat = [el, fields].every(node => {
                const style = getComputedStyle(node);
                return style.backgroundImage === 'none' && style.backgroundColor === 'rgba(0, 0, 0, 0)'
                  && style.boxShadow === 'none' && style.borderTopWidth === '0px';
              });
              return { left:r.left, width:r.width, headingLeft:h.left, flat, headingAbove: h.bottom < r.top };
            }) };
        })()`)
        layout ??= state.layout
        if (state.layout.some((value, index) => Math.abs(value - layout[index]) >= 1)) fail(context, 'Settings title or content shifted between categories', { expected: layout, actual: state.layout })
        if (tab === 'appearance' && (!state.preview?.flat || !state.preview.aligned)) fail(context, 'Caption preview must sit directly on a full-width stage', { preview: state.preview })
        if (state.lang !== language || state.selected !== `settings-${tab}` || state.count !== SETTINGS_TABS.length || JSON.stringify(state.order) !== JSON.stringify(SETTINGS_TABS) || new Set(state.icons).size !== SETTINGS_TABS.length || state.crashed || !state.groups || state.overflow.length || state.collapsed || (tab === 'audio' && state.sourceLanguageGroup) || state.sections.some(section => !section.flat || !section.headingAbove || Math.abs(section.left - section.headingLeft) > 2 || Math.abs(section.width - state.sections[0].width) > 2)) fail(context, 'Settings categories or layout failed', { state })
        if (language === 'zh-CN' && ((theme === 'light' && width === 1180) || (theme === 'dark' && width === 760))) {
          await window.webContents.executeJavaScript(`document.querySelector('.nola-main').scrollTop = 0`)
          await settle(window)
          await writeFile(resolve(output, `settings-navigation-${theme}-${width}-${tab}.png`), (await window.webContents.capturePage()).toPNG())
        }

      }
    }
    window.setContentSize(760, 560)
    await goto(window, '#/records/m-finished', 'record')
    await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="nav-settings"]').click()`)
    await settle(window)
    window.webContents.setZoomFactor(2)
    await settle(window)
    const zoomed = await window.webContents.executeJavaScript(`(() => {
      const nav = document.querySelector('[data-settings-navigation]');
      const fields = document.querySelector('.settings-group__fields');
      const row = fields?.querySelector('.settings-row');
      const columns = row && getComputedStyle(row).gridTemplateColumns;
      return { path: location.hash, collapsed: nav?.closest('aside')?.dataset.state === 'collapsed',
        singleColumn: columns?.split(' ').length === 1, fits: !!fields && fields.scrollWidth <= fields.clientWidth + 2 };
    })()`)
    scenarios++
    if (zoomed.path !== '#/settings/general' || !zoomed.collapsed || !zoomed.singleColumn || !zoomed.fits) fail({ width: 760, zoom: 2 }, 'Zoomed settings layout failed', { zoomed })
    await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="settings-audio"]').click()`)
    await settle(window)
    await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="nav-settings-back"]').click()`)
    await settle(window)
    const returnPath = await window.webContents.executeJavaScript('location.hash')
    if (returnPath !== '#/records/m-finished') fail({ width: 760, zoom: 2 }, 'Settings return lost the originating route', { returnPath })
    await goto(window, '#/settings/appearance', 'settings')
    window.webContents.setZoomFactor(2)
    await settle(window)
    const previewFits = await window.webContents.executeJavaScript(`(() => {
      const stage = document.querySelector('.settings-panels .nola-overlay-stage')?.getBoundingClientRect();
      const caption = document.querySelector('.settings-panels .nola-caption-preview')?.getBoundingClientRect();
      return !!stage && !!caption && caption.left > stage.left && caption.right < stage.right
        && caption.top > stage.top && caption.bottom < stage.bottom;
    })()`)
    scenarios++
    if (!previewFits) fail({ width: 760, zoom: 2 }, 'Zoomed caption preview does not fit its stage')
    await writeFile(resolve(output, process.argv.includes('--settings-audio') ? 'settings-audio-results.json' : 'settings-navigation-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures: failures.length, examples: failures.slice(0, 2) }, null, 2))
    app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--screen-page')) {
    await goto(window, '#/screen-translation', 'screen-translation')
    const regions = Array.from({ length: 12 }, (_, index) => ({ id: crypto.randomUUID(), x: index % 4 / 4, y: Math.floor(index / 4) / 4, width: .2, height: .15 }))
    const config = screenConfigSchema.parse({ sourceId: 'screen:1:0', regions, presetId: '8ddba01d-f7dd-4ea2-b24e-0a3220212420' })
    const presets = [{ id: config.presetId, name: 'Reading', sourceId: config.sourceId, sourceName: '', regions }]
    await window.webContents.executeJavaScript(`window.layoutFixture.screen(${JSON.stringify({ config, presets })})`)
    const resource = { resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'PP-OCRv5 mobile', description: '', languages: ['zh', 'en', 'ja'], installed: true, installedBytes: 1, state: 'idle', cancellable: false }
    await window.webContents.executeJavaScript(`window.layoutFixture.emit(${JSON.stringify({ type: 'resourceChanged', resource })})`)
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ modelPolicy: { enabled: { 'ocr:resource:pp-ocrv5-mobile-onnx': true }, defaults: { ocr: 'resource:pp-ocrv5-mobile-onnx' }, selections: {} } })})`)
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) for (const [width, height] of [[760, 560], [1180, 780], [1920, 1140]]) {
      window.setContentSize(width, height)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme })})`)
      for (const status of ['ready', 'running']) {
        await window.webContents.executeJavaScript(`window.layoutFixture.screen({status:${JSON.stringify(status)}})`)
        await window.webContents.executeJavaScript('document.querySelector(".nola-route-content").scrollTop = 0')
        await settle(window); scenarios++
        const context = { language, theme, width, height, status }
        const state = await window.webContents.executeJavaScript(`(() => {
          const page = document.querySelector('[data-slot="screen-page"]'), header = page.querySelector('header'), button = header.querySelector('button');
          return { lang: document.documentElement.lang, title: !!header.querySelector('h1.nola-display'), card: !!header.closest('.card'),
            buttons: header.querySelectorAll('button').length, variant: button?.dataset.variant,
            ocr: !!page.querySelector('#screen-ocr-model'), old: !!page.querySelector('.screen-ocr, .screen-session, .screen-source-preview, #screen-source'),
            selectionLabel: page.querySelector('.screen-region-controls > button')?.textContent,
            hint: !!page.querySelector('#screen-translation-heading + p'),
            overflow: [...page.querySelectorAll('div,header,button,[data-slot="field-label"]')].filter(el => el.clientWidth > 0 && !el.classList.contains('sr-only') && el.scrollWidth > el.clientWidth + 2).map(el => ({className:String(el.className),text:el.textContent.slice(0,80)})) };
        })()`)
        if (state.lang !== language || !state.title || state.card || state.buttons !== 1 || state.variant !== (status === 'ready' ? 'default' : 'destructive') || !state.ocr || state.old || /[0-9]/.test(state.selectionLabel ?? '') || state.hint || state.overflow.length) fail(context, 'screen header, controls or layout failed', { state })
        await writeFile(resolve(output, `screen-page-${language}-${theme}-${width}-${status}.png`), (await window.webContents.capturePage()).toPNG())
        if (status === 'ready') {
          await window.webContents.executeJavaScript('document.querySelector(".screen-region-controls .lucide-save").closest("button").click()')
          await settle(window)
          const dialog = await window.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"] #screen-preset-name')`)
          if (!dialog) fail(context, 'preset save dialog did not open')
          await writeFile(resolve(output, `screen-preset-${language}-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
          await settle(window)
        }

      }
    }
    await writeFile(resolve(output, 'screen-page-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--shortcuts')) {
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) for (const [width, height] of [[760, 560], [1180, 780], [1920, 1140]]) {
      window.setContentSize(width, height)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme })})`)
      for (const target of [{ name: 'shortcuts', hash: '#/settings/shortcuts', page: 'settings' }, { name: 'meeting', hash: '#/meeting', page: 'meeting' }, { name: 'screen', hash: '#/screen-translation', page: 'screen-translation' }]) {
        const context = { language, theme, width, height, page: target.name }
        scenarios++
        if (!await goto(window, target.hash, target.page)) { fail(context, 'route did not render'); continue }
        await window.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
        for (const group of await probeGroups([...SHELL_OVERFLOW, ...PAGE_GROUPS[target.page]])) {
          if (group.found < group.min || group.overflows.length) fail(context, 'missing or overflowing container', { group })
        }
        const checks = await window.webContents.executeJavaScript(`(() => {
          const page=document.querySelector('.nola-main');
          return {keys:page.querySelectorAll('[data-slot="kbd"]').length,link:!!page.querySelector('a[href="#/settings/shortcuts"]'),
            removed:!page.querySelector('#screen-toggleShortcut, #meeting-passthroughKey'),
            preferences:!!page.querySelector('#meeting-captionScope')};
        })()`)
        if (!checks.removed || (target.name === 'shortcuts' ? checks.keys < 20 : !checks.link)) fail(context, 'shortcut controls were not consolidated', { checks })
        if (target.name === 'meeting' && !checks.preferences) fail(context, 'meeting preferences are missing')
        if (language === 'zh-CN' && width === 1180) await writeFile(resolve(output, `${target.name}-${theme}.png`), (await window.webContents.capturePage()).toPNG())
        if (target.name === 'shortcuts') {
          await window.webContents.executeJavaScript(`document.querySelector('[data-shortcut-id="toggleShortcut"] button').click()`)
          await settle(window)
          const popup = await window.webContents.executeJavaScript(`(() => {
            const node=document.querySelector('[data-shortcut-recorder]'); if (!node) return null;
            const box=node.getBoundingClientRect(); return {x:box.x,y:box.y,right:box.right,bottom:box.bottom};
          })()`)
          if (!popup || popup.x < -1 || popup.y < -1 || popup.right > width+1 || popup.bottom > height+1) fail(context, 'shortcut recorder is missing or outside the window', { popup })
          if (language === 'zh-CN' && width === 1180) await writeFile(resolve(output, `shortcut-picker-${theme}.png`), (await window.webContents.capturePage()).toPNG())
          await window.webContents.executeJavaScript(`document.querySelector('[data-shortcut-recorder]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}))`)
          await settle(window)
          if (language === 'zh-CN' && theme === 'light' && width === 1180) {
            await window.webContents.executeJavaScript(`document.querySelector('[data-shortcut-id="editShortcut"] .shortcuts-page__operations button:last-child').click()`)
            await settle(window)
            const unassigned = await window.webContents.executeJavaScript(`document.querySelector('[data-shortcut-id="editShortcut"] [data-slot="badge"]')?.textContent`)
            if (unassigned !== '未分配') fail(context, 'deleted shortcut did not become unassigned')
            await writeFile(resolve(output, 'shortcuts-unassigned.png'), (await window.webContents.capturePage()).toPNG())
            await window.webContents.executeJavaScript(`document.querySelector('[data-shortcut-id="editShortcut"] .shortcuts-page__operations button:first-child').click()`)
            await settle(window)
          }
        }
      }
    }
    await writeFile(resolve(output, 'shortcuts-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    window.destroy(); app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--meeting-settings')) {
    const meetingBundle = await build({ entryPoints: ['src/shared/meeting-mode.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
    const { DEFAULT_MEETING_MODE } = await import('data:text/javascript;base64,' + Buffer.from(meetingBundle.outputFiles[0].text).toString('base64'))
    const mode = { ...DEFAULT_MEETING_MODE, microphoneId: 'mic', uplinkOutputId: 'cable-in', downlinkSource: 'application', applicationId: 'process:teams', headphonesId: 'ears' }
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) for (const width of [760, 1180, 1920]) {
      console.log('Meeting settings:', language, theme, width)
      window.setContentSize(width, 900)
      await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme, meetingMode: { ...mode, downlinkSource: theme === 'light' ? 'cable' : 'application', downlinkInputId: 'cable-out' } })})`)
      if (!await goto(window, '#/meeting', 'meeting')) throw new Error('Meeting route missing')
      await window.webContents.executeJavaScript(`document.querySelector('[data-slot="meeting-settings"]').scrollIntoView({ block: 'center' })`)
      await settle(window)
      const state = await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('[data-slot="meeting-settings"]');
        const processing = document.querySelector('#meeting-pipeline').getBoundingClientRect();
        const rows = [...card.querySelectorAll('.nola-overlay-field')].map(field => {
          const label = field.firstElementChild.getBoundingClientRect(), control = field.lastElementChild.getBoundingClientRect();
          return { display: getComputedStyle(field).display, aligned: Math.abs(label.y + label.height / 2 - control.y - control.height / 2) < 2,
            inline: control.x >= label.right, x: control.x, width: control.width };
        });
        return { count: card.querySelectorAll('.nola-meeting-routes [data-slot="field"]').length,
          rows, sameColumns: rows.every(row => Math.abs(row.width - processing.width) < 2),
          headerGap: parseFloat(getComputedStyle(card).gap), expectedGap: parseFloat(getComputedStyle(card).getPropertyValue('--space-1')),
          overflow: [...card.querySelectorAll('div, button')].filter(el => !el.classList.contains('sr-only') && !el.classList.contains('slider__thumb') && el.scrollWidth > el.clientWidth + 2).map(el => ({ className: el.className, width: el.clientWidth, scroll: el.scrollWidth })),
          lang: document.documentElement.lang };
      })()`)
      scenarios++
      if (state.count !== 6 || state.overflow.length || state.lang !== language) fail({ language, theme, width }, 'Meeting settings layout failed', { state })
      if (state.rows.length !== (theme === 'light' ? 9 : 8) || state.rows.some(row => row.display !== 'grid' || !row.aligned || !row.inline) || !state.sameColumns || state.headerGap !== state.expectedGap) fail({ language, theme, width }, 'Meeting settings must use inline labels and consistent columns and spacing', { state })
      await writeFile(resolve(output, `meeting-settings-${language}-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
    }
    window.setContentSize(1180, 900)
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: 'zh-CN', theme: 'light', meetingMode: mode })})`)
    await settle(window)
    const openMeetingControl = async selector => {
      await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`)
      await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
      await clickAt(window, selector)
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await window.webContents.executeJavaScript(`!!document.querySelector('[role="option"], [data-slot="popover-content"]')`)) return
        await delay(50)
      }
    }
    await openMeetingControl('#meeting-pipeline')
    const options = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="option"]')).map(el => el.textContent)`)
    if (JSON.stringify(options) !== JSON.stringify(['跟随网关', '分步识别', '直接语音识别'])) fail({ page: 'meeting' }, 'Processing choices differ from quick interpretation', { options })
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await settle(window)
    await openMeetingControl('#meeting-downlinkInputId')
    const sources = await window.webContents.executeJavaScript(`document.querySelector('[data-slot="select-content"]')?.textContent ?? Array.from(document.querySelectorAll('[role="listbox"]')).map(el => el.textContent).join(' ')`)
    if (!sources.includes('Microsoft Teams') || !sources.includes('CABLE Output')) fail({ page: 'meeting' }, 'Merged source list missing application or cable', { sources })
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await settle(window)
    await openMeetingControl('#meeting-languages')
    await settle(window)
    const popup = await window.webContents.executeJavaScript(`(() => { const el = document.querySelector('[data-slot="popover-content"]'); return el ? { text: el.textContent, overflow: el.scrollWidth > el.clientWidth + 2 } : null; })()`)
    if (!popup || popup.overflow || !popup.text.includes('我的语言') || !popup.text.includes('对方语言')) fail({ page: 'meeting' }, 'Language pair popup failed', { popup })
    await writeFile(resolve(output, 'meeting-settings-languages.png'), (await window.webContents.capturePage()).toPNG())
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await settle(window)
    await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ meetingMode: { ...mode, downlinkSource: 'cable', downlinkInputId: 'cable-out' } })})`)
    await settle(window)
    await window.webContents.executeJavaScript(`document.querySelector('.nola-meeting-preferences').scrollIntoView({ block: 'center' })`)
    await settle(window)
    const help = await window.webContents.executeJavaScript(`(() => { const el = document.querySelector('.nola-meeting-preference-label button'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`)
    window.webContents.sendInputEvent({ type: 'mouseMove', ...help })
    await delay(700)
    await settle(window)
    const hint = await window.webContents.executeJavaScript(`document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? ''`)
    if (!hint.includes('对方原声保留的音量') || !hint.includes('译音结束后恢复')) fail({ page: 'meeting' }, 'Original audio tooltip missing on hover', { hint })
    await writeFile(resolve(output, 'meeting-settings-volume-tooltip.png'), (await window.webContents.capturePage()).toPNG())
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 })
    await settle(window)
    window.webContents.focus()
    await window.webContents.executeJavaScript(`document.querySelector('.nola-meeting-volume-control input').focus()`)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] })
    await delay(700)
    await settle(window)
    const focusedHint = await window.webContents.executeJavaScript(`document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? ''`)
    if (!focusedHint.includes('对方原声保留的音量')) fail({ page: 'meeting' }, 'Original audio tooltip missing on keyboard focus', { focusedHint, focus: await window.webContents.executeJavaScript(`({ document: document.hasFocus(), element: document.activeElement?.outerHTML })`) })
    await writeFile(resolve(output, 'meeting-settings-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--meeting-stage')) {
    const meetingBundle = await build({ entryPoints: ['src/shared/meeting-mode.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
    const { DEFAULT_MEETING_MODE } = await import('data:text/javascript;base64,' + Buffer.from(meetingBundle.outputFiles[0].text).toString('base64'))
    const lane = { inputPeak: 0.3, inputAgeMs: 40, playback: 'playing' }
    const cases = [
      { name: 'idle', mode: {}, snapshot: { state: 'idle', passthroughActive: false }, states: ['idle', 'idle', 'idle', 'idle'] },
      { name: 'mixed', mode: {}, snapshot: { state: 'running', passthroughActive: false, telemetry: { uplink: { ...lane, playback: 'finished' }, downlink: { ...lane, inputPeak: 0 } } }, states: ['active', 'connected', 'connected', 'active'] },
      { name: 'one-way', mode: { uplinkEnabled: false }, snapshot: { state: 'running', passthroughActive: false, telemetry: { uplink: lane, downlink: lane } }, states: ['idle', 'idle', 'active', 'active'] },
      { name: 'lost', mode: {}, snapshot: { state: 'unknown', passthroughActive: false, telemetry: { uplink: lane, downlink: lane } }, states: ['idle', 'idle', 'idle', 'idle'] },
    ]
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) {
      console.log('Meeting scene:', language, theme)
      for (const [width, height] of [[760, 650], [1180, 780], [1920, 1140]]) for (const fixture of cases) {
        window.setContentSize(width, height)
        await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme, meetingMode: { ...DEFAULT_MEETING_MODE, ...fixture.mode } })})`)
        if (!await goto(window, '#/meeting', 'meeting')) throw new Error('Meeting route missing')
        await window.webContents.executeJavaScript(`window.layoutFixture.meeting(${JSON.stringify(fixture.snapshot)})`)
        await settle(window)
        const state = await window.webContents.executeJavaScript(`(() => {
          const stage = document.querySelector('[data-slot="meeting-stage"]');
          const wires = [...stage.querySelectorAll('.nola-meeting-wire')];
          return { states: wires.map(wire => wire.dataset.state), controls: stage.querySelectorAll('button, input, select, [role="button"]').length,
            overflow: [...stage.querySelectorAll('div')].some(el => el.scrollWidth > el.clientWidth + 2),
            scene: !!stage.querySelector('.nola-meeting-call'), lang: document.documentElement.lang, nodes: stage.querySelectorAll('.nola-meeting-endpoint').length, height: stage.querySelector('.nola-meeting-scene').getBoundingClientRect().height, expectedHeight: parseFloat(getComputedStyle(stage.querySelector('.nola-meeting-scene')).minHeight) };
        })()`)
        scenarios++
        if (JSON.stringify(state.states) !== JSON.stringify(fixture.states) || state.controls || state.overflow || !state.scene || state.nodes !== 2 || Math.abs(state.height - state.expectedHeight) > 2 || state.lang !== language) {
          fail({ language, theme, width, fixture: fixture.name }, 'Meeting scene failed', { state })
        }
        if (language === 'zh-CN' && theme === 'light' && width === 1180 && fixture.name === 'mixed') {
          const point = await window.webContents.executeJavaScript(`(() => { const rect = document.querySelector('.nola-meeting-wire-hit').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; })()`)
          window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
          let tooltip
          for (let attempt = 0; attempt < 30; attempt++) {
            tooltip = await window.webContents.executeJavaScript(`document.querySelector('[data-slot="tooltip-content"]')?.textContent`)
            if (tooltip?.includes('正在收到声音')) break
            await delay(50)
          }
          if (!tooltip?.includes('正在收到声音')) fail({ page: 'meeting' }, 'Wire hover did not show its current state', { tooltip })
          await writeFile(resolve(output, 'meeting-scene-tooltip.png'), (await window.webContents.capturePage()).toPNG())
          window.webContents.sendInputEvent({ type: 'mouseMove', x: 0, y: 0 })
        }
        if (language === 'zh-CN' && (width === 1920 || width === 760)) {
          await writeFile(resolve(output, `meeting-scene-${theme}-${width}-${fixture.name}.png`), (await window.webContents.capturePage()).toPNG())
        }
      }
    }
    await window.webContents.executeJavaScript(`window.layoutFixture.meeting(${JSON.stringify(cases[1].snapshot)})`)
    await settle(window)
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    const motion = await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.nola-meeting-wire__pulse')).animationName`)
    if (motion !== 'none') fail({ page: 'meeting' }, 'Reduced motion was ignored', { motion })
    window.webContents.debugger.detach()
    await writeFile(resolve(output, 'meeting-scene-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    app.exit(failures.length ? 1 : 0)
    return
  }

  if (process.argv.includes('--features')) {
    for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) {
      for (const theme of ['light', 'dark']) {
        await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: language, theme })})`)
        for (const [width, height] of [[760, 560], [1180, 780]]) {
          window.setContentSize(width, height)
          for (const target of PAGES.filter(page => ['meeting', 'screen-translation'].includes(page.name))) {
            const context = { language, theme, width, height, page: target.name }
            scenarios++
            if (!await goto(window, target.hash, target.name)) { fail(context, 'route did not render'); continue }
            for (const group of await probeGroups([...SHELL_OVERFLOW, ...PAGE_GROUPS[target.name]])) {
              scenarios++
              if (group.found < group.min || group.overflows.length) fail(context, 'missing or overflowing container', { group })
            }
            const state = await window.webContents.executeJavaScript(`({ lang: document.documentElement.lang, crash: !!document.querySelector('.nola-main pre'), overflow: document.documentElement.scrollWidth > innerWidth + 2 })`)
            if (state.lang !== language || state.crash || state.overflow) fail(context, 'document failed', { state })
            await writeFile(resolve(output, `${language}-${theme}-${width}-${target.name}.png`), (await window.webContents.capturePage()).toPNG())
            if (target.name === 'meeting') {
              const opened = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector('[data-testid="meeting-audio-test"]'); if (!button || button.disabled) return false; button.click(); return true })()`)
              await settle(window)
              const dialog = await window.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"]')`)
              if (!opened || !dialog) fail(context, 'audio test dialog did not open')
              await writeFile(resolve(output, `${language}-${theme}-${width}-meeting-audio-test.png`), (await window.webContents.capturePage()).toPNG())
              window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
              window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
              await settle(window)
            }
          }
        }
      }
    }
    const conversation = [
      { segmentId: 'up:1', direction: 'uplink', revision: 2, startedAtMs: 1000, sourceLanguage: 'zh', sourceText: '请确认会议中的数字与长句在小窗口内仍可完整阅读。', isFinal: true, speakerId: 'local', speakerNumber: 1, translations: [{ targetLanguage: 'en', text: 'Please confirm that numbers and longer sentences remain readable in the small conversation window.', provider: 'meeting', state: 'complete' }] },
      { segmentId: 'down:1', direction: 'downlink', revision: 3, startedAtMs: 2000, sourceLanguage: 'en', sourceText: 'The updated total is 2026. We will review the details after the call.', isFinal: true, speakerId: 'remote', speakerNumber: 1, translations: [{ targetLanguage: 'zh', text: '更新后的总数是 2026。我们将在通话结束后核对详细信息。', provider: 'meeting', state: 'complete' }] },
    ]
    const meeting = { state: 'running', paused: false, passthroughActive: false, meetingId: 'visual-meeting', segments: conversation }
    const reader = new BrowserWindow({ width: 1180, height: HEIGHT, show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } })
    await reader.loadFile(resolve('out/renderer/index.html'), { query: { workspace: '1' } })
    await settle(reader)
    for (const theme of ['light', 'dark']) {
      await reader.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({ uiLanguage: 'zh-CN', theme })})`)
      await reader.webContents.executeJavaScript(`window.layoutFixture.meeting(${JSON.stringify(meeting)})`)
      for (const [width, height] of [[760, 560], [1180, 780]]) {
        reader.setContentSize(width, height); await settle(reader); scenarios++
        const state = await reader.webContents.executeJavaScript(`({ count: document.querySelectorAll('.nola-caption-row').length, text: document.body.textContent, overflow: document.documentElement.scrollWidth > innerWidth + 2, notes: !!document.querySelector('.nola-notes-panel') })`)
        if (state.overflow || state.notes || !state.text.includes('2026') || !state.text.includes('请确认会议')) fail({ page: 'meeting-reader', theme, width }, 'conversation content or layout failed', { state })
        await writeFile(resolve(output, `zh-CN-${theme}-${width}-meeting-reader.png`), (await reader.webContents.capturePage()).toPNG())
      }
    }
    await closeWindow(reader)
    await writeFile(resolve(output, 'features-results.json'), JSON.stringify({ scenarios, failures }, null, 2))
    console.log(JSON.stringify({ scenarios, failures }, null, 2))
    app.exit(failures.length ? 1 : 0)
    return
  }

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

        if (target.name === 'home') {
          const clippedLabels = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('.nola-nav-label')]
            .filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
            .map(el => { const button = el.closest('.nola-nav-button'), rect = button.getBoundingClientRect(); return { label: el.textContent.trim(), x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; }))()`)
          for (const item of clippedLabels) {
            scenarios += 1
            await window.webContents.sendInputEvent({ type: 'mouseMove', x: item.x, y: item.y })
            await delay(500)
            const readable = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('[data-slot="tooltip-content"]')].some(el => {
              const rect = el.getBoundingClientRect(); return el.textContent.trim() === ${JSON.stringify(item.label)} && rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
            }))()`)
            if (!readable) fail(context, 'truncated navigation label has no readable tooltip', { label: item.label })
            await window.webContents.sendInputEvent({ type: 'mouseMove', x: width - 10, y: 10 })
          }
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
      const wentBack = await clickAt(window, '.nola-record-detail nav a[href="#/records"]')
      const backAtList = await window.webContents.executeJavaScript(`document.querySelector('[data-page]')?.getAttribute('data-page') === 'records'`)
      if (!wentBack || !backAtList) fail({ language, width, page: 'record-back' }, 'back button did not return to the records list', { wentBack, backAtList })
    }
  }

  // Real input event: the dropdown lives in the title bar's drag region, where a DOM .click() proves nothing.
  window.setContentSize(1100, HEIGHT)
  await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ uiLanguage: 'zh-CN' })`)
  await goto(window, '#/', 'home')
  const LANG_LABEL = { 'zh-CN': '界面语言', en: 'Interface language' }
  const LANG_TRIGGER = (language) => `button.nola-titlebar-icon[aria-haspopup="menu"][aria-label="${LANG_LABEL[language]}"]`

  scenarios += 1
  if (!await clickAt(window, LANG_TRIGGER('zh-CN'))) {
    fail({ language: 'zh-CN', width: 1100, page: 'language-menu' }, 'language dropdown trigger not found or not clickable')
  } else {
    const menu = await window.webContents.executeJavaScript(`(() => {
      const items = [...document.querySelectorAll('[role="menuitemradio"]')]
      return { count: items.length, texts: items.map(el => el.textContent.trim()) }
    })()`)
    scenarios += 1
    // Match language radio items by their semantic role and text rather than order.
    if (menu.count < 2 || !menu.texts.includes('English') || !menu.texts.includes('简体中文')) {
      fail({ language: 'zh-CN', width: 1100, page: 'language-menu' }, 'language menu items missing', { menu })
    } else {
      scenarios += 1
      const picked = await window.webContents.executeJavaScript(`(() => {
        const item = [...document.querySelectorAll('[role="menuitemradio"]')].find(el => el.textContent.trim() === 'English')
        if (!item) return false
        item.click(); return true
      })()`)
      await settle(window)
      const switched = await window.webContents.executeJavaScript(`({
        lang: document.documentElement.lang,
        homeNav: document.querySelector('[data-onboarding="nav-home"] .nola-nav-label')?.textContent?.trim() ?? '',
      })`)
      scenarios += 1
      if (!picked || switched.lang !== 'en' || !switched.homeNav.includes('Home')) {
        fail({ language: 'en', width: 1100, page: 'language-menu' }, 'switching to English via the menu failed', { picked, switched })
      }
      // Back to Chinese, so the language path is covered in both directions.
      await clickAt(window, LANG_TRIGGER('en'))
      const restored = await window.webContents.executeJavaScript(`(() => {
        const item = [...document.querySelectorAll('[role="menuitemradio"]')].find(el => el.textContent.trim() === '简体中文')
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
      { targetLanguage: 'zh', text: '我们可能会意识到，适当放松不仅没有问题，也对健康、平衡的生活十分重要。', stableText: '我们可能会意识到，', state: 'complete', provider: 'hymt2' },
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
      // 已确认前缀与仍未定稿的尾巴是两个节点，源文轨没有这个分层。
      confirmed: document.querySelectorAll('.nola-caption-track[data-kind="translation"] .nola-caption-confirmed').length,
      tail: document.querySelectorAll('.nola-caption-track[data-kind="translation"] .nola-caption-tail').length,
      sourceConfirmed: document.querySelectorAll('.nola-caption-track[data-kind="source"] .nola-caption-confirmed').length,
      cardOverflowX: Boolean(card) && card.scrollWidth > card.clientWidth + 2,
      stageOverflowX: Boolean(stage) && stage.scrollWidth > stage.clientWidth + 2,
    }
  })()`)
  if (!bilingual.hasZh || bilingual.translationSegments !== 1 || bilingual.confirmed !== 1 || bilingual.tail !== 1
    || bilingual.sourceConfirmed !== 0 || bilingual.cardOverflowX || bilingual.stageOverflowX) {
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
    sourceText: 'Rest is not a luxury; it is how people recover attention and keep making good decisions. '.repeat(4),
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
  await overlay.webContents.executeJavaScript(`window.nolaTranslator.updateSettings({ overlay: { fontSize: 72, translationFontSize: 72 } })`)
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
