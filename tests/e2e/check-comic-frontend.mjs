import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { build } from 'esbuild'
import { PDFDocument } from 'pdf-lib'

app.disableHardwareAcceleration()
const output = resolve(
  process.env.NOLA_COMIC_E2E_OUTPUT || 'artifacts/comic-rewrite/ui',
)
app.setPath('userData', resolve(output, `profile-${Date.now()}`))
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const errors = []
let window, backend, comic
const evaluate = (expression) =>
  window.webContents.executeJavaScript(expression, true)
async function wait(expression) {
  for (let index = 0; index < 300; index++) {
    if (await evaluate(`(async()=>Boolean(await (${expression})))()`)) return
    await delay(50)
  }
  throw new Error(
    `Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1400)')}`,
  )
}
async function clickText(text) {
  const expression = `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)})`
  await wait(expression)
  await evaluate(`${expression}.click()`)
  await delay(120)
}
async function capture(name) {
  await delay(350)
  await writeFile(
    resolve(output, `${name}.png`),
    (await window.webContents.capturePage()).toPNG(),
  )
}
async function input(id, value) {
  await evaluate(
    `(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  )
}
async function run() {
  await mkdir(output, { recursive: true })
  const socket = createServer()
  await new Promise((done) => socket.listen(0, '127.0.0.1', done))
  const port = socket.address().port
  await new Promise((done) => socket.close(done))
  const token = 'comic-e2e-local-control'
  const baseUrl = `http://127.0.0.1:${port}`
  backend = spawn(
    process.env.NOLA_TEST_PYTHON || resolve('.venv/Scripts/python.exe'),
    [
      '-c',
      `import sys; sys.path.insert(0,${JSON.stringify(resolve('engine'))}); import uvicorn; from nola_translator_engine.backend.app import create_app; uvicorn.run(create_app(control_token='${token}'),host='127.0.0.1',port=${port},log_level='warning')`,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: resolve('engine'),
        NOLA_COMIC_DIR: resolve(output, `library-${Date.now()}`),
        NOLA_COMIC_FONT_PATH: resolve(
          'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf',
        ),
      },
      windowsHide: true,
    },
  )
  let backendLog = ''
  backend.stderr.on('data', (value) => {
    backendLog += String(value)
  })
  let ready = false
  for (let index = 0; index < 200; index++) {
    try {
      const response = await fetch(`${baseUrl}/api/v2/health/live`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await delay(100)
  }
  assert.equal(ready, true, backendLog)
  const settingsBundle = await build({
    entryPoints: ['src/shared/settings.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const { DEFAULT_SETTINGS } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(settingsBundle.outputFiles[0].text).toString('base64')
  )
  const settings = {
    ...DEFAULT_SETTINGS,
    uiLanguage: 'zh-CN',
    onboardingSeen: true,
    onboardingVersion: 999,
    onboardingCompletedVersion: 999,
  }
  const preload = resolve(output, 'host.cjs')
  await writeFile(
    preload,
    `const {contextBridge,ipcRenderer}=require('electron'); const noop=()=>()=>{}; let settings=${JSON.stringify(settings)}; const invoke=(channel,request)=>ipcRenderer.invoke(channel,request); const onChanged=callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('comic:changed',listener);return ()=>ipcRenderer.off('comic:changed',listener)}; contextBridge.exposeInMainWorld('nolaTranslator', {
    isWindows:true,minimizeMainWindow:()=>{},toggleMainWindowMaximize:()=>{},closeMainWindow:()=>{},isMainWindowMaximized:async()=>false,onMainWindowMaximizedChanged:noop,
    getSettings:async()=>settings,updateSettings:async patch=>(settings={...settings,...patch}),onSettingsChanged:noop,
    getEngineState:async()=>'ready',onEngineEvent:noop,onOverlayVisibilityChanged:noop,getOverlayVisibility:async()=>false,onOverlayMenuChanged:noop,onOverlayLockChanged:noop,onOpenAppearance:noop,
    listMeetings:async()=>[],listDevices:async()=>[],listResources:async()=>({storagePath:'',resources:[]}),getRuntimes:async()=>({}),listComputeDevices:async()=>({devices:[],notes:[],activePlan:null}),getModelStorage:async()=>({activePath:'',configuredPath:'',restartRequired:false}),hasTranslationCredential:async()=>false,
    gateway:{snapshot:async()=>({models:[],workers:[],resources:[],leases:[],jobs:[]}),onChanged:noop},
    glossary:{snapshot:async()=>({schemaVersion:1,revision:0,matchingRevision:0,enabled:true,libraries:[]}),onChanged:noop},
    wordRules:{snapshot:async()=>({schemaVersion:1,revision:0,matchingRevision:0,preserveEnabled:true,maskEnabled:true,libraries:[]}),onChanged:noop},
    browserConnection:async()=>({enabled:false,registered:false,connections:0,sessionActive:false,captionServiceActive:false,browsers:[]}),checkLatestRelease:async()=>({currentVersion:'1.2.3',latestVersion:null,updateAvailable:false}),showWorkspace:async()=>{},showOverlay:async()=>{},prewarm:async()=>{},enableCaptionService:async()=>{},
    comic:{ listProjects:()=>invoke('comic:list'),openProject:id=>invoke('comic:open',id),openQuickWorkspace:()=>invoke('comic:quick'),saveQuickToLibrary:id=>invoke('comic:save-quick',id),importProject:request=>invoke('comic:import',request),exportProject:request=>invoke('comic:export',request),deleteProject:id=>invoke('comic:delete',[id]),restoreProject:id=>invoke('comic:restore',[id]),deleteProjects:ids=>invoke('comic:delete',ids),restoreProjects:ids=>invoke('comic:restore',ids),edit:request=>invoke('comic:edit',request),run:request=>invoke('comic:run',request),listTasks:()=>invoke('comic:tasks'),controlTask:(id,action)=>invoke('comic:task-control',{id,action}),image:(projectId,pageId,kind,maxPixels)=>invoke('comic:image',{projectId,pageId,kind,...(maxPixels?{maxPixels}:{})}),thumbnail:(projectId,pageId)=>invoke('comic:image',{projectId,pageId,kind:'source',maxPixels:40000}),listFonts:()=>invoke('comic:fonts'),readFont:family=>invoke('comic:read-font',family),onChanged}
  });`,
  )
  await build({
    entryPoints: ['src/main/comic.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outfile: resolve(output, 'comic-main.cjs'),
  })
  const { ComicTranslation } = createRequire(import.meta.url)(
    resolve(output, 'comic-main.cjs'),
  )
  window = new BrowserWindow({
    width: 1500,
    height: 1000,
    show: true,
    frame: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  comic = new ComicTranslation({
    mainDir: resolve('out/main'),
    backend: async () => ({
      baseUrl,
      authorizationHeader: () => ({ Authorization: `Bearer ${token}` }),
    }),
    getMainWindow: () => window,
    glossary: async () => ({
      schemaVersion: 1,
      revision: 0,
      matchingRevision: 0,
      enabled: true,
      libraries: [],
    }),
    wordRules: async () => ({
      schemaVersion: 1,
      revision: 0,
      matchingRevision: 0,
      preserveEnabled: true,
      maskEnabled: true,
      libraries: [],
    }),
    translate: async (input) => {
      await delay(350)
      return input.page.regions
        .filter(
          (region) =>
            !region.ignored && !region.locked && region.sourceText.trim(),
        )
        .map((region) => ({ id: region.id, text: '下一站，晴天。' }))
    },
    publish: (event) => window.webContents.send('comic:changed', event),
  })
  const destination = resolve(output, 'translated.pdf')
  dialog.showSaveDialog = async () => ({
    canceled: false,
    filePath: destination,
  })
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  await window.loadFile(resolve('out/renderer/index.html'), {
    hash: '/comic-translation',
  })
  await wait(
    `document.body.innerText.includes('书架为空') || document.body.innerText.includes('导入漫画')`,
  )
  await wait(`!document.getElementById('splash')`)
  await capture('bookshelf-empty-light')
  const document = await PDFDocument.create()
  for (let index = 0; index < 2; index++) {
    const page = document.addPage([400, 600])
    page.drawText('Nola - Page ' + (index + 1), { x: 40, y: 480, size: 18 })
  }
  const source = resolve(output, '真实导入.pdf')
  await writeFile(source, await document.save())
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Page.enable')
  await window.webContents.debugger.sendCommand(
    'Page.setInterceptFileChooserDialog',
    { enabled: true },
  )
  window.webContents.debugger.on(
    'message',
    async (_event, method, parameters) => {
      if (method === 'Page.fileChooserOpened')
        await window.webContents.debugger.sendCommand('DOM.setFileInputFiles', {
          backendNodeId: parameters.backendNodeId,
          files: [source],
        })
    },
  )
  await clickText('快速翻译')
  await evaluate(`document.querySelector('.comic-quick-upload').click()`)
  await wait(
    `document.querySelectorAll('.comic-workflow__thumbnail').length === 2`,
  )
  const bookId = await evaluate(`location.hash.split('/')[2]`)
  await capture('translation-light')
  await clickText('进入编辑')
  await evaluate(`document.querySelector('[aria-label="添加气泡"]').click()`)
  await delay(80)
  const rect = await evaluate(
    `(() => { const r = document.querySelector('.comic-workflow__image-panel:last-child .comic-bubble-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`,
  )
  const a = {
      x: Math.round(rect.x + rect.width * 0.1),
      y: Math.round(rect.y + rect.height * 0.08),
    },
    b = {
      x: Math.round(rect.x + rect.width * 0.55),
      y: Math.round(rect.y + rect.height * 0.32),
    }
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    button: 'left',
    clickCount: 1,
    ...a,
  })
  await delay(80)
  window.webContents.sendInputEvent({ type: 'mouseMove', ...b })
  await delay(80)
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    button: 'left',
    clickCount: 1,
    ...b,
  })
  await wait(`document.getElementById('comic-source-text')`)
  await input('comic-source-text', 'Nola - next station')
  await wait(
    `window.nolaTranslator.comic.openProject(${JSON.stringify(bookId)}).then(book=>book.pages[0].regions.some(region=>region.sourceText==='Nola - next station'))`,
  )
  await evaluate(
    `(async()=>{const api=window.nolaTranslator.comic;const book=await api.openProject(${JSON.stringify(bookId)});const configured=await api.edit({projectId:book.id,expectedRevision:book.revision,operationId:crypto.randomUUID(),command:{action:'configure',config:{...book.config,normalModel:'e2e-provider',repairMethod:'telea'}}});await api.edit({projectId:book.id,expectedRevision:configured.revision,operationId:crypto.randomUUID(),command:{action:'savePages',pages:configured.pages.map(page=>({id:page.id,regions:page.regions.length?page.regions:[{...configured.pages[0].regions[0],id:crypto.randomUUID()}]}))}});})()`,
  )
  await clickText('退出编辑')
  await clickText('普通翻译')
  await wait(
    `document.querySelector('[data-slot="toast"][data-type="loading"]')`,
  )
  assert.equal(
    await evaluate(
      `document.querySelector('.comic-workflow__progress')===null`,
    ),
    true,
  )
  await capture('translation-running')
  await wait(
    `window.nolaTranslator.comic.listTasks().then(tasks=>tasks.at(-1)?.status==='completed')`,
  )
  await wait(
    `[...document.querySelectorAll('[data-slot="toast"][data-type="success"]')].some(node=>node.textContent.includes('处理完成'))`,
  )
  const jobs = await evaluate(`window.nolaTranslator.comic.listTasks()`)
  assert.equal(jobs.at(-1).status, 'completed', JSON.stringify(jobs))
  await clickText('进入编辑')
  await wait(
    `document.getElementById('comic-target-text')?.value === '下一站，晴天。'`,
  )
  await capture('editor-light')
  await input('comic-target-text', '人工编辑已保存。')
  await wait(
    `window.nolaTranslator.comic.openProject(${JSON.stringify(bookId)}).then(book=>book.pages[0].regions.some(region=>region.targetText==='人工编辑已保存。'))`,
  )
  await evaluate(`document.querySelector('[aria-label="四角变形"]').click()`)
  await wait(
    `document.querySelector('.comic-workflow__image-panel:last-child [data-comic-corner="0"]')`,
  )
  const corner = await evaluate(
    `(() => { const r=document.querySelector('.comic-workflow__image-panel:last-child [data-comic-corner="0"]').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`,
  )
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    button: 'left',
    clickCount: 1,
    ...corner,
  })
  await delay(80)
  window.webContents.sendInputEvent({
    type: 'mouseMove',
    x: corner.x + 20,
    y: corner.y + 12,
  })
  await delay(80)
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    button: 'left',
    clickCount: 1,
    x: corner.x + 20,
    y: corner.y + 12,
  })
  await wait(
    `window.nolaTranslator.comic.openProject(${JSON.stringify(bookId)}).then(book=>book.pages[0].regions.some(region=>region.textQuad?.length===4 && region.sourceQuad?.length===4))`,
  )
  await wait(
    `document.querySelector('.comic-workflow__image-panel:last-child [data-comic-region]')?.style.transform.startsWith('matrix3d')`,
  )
  assert.equal(
    await evaluate(
      `document.querySelectorAll('img:not([src]), img[src=""]').length`,
    ),
    0,
  )
  await capture('editor-perspective')
  await clickText('导出')
  await wait(`document.querySelector('[role="dialog"]')`)
  await evaluate(
    `document.querySelector('[role="dialog"] .comic-workflow__dialog-content button:last-child').click()`,
  )
  await wait(
    `[...document.querySelectorAll('[data-slot="toast"][data-type="success"]')].some(node=>node.textContent.includes('导出'))`,
  )
  assert.equal(
    (await PDFDocument.load(await readFile(destination))).getPageCount(),
    2,
  )
  await evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="关闭"]').click()`,
  )
  await evaluate(`location.hash='/comic-translation/${bookId}/reader'`)
  await wait(`document.querySelector('.comic-canvas__scroll img')`)
  await capture('reader-light')
  await clickText('开始翻译')
  await wait(`document.querySelector('.comic-workflow')`)
  await clickText('进入编辑')
  await wait(`document.getElementById('comic-target-text')`)
  assert.equal(
    await evaluate(`document.getElementById('comic-target-text').value`),
    '人工编辑已保存。',
  )
  const reloaded = new Promise((done) =>
    window.webContents.once('did-finish-load', done),
  )
  window.webContents.reload()
  await reloaded
  await wait(
    `document.querySelector('.comic-workflow') && !document.getElementById('splash')`,
  )
  await clickText('进入编辑')
  await wait(`document.getElementById('comic-target-text')`)
  assert.equal(
    await evaluate(`document.getElementById('comic-target-text').value`),
    '人工编辑已保存。',
  )
  await evaluate(
    `document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark'`,
  )
  await capture('editor-dark')
  window.setContentSize(820, 950)
  await capture('editor-narrow')
  window.webContents.setZoomFactor(2)
  await capture('editor-zoom-200')
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth > innerWidth+1`),
    false,
  )
  assert.equal(
    await evaluate(
      `document.body.innerText.includes('模拟') || document.body.innerText.includes('原型')`,
    ),
    false,
  )
  window.webContents.setZoomFactor(1)
  window.setContentSize(1500, 1000)
  await evaluate(
    `document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light';location.hash='/settings/preserve-words'`,
  )
  await clickText('新建词库')
  await wait(`document.querySelector('[role="dialog"]')`)
  await capture('preserve-words-light')
  await evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="关闭"]').click()`,
  )
  await evaluate(
    `document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';location.hash='/settings/subtitle-words'`,
  )
  await clickText('新建词库')
  await wait(`document.querySelector('[role="dialog"]')`)
  await capture('subtitle-words-dark')
  await evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="关闭"]').click()`,
  )
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        errors,
        pageCount: 2,
        modelProvider: 'deterministic test provider only',
        backend: 'real FastAPI + SQLite + repair + layout + export',
        zoom: 2,
        perspective:
          'native four-corner drag, persisted geometry and PDF export passed',
      },
      null,
      2,
    ),
  )
  assert.deepEqual(errors, [])
  console.log('Real comic pipeline UI checks passed')
}
app.whenReady().then(async () => {
  try {
    await run()
  } catch (error) {
    console.error(error)
    if (window) await capture('failure')
    process.exitCode = 1
  } finally {
    await comic?.dispose().catch(() => {})
    backend?.kill()
    window?.destroy()
    app.quit()
  }
})
