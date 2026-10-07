/** Built-renderer acceptance check; no model downloads or audio devices are required. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { app, BrowserWindow } from 'electron'

app.disableHardwareAcceleration()
const output = resolve('artifacts/model-capabilities')
const delay = ms => new Promise(done => setTimeout(done, ms))
const preloadSource = `
const { contextBridge } = require('electron');
let settings = {
  version: 1, theme: 'light', uiLanguage: 'zh-CN', modelStoragePath: '',
  recognition: { modelId: 'sensevoice-small', sourceLanguage: 'auto', audioSource: 'defaultOutput' },
  recording: { keepAudio: true }, appearance: { reduceMotion: true },
  compute: { recognitionEngine: 'pytorch', translationEngine: 'auto' },
  overlay: { locked: true, fontSize: 26, translationFontSize: 22, showSource: true, showTranslation: true, layout: 'rolling' },
  translation: { provider: 'local', localModelId: 'hub:test/translator', targetLanguage: 'en', translateIntermediate: false },
};
const resources = [
  { resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice', name: 'SenseVoiceSmall', languages: ['zh', 'en', 'yue', 'ja', 'ko'] },
  { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2', languages: ['zh', 'en', 'ja'] },
  { resourceId: 'hub:test/translator', kind: 'translationModel', provider: 'llama.cpp', name: 'English / Japanese', languages: ['en', 'ja'], configuration: { slot: 'translation', engine: 'llama', languages: [], supportsAutoDetection: false, sourceLanguages: ['en', 'ja'], targetLanguages: ['en', 'ja'] } },
  { resourceId: 'hub:test/pending', kind: 'translationModel', provider: 'llama.cpp', name: 'Pending translator', languages: [] },
].map(record => ({ installed: true, installedBytes: 1, state: 'idle', cancellable: false, description: '', ...record }));
const events = new Set(), settingsEvents = new Set();
let lastSessionConfig = null;
const emit = event => events.forEach(fn => fn(event));
const update = async patch => {
  const next = { ...settings, ...patch };
  for (const key of ['recognition', 'translation', 'overlay', 'compute']) if (patch[key]) next[key] = { ...settings[key], ...patch[key] };
  settings = next; settingsEvents.forEach(fn => fn(settings)); return settings;
};
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings: async () => settings, updateSettings: update,
  onSettingsChanged: fn => { settingsEvents.add(fn); return () => settingsEvents.delete(fn); },
  onEngineEvent: fn => { events.add(fn); return () => events.delete(fn); },
  onOpenAppearance: () => () => {}, getEngineState: async () => 'ready',
  listDevices: async () => [{ deviceId: 'defaultOutput', kind: 'loopback', name: 'Test output', isDefault: true, sampleRate: 16000, channels: 1 }], listMeetings: async () => [],
  listResources: async () => ({ storagePath: 'test', resources }),
  hasTranslationCredential: async () => false,
  getModelStorage: async () => ({ activePath: 'test', configuredPath: '', restartRequired: false }),
  getRuntimes: async () => null, prepareRuntimes: async () => {},
  startSession: async config => { lastSessionConfig = config; return { sessionId: 'test-session', meetingId: 'test-meeting' }; },
  configureModel: async (id, configuration) => {
    const resource = resources.find(record => record.resourceId === id);
    resource.configuration = configuration;
    emit({ protocolVersion: 1, type: 'resourceChanged', requestId: 'test', resource });
    return resource;
  },
});
contextBridge.exposeInMainWorld('capabilityFixture', {
  update, getSettings: () => settings, getSessionConfig: () => lastSessionConfig,
  getResource: id => resources.find(record => record.resourceId === id),
  install: () => {
    const resource = { resourceId: 'hub:test/new', kind: 'translationModel', provider: 'llama.cpp', name: 'New download', languages: [], installed: true, installedBytes: 1, state: 'idle', cancellable: false, description: '' };
    resources.push(resource); emit({ protocolVersion: 1, type: 'resourceChanged', requestId: 'download', resource });
  },
});
`

async function settle(window) {
  await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
  await delay(250)
}

async function press(window, text, selector = 'button') {
  const point = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  })()`)
  assert.ok(point, `Missing action: ${text}`)
  window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
  window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
  await settle(window)
}

async function verifyDialog(window, name) {
  const bounds = await window.webContents.executeJavaScript(`(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.getBoundingClientRect().width > 0);
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    const buttons = [...dialog.querySelectorAll('button')].filter(el => el.offsetWidth > 0);
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight,
      overflow: dialog.scrollWidth > dialog.clientWidth + 2,
      footerVisible: buttons.slice(-2).every(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }) };
  })()`)
  assert.ok(bounds, `Missing dialog: ${name}`)
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1 && !bounds.overflow && bounds.footerVisible, JSON.stringify({ name, bounds }))
  await writeFile(resolve(output, `${name}.png`), (await window.webContents.capturePage()).toPNG())
}

async function main() {
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)
  const window = new BrowserWindow({ width: 1180, height: 780, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } })
  const errors = []
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  await window.loadFile(resolve('out/renderer/index.html'), { hash: '/workspace' })
  await settle(window)
  await press(window, 'English / Japanese', '[aria-label="翻译模型"]')
  await press(window, '不启用', '[role^="menuitem"]')
  assert.equal(await window.webContents.executeJavaScript('capabilityFixture.getSettings().translation.targetLanguage'), 'none')
  await press(window, '不启用', '[aria-label="翻译模型"]')
  await press(window, 'English / Japanese', '[role^="menuitem"]')
  assert.equal(await window.webContents.executeJavaScript('capabilityFixture.getSettings().translation.targetLanguage'), 'en')
  await window.webContents.executeJavaScript("capabilityFixture.update({ recognition: { sourceLanguage: 'zh' } })")
  await settle(window)
  for (const theme of ['light', 'dark']) {
    await window.webContents.executeJavaScript(`capabilityFixture.update({ theme: '${theme}' })`)
    for (const [width, height] of [[1180, 780], [760, 560]]) {
      window.setSize(width, height); await settle(window)
      await verifyDialog(window, `incompatible-${theme}-${width}`)
    }
  }
  await press(window, '更换翻译模型')
  await press(window, 'English / Japanese', '[role="dialog"] button')
  assert.equal(await window.webContents.executeJavaScript("[...document.querySelectorAll('[role=option]')].find(el => el.textContent.includes('English / Japanese'))?.getAttribute('aria-disabled')"), 'true')
  assert.equal(await window.webContents.executeJavaScript("[...document.querySelectorAll('[role=option]')].find(el => el.textContent.includes('Pending translator'))?.getAttribute('aria-disabled')"), 'true')
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await settle(window)
  await window.webContents.executeJavaScript("capabilityFixture.update({ recognition: { sourceLanguage: 'ja' } })")
  await settle(window)
  await window.webContents.executeJavaScript("capabilityFixture.update({ recognition: { sourceLanguage: 'zh' } })")
  await settle(window)
  await press(window, '关闭翻译')
  await delay(250)
  await writeFile(resolve(output, 'source-only.png'), (await window.webContents.capturePage()).toPNG())
  assert.equal(await window.webContents.executeJavaScript('capabilityFixture.getSettings().translation.targetLanguage'), 'none')
  await window.webContents.executeJavaScript('capabilityFixture.install()')
  await settle(window)
  assert.equal(await window.webContents.executeJavaScript("capabilityFixture.getResource('hub:test/new').configuration"), undefined)
  for (const theme of ['light', 'dark']) {
    await window.webContents.executeJavaScript(`capabilityFixture.update({ theme: '${theme}' })`)
    for (const [width, height] of [[1180, 780], [760, 560]]) {
      window.setSize(width, height); await settle(window)
      await verifyDialog(window, `configure-${theme}-${width}`)
    }
  }
  assert.equal(await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(el => el.textContent.trim() === '保存配置')?.disabled"), true)
  await press(window, '取消', '[role="dialog"] button')
  window.setSize(1440, 960)
  await settle(window)
  await writeFile(resolve(output, 'workspace-translation-picker.png'), (await window.webContents.capturePage()).toPNG())
  await press(window, '开始同传')
  await press(window, '开始', '[role="dialog"] button')
  await delay(600)
  await press(window, '开始同传', '[role="dialog"] button')
  const sessionConfig = await window.webContents.executeJavaScript('capabilityFixture.getSessionConfig()')
  assert.deepEqual(sessionConfig.targetLanguages, [])
  assert.equal(sessionConfig.translationModelId, undefined)
  assert.equal(await window.webContents.executeJavaScript('document.querySelector(\'[aria-label="翻译模型"]\')?.disabled'), true)
  assert.deepEqual(errors, [])
  window.destroy()
  console.log('PASS: 8 dialog layouts, model picker disable/enable, source-only session startup, choices locked while running, incompatible and pending choices disabled, download configuration gate')
  app.exit(0)
}

app.whenReady().then(main).catch(error => { console.error(error); app.exit(1) })
