import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { build } from 'esbuild'

const output = resolve('artifacts/ocr-models')
app.setPath('userData', resolve(output, `cache-${process.pid}`))
app.disableHardwareAcceleration()
const compiled = await build({ entryPoints: ['src/shared/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const languageBundle = await build({ entryPoints: ['src/shared/languages.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'languageCatalog', write: false })
const python = `import json
from nola_translator_engine.models.ocr_catalog import OCR_VARIANTS, OCR_NAMES, OCR_LANGUAGES
print(json.dumps([dict(resourceId=s.model_id,kind='ocrModel',provider='pp-ocrv5',name=OCR_NAMES[s.model_id],description='OCR',languages=OCR_LANGUAGES[s.model_id],installed=False,installedBytes=0,downloadBytes=s.total_bytes,state='idle',cancellable=False) for s in OCR_VARIANTS]))`
const { stdout } = await promisify(execFile)(resolve('.venv/Scripts/python.exe'), ['-c', python], { cwd: resolve('engine'), windowsHide: true })
const resources = JSON.parse(stdout)
const preload = `const { contextBridge } = require('electron');
let settings = ${JSON.stringify({ ...DEFAULT_SETTINGS, onboardingSeen: true, uiLanguage: 'zh-CN', theme: 'light' })};
const listeners = new Set(); const noop = () => () => {};
contextBridge.exposeInMainWorld('nolaTranslator', {
 getSettings: async () => settings, updateSettings: async patch => { settings = { ...settings, ...patch }; listeners.forEach(fn => fn(settings)); return settings },
 onSettingsChanged: fn => { listeners.add(fn); return () => listeners.delete(fn) }, onEngineEvent: noop,
 checkLatestRelease: async () => ({currentVersion:'fixture',latestVersion:null,updateAvailable:false}),
 getEngineState: async () => 'ready', listResources: async () => ({storagePath:'fixture',resources:${JSON.stringify(resources)}}),
 getModelStorage: async () => ({activePath:'fixture',configuredPath:'',restartRequired:false}), listDevices: async () => [],
 listMeetings: async () => [], listComputeDevices: async () => ({devices:[]}), hasTranslationCredential: async () => false,
 browserConnection: async () => ({ enabled:false,registered:false,connections:0,sessionActive:false,browsers:[] }),
 onOverlayMenuChanged: noop, onOverlayLockChanged: noop, onOverlayVisibilityChanged: noop, onOpenAppearance: noop, getOverlayVisibility: async () => false,
 gateway: { snapshot: async () => ({state:'stopped',address:'',port:0,connections:0,activeRequests:0,services:{},requests:[]}), onChanged:noop },
});`
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(window, expression) {
 for (let i = 0; i < 100; i++) { if (await window.webContents.executeJavaScript(expression)) return; await wait(100) }
 throw new Error(`UI timeout: ${expression}`)
}
let window
const diagnostics=[]
void app.whenReady().then(async () => {
try {
 await mkdir(output, {recursive:true})
 const preloadPath = resolve(output, 'fixture.cjs'); await writeFile(preloadPath, preload)
 window = new BrowserWindow({width:1200,height:820,show:false,webPreferences:{preload:preloadPath,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}})
 window.webContents.on('console-message', details => diagnostics.push(details.message))
 await window.loadFile(resolve('out/renderer/index.html'), {hash:'/models'})
 await until(window, '!!document.querySelector("[data-model-family=ocr].models-card")')
 const languageChecks = await window.webContents.executeJavaScript(`(() => {
   ${languageBundle.outputFiles[0].text}
   const codes = [...new Set([...Object.keys(languageCatalog.LANGUAGE_LABELS), ...${JSON.stringify(resources.flatMap(record => record.languages))}])];
   return ['zh-CN','zh-TW','zh-HK','en','ja','ko'].flatMap(locale => codes.map(code => ({locale,code,name:languageCatalog.languageName(code,locale)})));
 })()`)
 assert.deepEqual(languageChecks.filter(({code,name}) => code.toLowerCase() === name.toLowerCase()), [])
 const spacing = await window.webContents.executeJavaScript(`(() => {
   const card = document.querySelector('[data-model-family=ocr].models-card'); const section = card.closest('section');
   const previous = section.previousElementSibling; const a = section.getBoundingClientRect(), b = previous.getBoundingClientRect();
   card.scrollIntoView({block:'end'});
   return {actual:a.top-b.bottom,expected:parseFloat(getComputedStyle(section.parentElement).gap),title:section.querySelector('h2')?.textContent};
 })()`)
 assert.equal(spacing.title, 'OCR 模型')
 assert(Math.abs(spacing.actual-spacing.expected)<1)
 await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await wait(200)
 await writeFile(resolve(output,'catalog.png'),(await window.webContents.capturePage()).toPNG())
 await window.webContents.executeJavaScript(`document.querySelector('[data-model-family=ocr].models-card button').click()`)
 await until(window, '!!document.querySelector("[role=dialog][data-model-family=ocr]")')
 await window.webContents.executeJavaScript(`document.querySelector('[role=dialog] #ocr-variant').click()`)
 await until(window, 'document.querySelectorAll("[role=option]").length===12')
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('[role=option]')].find(node=>node.textContent.includes('Latin')).click()`)
 await until(window, `!![...document.querySelectorAll('[role=dialog] span')].find(node=>node.textContent==='法语')`)
 const checks=[]
 for (const locale of ['zh-CN','zh-TW','zh-HK','en','ja','ko']) for (const theme of ['light','dark']) for (const [width,height] of [[1200,820],[900,700],[760,620]]) {
   window.setSize(width,height)
   await window.webContents.executeJavaScript(`window.nolaTranslator.updateSettings(${JSON.stringify({uiLanguage:locale,theme})})`)
   await window.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))'); await wait(100)
   const bounds = await window.webContents.executeJavaScript(`(() => {
     const dialog=document.querySelector('[role=dialog]'),box=dialog.getBoundingClientRect();
     const field=dialog.querySelector('.model-language-field'),chips=dialog.querySelectorAll('.model-language-chip');
     return {x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:innerWidth,height:innerHeight,overflow:dialog.scrollWidth-dialog.clientWidth,
       chips:chips.length,fieldWidth:field.getBoundingClientRect().width,bodyWidth:dialog.querySelector('.models-family-dialog__body').clientWidth};
   })()`)
   assert(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1&&bounds.overflow<=1,JSON.stringify({locale,theme,...bounds}))
   assert.equal(bounds.chips,resources.find(record=>record.resourceId==='pp-ocrv5-mobile-latin-onnx').languages.length)
   assert(Math.abs(bounds.fieldWidth-bounds.bodyWidth)<1,JSON.stringify({locale,theme,...bounds}))
   checks.push({locale,theme,width,height})
   if (locale==='zh-CN'&&width===1200) await writeFile(resolve(output,`dialog-${theme}.png`),(await window.webContents.capturePage()).toPNG())
 }
 await writeFile(resolve(output,'report.json'),JSON.stringify({passed:true,spacing,checks,languageChecks},null,2))
 console.log(JSON.stringify({passed:true,spacing,checks:checks.length,languageChecks:languageChecks.length,output}))
} catch(error) {
 process.exitCode=1
 console.error(error)
 if (window) {
  const body=await window.webContents.executeJavaScript('document.body.innerText.slice(0,3000)');console.error(body)
  const failedImage=await window.webContents.capturePage().catch(()=>undefined); if(failedImage) await writeFile(resolve(output,'failure.png'),failedImage.toPNG())
 }
 await writeFile(resolve(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2))
 process.exitCode=1
}
finally {window?.destroy();app.exit(process.exitCode ?? 0)}
})
