import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow } from 'electron'
app.disableHardwareAcceleration()
const settings = { version:1, theme:'system', uiLanguage:'zh-CN', modelStoragePath:'', recognition:{modelId:'qwen3-asr-1.7b-hf',sourceLanguage:'auto'},
  overlay:{mode:'bottom',colorScheme:'dark',locked:true,alwaysOnTop:true,fontFamily:'Segoe UI Variable',fontSize:26,fontWeight:600,translationFontSize:22,translationFontWeight:500,sourceColor:'#FFFFFF',translationColor:'#FFFFFF',backgroundColor:'#111111',backgroundOpacity:0.84,lineHeight:1.3,translationLineHeight:1.35,showSource:true,showTranslation:true,layout:'rolling'},
  translation:{provider:'hymt2',microsoftEndpoint:'',microsoftRegion:'',openaiEndpoint:'',openaiModel:'',ollamaEndpoint:'',ollamaModel:'',translateIntermediate:false,targetLanguage:'zh'} }
const preload = `
const {contextBridge} = require('electron');
let settings = ${JSON.stringify(settings)}; const sl=new Set(), el=new Set();
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings:async()=>settings, updateSettings:async(p)=>{settings={...settings,...p,recognition:{...settings.recognition,...p.recognition},overlay:{...settings.overlay,...p.overlay},translation:{...settings.translation,...p.translation}};sl.forEach(f=>f(settings));return settings},
  onSettingsChanged:f=>{sl.add(f);return()=>sl.delete(f)}, onEngineEvent:f=>{el.add(f);return()=>el.delete(f)},
  listDevices:async()=>[], listResources:async()=>({storagePath:'x',resources:[]}), getModelStorage:async()=>null,
  chooseModelStorageDirectory:async()=>null, restartApp:async()=>{},
  listMeetings:async()=>[], getMeeting:async()=>null, readMeeting:async()=>[], renameMeeting:async()=>null, deleteMeeting:async()=>true, exportMeeting:async()=>null, getMeetingAudioUrl:async()=>null,
  getDiagnostics:async()=>({}), copyDiagnostics:async()=>{}, hasTranslationCredential:async()=>false, setTranslationCredential:async()=>{},
  showOverlay:async()=>{}, hideOverlay:async()=>{}, startSession:async()=>({sessionId:'x',meetingId:null}), stopSession:async()=>{}, resizeOverlay:async()=>{}, openAppearance:async()=>{}, onOpenAppearance:()=>()=>{}
});`
const settle = async (w) => { await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r=>setTimeout(r,350)) }
const pick = (value) => `(()=>{const s=document.querySelector('select[aria-label="目标语言"]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`
const probe = `(()=>{const s=document.querySelector('select[aria-label="目标语言"]');return s?'value='+s.value:'missing'})()`
app.whenReady().then(async () => {
  const p = resolve('artifacts/layout','fixture-probe.cjs'); await writeFile(p, preload)
  const w = new BrowserWindow({ width:1120, height:820, show:false, webPreferences:{preload:p,contextIsolation:true,sandbox:true} })
  await w.loadFile(resolve('out/renderer/index.html')); await settle(w)
  const log = []
  log.push('initial: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(pick('en')); await settle(w)
  log.push('set English: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(pick('ja')); await settle(w)
  log.push('set 日本語: ' + await w.webContents.executeJavaScript(probe))
  await w.webContents.executeJavaScript(pick('zh')); await settle(w)
  log.push('set 中文: ' + await w.webContents.executeJavaScript(probe))
  console.log(log.join('\n'))
  w.close(); app.exit(0)
})
