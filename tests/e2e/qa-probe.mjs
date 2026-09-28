import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow } from 'electron'
app.disableHardwareAcceleration()
const settings = { version:1, theme:'system', uiLanguage:'zh-CN', modelStoragePath:'', historyEnabled:false, recognition:{modelId:'qwen3-asr-1.7b-hf'},
  overlay:{mode:'bottom',colorScheme:'dark',locked:true,alwaysOnTop:true,fontFamily:'Segoe UI Variable',fontSize:26,fontWeight:600,translationFontSize:22,translationFontWeight:500,sourceColor:'#FFFFFF',translationColor:'#FFFFFF',backgroundColor:'#111111',backgroundOpacity:0.84,maxLines:2,lineHeight:1.3,translationMaxLines:2,translationLineHeight:1.35,showSource:true,showTranslation:true},
  translation:{provider:'hymt2',microsoftEndpoint:'',microsoftRegion:'',openaiEndpoint:'',openaiModel:'',ollamaEndpoint:'',ollamaModel:'',translateIntermediate:false} }
const preload = `
const {contextBridge} = require('electron');
let settings = ${JSON.stringify(settings)}; const sl=new Set(), el=new Set();
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings:async()=>settings, updateSettings:async(p)=>{settings={...settings,...p,recognition:{...settings.recognition,...p.recognition},overlay:{...settings.overlay,...p.overlay},translation:{...settings.translation,...p.translation}};sl.forEach(f=>f(settings));return settings},
  onSettingsChanged:f=>{sl.add(f);return()=>sl.delete(f)}, onEngineEvent:f=>{el.add(f);return()=>el.delete(f)},
  listDevices:async()=>[], listResources:async()=>({storagePath:'x',resources:[]}), getModelStorage:async()=>null,
  chooseModelStorageDirectory:async()=>null, restartApp:async()=>{}, listHistory:async()=>[], clearHistory:async()=>{}, exportHistory:async()=>null,
  getDiagnostics:async()=>({}), copyDiagnostics:async()=>{}, hasTranslationCredential:async()=>false, setTranslationCredential:async()=>{},
  showOverlay:async()=>{}, hideOverlay:async()=>{}, startSession:async()=>({sessionId:'x'}), stopSession:async()=>{}, resizeOverlay:async()=>{}, openAppearance:async()=>{}, onOpenAppearance:()=>()=>{}
});`
const settle = async (w) => { await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r=>setTimeout(r,350)) }
const probe = `(label => [...document.querySelectorAll('.multi-select-option')].map(o=>o.textContent.trim()+':'+(o.querySelector('input').checked?'on':'off')).join(' | ')+' || trigger='+document.querySelector('.multi-select-value').textContent)`
app.whenReady().then(async () => {
  const p = resolve('artifacts/layout','fixture-probe.cjs'); await writeFile(p, preload)
  const w = new BrowserWindow({ width:1120, height:820, show:false, webPreferences:{preload:p,contextIsolation:true,sandbox:true} })
  await w.loadFile(resolve('out/renderer/index.html')); await settle(w)
  const log = []
  await w.webContents.executeJavaScript(`document.querySelector('.multi-select-trigger').click()`); await settle(w)
  log.push('open: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(`document.querySelectorAll('.multi-select-option input')[1].click()`); await settle(w)
  log.push('click English: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(`document.querySelectorAll('.multi-select-option input')[2].click()`); await settle(w)
  log.push('click 日本語: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(`document.querySelectorAll('.multi-select-option input')[1].click()`); await settle(w)
  log.push('click English again: ' + await w.webContents.executeJavaScript(probe))
  console.log(log.join('\n'))
  w.close(); app.exit(0)
})
