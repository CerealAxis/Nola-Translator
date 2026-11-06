import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron'
import { build } from 'esbuild'

// Actual owned GDI target -> native Hook -> game controller -> independent subtitle renderer. MT is deterministic.
const output = resolve('artifacts/game-overlay'), run = promisify(execFile)
await mkdir(output, { recursive: true })
app.setPath('userData', resolve(output, `cache-${process.pid}`)); app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
await build({ stdin: { contents: `export {MeetingStore, exportText, exportSrt, exportWebVtt} from './src/main/meeting-store'; export {GameTranslation} from './src/main/game-translation'; export {DEFAULT_SETTINGS} from './src/shared/settings'; export {screenConfigSchema,screenTranslationModel} from './src/shared/screen-translation'`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: resolve(output, 'service.cjs') })
const { MeetingStore, exportText, exportSrt, exportWebVtt, GameTranslation, DEFAULT_SETTINGS, screenConfigSchema, screenTranslationModel } = createRequire(import.meta.url)(resolve(output, 'service.cjs'))
const model = screenTranslationModel(screenConfigSchema.parse({}), DEFAULT_SETTINGS)
const wait = ms => new Promise(done => setTimeout(done, ms))
const until = async (condition, label, timeout = 20000) => {
  const start = Date.now()
  while (!await condition()) { if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}`); await wait(80) }
}
let service, target, other, handle, translated = 0
const evidence = []
async function activate(ownedHandle) {
  assert(/^\d+$/.test(ownedHandle))
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FixtureFocus {
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int mode);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int w, int h, uint flags);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  public static bool Activate(IntPtr hwnd) {
    ShowWindow(hwnd, 9); ShowWindow(hwnd, 5);
    SetForegroundWindow(hwnd);
    if (GetForegroundWindow() == hwnd) return true;
    // Windows can refuse a background test's activation request. Click only a verified point in its own blank fixture.
    Point original;
    Point point = new Point { x = 10, y = 10 };
    if (!GetCursorPos(out original) || !ClientToScreen(hwnd, ref point)) return false;
    const uint flags = 0x13; // NOSIZE | NOMOVE | NOACTIVATE
    if (!SetWindowPos(hwnd, new IntPtr(-1), 0, 0, 0, 0, flags)) return false;
    try {
      if (GetAncestor(WindowFromPoint(point), 2) != hwnd || !SetCursorPos(point.x, point.y)) return false;
      Point actual;
      if (!GetCursorPos(out actual) || GetAncestor(WindowFromPoint(actual), 2) != hwnd) return false;
      mouse_event(6, 0, 0, 0, UIntPtr.Zero);
      return System.Threading.SpinWait.SpinUntil(() => GetForegroundWindow() == hwnd, 1000);
    } finally {
      SetCursorPos(original.x, original.y);
      SetWindowPos(hwnd, new IntPtr(-2), 0, 0, 0, 0, flags);
    }
  }
}
'@
if (-not [FixtureFocus]::Activate([IntPtr]${ownedHandle})) { throw 'Owned window did not receive foreground focus' }`
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 8000 }).catch(error => { throw new Error(error.stdout.trim() || 'Focus check failed') })
}
void app.whenReady().then(async () => {
  try {
    const executable = resolve('build/game-hook-build/helper-64/Release/nola-game-hook-test-target.exe')
    target = spawn(executable, [], { cwd: dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    handle = await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('fixture startup timeout')), 5000)
      createInterface({ input: target.stdout }).once('line', line => { clearTimeout(timeout); done(JSON.parse(line).handle) })
      target.once('error', reject)
    })
    assert(/^\d+$/.test(handle)); await activate(handle)
    let source
    await until(async () => { source = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })).find(item => item.id.split(':')[1] === handle); return source }, 'owned native fixture desktop enumeration')
    const id = crypto.randomUUID(), configPath = resolve(output, `config-${process.pid}.json`)
    await writeFile(configPath, JSON.stringify({ version: 1, revision: 0, profiles: [{ id, name: 'Owned Hook fixture', executable, source: 'hook', sourceLanguage: 'en', targetLanguage: 'zh' }] }))
    const recordRoot = resolve(output, `records-${process.pid}`), legacy = resolve(output, 'empty-history.jsonl')
    const records = new MeetingStore(recordRoot)
    await records.initialize(legacy)
    service = new GameTranslation({ records, mainDir: resolve('out/main'), configPath, hookRoot: resolve('build/game-hook'), settings: () => DEFAULT_SETTINGS,
      screen: { subscribe: () => () => {}, stop: async () => {}, sources: async () => [{ id: source.id, kind: 'window', name: source.name }] },
      gatewaySnapshot: () => ({ state: 'running', availableModels: { mt: [{ binding: model, name: 'fixture', kind: 'mt', origin: 'cloud', free: true }] } }),
      inferModel: async request => { translated++; return { text: `真实 Hook 字幕：${request.text}` } }, publish: () => {} })
    ipcMain.handle('app:get-settings', () => DEFAULT_SETTINGS)
    ipcMain.handle('game:snapshot', event => { assert(service.ownsOverlay(event.sender.id)); assert.equal(event.senderFrame, event.sender.mainFrame); return service.snapshot() })
    await service.command({ action: 'connect', id, sourceId: source.id })
    await until(async () => (await service.snapshot()).threads.some(thread => thread.preview.includes('Nola native hook fixture')), 'real Hook thread text')
    assert.equal(translated, 0)
    let snapshot = await service.snapshot()
    const thread = snapshot.threads.find(item => item.preview.includes('Nola native hook fixture'))
    await service.command({ action: 'selectThreads', sessionId: snapshot.sessionId, ids: [thread.id] })
    await until(() => translated > 0 && service.overlay.window, 'selected thread translated into independent window')
    await activate(handle)
    await until(() => service.overlay.window.isVisible(), 'native foreground subtitle visibility')
    const window = service.overlay.window
    await until(async () => (await window.webContents.executeJavaScript('document.body.textContent')).includes('真实 Hook 字幕'), 'actual subtitle renderer text')
    assert(window.isContentProtected()); assert(!window.isFocusable())
    await window.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
    assert(await window.webContents.executeJavaScript('[...document.querySelectorAll(".nola-caption-track")].every(track=>track.getBoundingClientRect().height>8)'), 'Caption tracks must occupy visible space')
    const rendered = await window.webContents.capturePage(), pixels = rendered.toBitmap()
    let brightGlyphs = 0
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 180 && pixels[index + 1] > 180 && pixels[index + 2] > 180 && pixels[index + 3] > 100) brightGlyphs++
    assert(brightGlyphs > 100, 'Actual subtitle pixels must include the configured bright text')
    await writeFile(resolve(output, 'subtitle.png'), rendered.toPNG())
    evidence.push({ check: 'real selected native Hook text reaches protected independent subtitle without a main page', passed: true })
    other = new BrowserWindow({ width: 320, height: 180, show: true }); await other.loadURL('data:text/html,<title>Owned focus fixture</title>Focus fixture'); await activate(other.getNativeWindowHandle().readBigUInt64LE().toString())
    await until(() => !window.isVisible(), 'Alt-Tab hides Hook subtitle')
    evidence.push({ check: 'foreground switch hides game subtitle', passed: true })
    await service.command({ action: 'pause' }); assert(!window.isVisible())
    const windowId = window.webContents.id
    await service.stop(); assert(window.isDestroyed()); assert(!service.ownsOverlay(windowId))
    const reopened = new MeetingStore(recordRoot)
    await reopened.initialize(legacy)
    const meta = reopened.list().find(item => item.gameId === id && item.sourceKind === 'game')
    assert.equal(meta.state, 'completed')
    const rows = await reopened.segments(meta.meetingId)
    for (const exportFormat of [exportText, exportSrt, exportWebVtt]) {
      const transcript = exportFormat(rows)
      assert(transcript.includes('Nola native hook fixture') && transcript.includes('真实 Hook 字幕'))
    }
    evidence.push({ check: 'actual Hook transcript survives store restart and exports through TXT/SRT/VTT', passed: true })
    assert.equal(target.exitCode, null)
    evidence.push({ check: 'pause and stop withdraw subtitle and detach owned target', passed: true })
    await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, evidence, inference: 'deterministic test MT; actual native Hook text' }, null, 2))
    console.log(JSON.stringify({ passed: true, evidence }))
  } catch (error) {
    await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: false, error: String(error), evidence, snapshot: await service?.snapshot() }, null, 2))
    console.error(error); process.exitCode = 1
  } finally {
    await service?.dispose(); target?.kill(); other?.destroy(); app.exit(process.exitCode ?? 0)
  }
})
