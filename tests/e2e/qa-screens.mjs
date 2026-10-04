import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { app, BrowserWindow } from 'electron'
app.disableHardwareAcceleration()
const out = resolve('artifacts/layout')
const settings = { version:1, theme:'system', uiLanguage:'zh-CN', modelStoragePath:'',
  recognition:{modelId:'qwen3-asr-1.7b-hf',sourceLanguage:'auto'},
  overlay:{mode:'bottom',colorScheme:'dark',locked:true,alwaysOnTop:true,fontFamily:'Segoe UI Variable',fontSize:26,fontWeight:600,translationFontSize:22,translationFontWeight:500,sourceColor:'#FFFFFF',translationColor:'#FFFFFF',backgroundColor:'#111111',backgroundOpacity:0.84,lineHeight:1.3,translationLineHeight:1.35,showSource:true,showTranslation:true,layout:'rolling'},
  translation:{provider:'local',localModelId:'m2m100-418m',microsoftEndpoint:'https://api.cognitive.microsofttranslator.com',microsoftRegion:'',cloudEndpoint:'https://api.openai.com/v1',cloudModel:'gpt-4.1-mini',cloudApiFormat:'chat-completions',translateIntermediate:false,targetLanguage:'zh'} }
const rec = { resourceId:'qwen3-asr-1.7b-hf', kind:'recognitionModel', provider:'qwen3-asr', name:'Qwen3-ASR 1.7B', description:'x', languages:['zh'], installed:true, installedBytes:4300000000, state:'idle', cancellable:false }
const rec2 = { resourceId:'qwen3-asr-0.6b-hf', kind:'recognitionModel', provider:'qwen3-asr', name:'Qwen3-ASR 0.6B', description:'x', languages:['zh'], installed:false, installedBytes:0, downloadBytes:1880619678, state:'idle', cancellable:false }
const tr = { resourceId:'hy-mt2-1.8b-q4-k-m', kind:'translationModel', provider:'hy-mt2', name:'Hy-MT2 1.8B Q4_K_M', description:'x', languages:['zh'], installed:true, installedBytes:1130000000, state:'idle', cancellable:false }
const m2 = { resourceId:'m2m100-418m', kind:'translationModel', provider:'m2m100', name:'M2M100 418M', description:'x', languages:['zh'], installed:false, installedBytes:0, downloadBytes:1941936305, state:'idle', cancellable:false }
const preload = `
const {contextBridge} = require('electron');
let settings = ${JSON.stringify(settings)};
const sl=new Set(), el=new Set();
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings:async()=>settings, updateSettings:async(p)=>{settings={...settings,...p,recognition:{...settings.recognition,...p.recognition},overlay:{...settings.overlay,...p.overlay},translation:{...settings.translation,...p.translation}};sl.forEach(f=>f(settings));return settings},
  onSettingsChanged:f=>{sl.add(f);return()=>sl.delete(f)}, onEngineEvent:f=>{el.add(f);return()=>el.delete(f)},
  listDevices:async()=>[], listResources:async()=>({storagePath:'D:/Models/Nola Translator/models',resources:[${JSON.stringify(rec)},${JSON.stringify(rec2)},${JSON.stringify(tr)},${JSON.stringify(m2)}]}),
  getModelStorage:async()=>({activePath:'D:/Models/Nola Translator',configuredPath:'',restartRequired:false}),
  chooseModelStorageDirectory:async()=>null, restartApp:async()=>{},
  listMeetings:async()=>[], getMeeting:async()=>null, readMeeting:async()=>[], renameMeeting:async()=>null, deleteMeeting:async()=>true, exportMeeting:async()=>null, getMeetingAudioUrl:async()=>null,
  getDiagnostics:async()=>({}), copyDiagnostics:async()=>{}, hasTranslationCredential:async()=>false, setTranslationCredential:async()=>{},
  showOverlay:async()=>{}, hideOverlay:async()=>{}, startSession:async()=>({sessionId:'x',meetingId:null}), stopSession:async()=>{}, resizeOverlay:async()=>{}, openAppearance:async()=>{}, onOpenAppearance:()=>()=>{}
});`
const settle = async (w) => { await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r=>setTimeout(r,400)) }
app.whenReady().then(async () => {
  await mkdir(out,{recursive:true})
  const p = resolve(out,'fixture-target-language.cjs'); await writeFile(p, preload)
  const w = new BrowserWindow({ width:1120, height:820, show:false, webPreferences:{preload:p,contextIsolation:true,sandbox:true} })
  await w.loadFile(resolve('out/renderer/index.html'))
  await settle(w)
  await w.webContents.executeJavaScript(`(()=>{const s=document.querySelector('select[aria-label="目标语言"]');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await settle(w)
  await writeFile(resolve(out,'qa-target-language.png'), (await w.webContents.capturePage()).toPNG())
  await w.webContents.executeJavaScript(`[...document.querySelectorAll('.navigation-item')].find(b=>b.textContent.includes('翻译')).click()`)
  await settle(w)
  await writeFile(resolve(out,'qa-translation-m2m100.png'), (await w.webContents.capturePage()).toPNG())
  await w.webContents.executeJavaScript(`[...document.querySelectorAll('.navigation-item')].find(b=>b.textContent.includes('模型与资源')).click()`)
  await settle(w)
  await writeFile(resolve(out,'qa-resources-four.png'), (await w.webContents.capturePage()).toPNG())
  w.close(); app.exit(0)
})
