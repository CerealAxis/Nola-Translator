import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const output = resolve('artifacts/startup-recovery')
const pause = ms => new Promise(done => setTimeout(done, ms))
const memoryMode = process.argv.includes('--memory')
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) ?? 'latest'
assert.match(label, /^[a-z0-9-]+$/)
if (!process.versions.electron) {
  const { createServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const { default: tailwind } = await import('@tailwindcss/vite')
  let failWorkspace = false
  const server = await createServer({ configFile: false, root: resolve('src/renderer'), cacheDir: join(output, 'vite'),
    resolve: { alias: { '@': resolve('src/renderer'), '@renderer': resolve('src/renderer') } },
    plugins: [{ name: 'startup-failure-fixture', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname === '/__startup_failure__') { failWorkspace = url.searchParams.get('enabled') === '1'; response.end('OK'); return }
        if (failWorkspace && url.searchParams.get('workspace') === '1') { response.destroy(); return }
        next()
      })
    } }, react(), tailwind()], server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  const { default: electron } = await import('electron')
  const runId = randomUUID()
  const env = { ...process.env, ELECTRON_RENDERER_URL: server.resolvedUrls.local[0], NOLA_STARTUP_CHECK_RUN: runId }; delete env.ELECTRON_RUN_AS_NODE
  let vitePeak = 0
  const monitor = memoryMode ? setInterval(() => { vitePeak = Math.max(vitePeak, process.memoryUsage().rss) }, 100) : undefined
  const child = spawn(electron, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env })
  process.exitCode = await new Promise(done => child.on('exit', code => done(code ?? 1)))
  clearInterval(monitor)
  try {
    const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'))
    assert.equal(result.runId, runId, 'the application exited before completing startup verification')
    assert.equal(result.passed, true)
  } catch (error) { console.error(error); process.exitCode = 1 }
  if (memoryMode && process.exitCode === 0) {
    const path = join(output, `memory-${label}.json`)
    const report = JSON.parse(await readFile(path, 'utf8'))
    report.vitePeakMiB = Math.round(vitePeak / 104857.6) / 10
    await writeFile(path, JSON.stringify(report, null, 2))
    console.log('MEMORY', label, JSON.stringify(report.peaks), 'Vite MiB:', report.vitePeakMiB)
  }
  await server.close()
} else {
  const { app, BrowserWindow } = await import('electron')
  app.on('window-all-closed', () => {})
  const root = join(output, 'data'), profile = join(output, 'profile')
  await mkdir(root, { recursive: true }); await mkdir(profile, { recursive: true })
  app.setAppPath(root); app.setPath('appData', profile); app.setPath('userData', join(profile, 'user'))
  await mkdir(join(root, 'build'), { recursive: true })
  for (const file of ['runtime-catalog.json', 'runtime-recipes.json', 'tray.png', 'icon.ico']) await copyFile(resolve('build', file), join(root, 'build', file))
  const errors = [], gone = []
  let phase = 'startup'
  const samples = []
  const sample = () => {
    if (!app.isReady()) return
    const processes = app.getAppMetrics().map(({ pid, type, name, memory }) => ({ pid, type, name, workingSetKiB: memory.workingSetSize, privateKiB: memory.privateBytes ?? 0 }))
    samples.push({ at: Date.now(), phase, workingSetKiB: processes.reduce((sum, process) => sum + process.workingSetKiB, 0), privateKiB: processes.reduce((sum, process) => sum + process.privateKiB, 0), processes })
  }
  const monitor = memoryMode ? setInterval(sample, 100) : undefined
  const originalError = console.error
  console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args) }
  app.on('render-process-gone', (_event, contents, details) => gone.push({ id: contents.id, reason: details.reason }))
  const wait = async (check, label) => {
    for (let at = 0; at < 60000; at += 100) { if (await check()) return; await pause(100) }
    throw new Error(`Timed out: ${label}`)
  }
  const windows = () => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed())
  const workspace = () => windows().find(window => new URL(window.webContents.getURL() || 'about:blank').searchParams.get('workspace') === '1')
  const ready = async window => {
    await wait(async () => !window.isDestroyed() && !window.webContents.isCrashed() && !window.webContents.isLoadingMainFrame()
      && await window.webContents.executeJavaScript("document.querySelector('#root')?.children.length > 0"), 'renderer first content')
  }
  const run = async () => {
    await import(pathToFileURL(resolve('out/main/index.js')).href)
    await wait(() => windows().some(window => /^https?:/.test(window.webContents.getURL()) && new URL(window.webContents.getURL()).pathname === '/' && !new URL(window.webContents.getURL()).searchParams.has('workspace')), 'main window')
    const main = windows().find(window => /^https?:/.test(window.webContents.getURL()) && new URL(window.webContents.getURL()).pathname === '/')
    await ready(main)
    await wait(() => main.webContents.executeJavaScript("!!document.querySelector('.nola-main [data-page=home]')"), 'home route after application import')
    await pause(1000)
    assert.equal(workspace(), undefined, 'startup must not allocate a hidden reader renderer')
    assert.equal(windows().some(window => new URL(window.webContents.getURL() || 'about:blank').searchParams.get('overlay') === '1'), false, 'startup must not allocate a hidden caption renderer')
    console.log('PASS: main application starts without preloading the reader')
    const show = () => main.webContents.executeJavaScript('window.nolaTranslator.showWorkspace()', true)
    if (memoryMode) {
      await pause(5000); sample(); phase = 'workspace'
      await show(); await ready(workspace()); await pause(5000); sample()
      const peaks = Object.fromEntries(['startup', 'workspace'].map(name => {
        const values = samples.filter(value => value.phase === name)
        const peak = values.reduce((best, value) => value.workingSetKiB > best.workingSetKiB ? value : best)
        return [name, { workingSetMiB: Math.round(peak.workingSetKiB / 102.4) / 10, privateMiB: Math.round(Math.max(...values.map(value => value.privateKiB)) / 102.4) / 10, processesAtWorkingSetPeak: peak.processes }]
      }))
      await writeFile(join(output, `memory-${label}.json`), JSON.stringify({ intervalMs: 100, scope: 'Electron processes; isolated profile; no inference models or backend runtime loaded', peaks, samples }, null, 2))
      return
    }
    await show(); const first = workspace(); assert.ok(first); await ready(first)
    const firstId = first.id
    first.close(); await show()
    assert.equal(workspace(), first, 'hiding the reader must retain its session')
    first.webContents.forcefullyCrashRenderer()
    await wait(() => first.isDestroyed(), 'crashed workspace cleanup')
    await show(); const replacement = workspace(); assert.ok(replacement); await ready(replacement)
    assert.notEqual(replacement.id, firstId)
    console.log('PASS: reader retains a hidden session and recovers from a renderer crash')
    replacement.destroy()
    await fetch(new URL('/__startup_failure__?enabled=1', process.env.ELECTRON_RENDERER_URL))
    try { await assert.rejects(show(), /ERR_|failed|ERROR/i) }
    finally { await fetch(new URL('/__startup_failure__?enabled=0', process.env.ELECTRON_RENDERER_URL)) }
    await wait(() => !workspace(), 'failed load cleanup')
    await show(); await ready(workspace())
    assert.equal(gone.some(value => value.reason === 'oom'), false, JSON.stringify(gone))
    assert.equal(errors.some(error => /Error sending from webFrameMain|Render frame was disposed/.test(error)), false, errors.join('\n'))
    console.log('PASS: failed reader load is discarded and a later request opens normally without disposed-frame sends')
  }
  void run().then(async () => {
    clearInterval(monitor)
    await writeFile(join(output, 'result.json'), JSON.stringify({ runId: process.env.NOLA_STARTUP_CHECK_RUN, passed: true, rendererExits: gone }, null, 2))
    for (const window of windows()) window.destroy()
    app.exit(0)
  }).catch(error => { clearInterval(monitor); originalError(error); for (const window of windows()) window.destroy(); app.exit(1) })
}
