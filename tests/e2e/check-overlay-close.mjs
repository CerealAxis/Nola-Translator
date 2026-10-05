// Exercise the real preload and main IPC with an engine fixture in a hidden Electron window.
import { app, BrowserWindow, ipcMain } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { DEFAULT_SETTINGS } from '../../src/shared/settings.ts'

app.disableHardwareAcceleration()
const pause = ms => new Promise(done => setTimeout(done, ms))
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await pause(50) }
  throw new Error('Timed out waiting for overlay close')
}

app.whenReady().then(async () => {
  const output = resolve('artifacts/overlay-close')
  await mkdir(output, {recursive:true})
  await build({entryPoints:['src/main/ipc.ts'],bundle:true,platform:'node',format:'esm',
    external:['electron'],outfile:resolve(output,'ipc.mjs')})
  const { registerEngineIpc } = await import(pathToFileURL(resolve(output,'ipc.mjs')).href)
  const engine = Object.assign(new EventEmitter(), {
    currentState:'ready', stops:0, shutdowns:0, mode:'normal',
    start:async () => {engine.currentState='ready'},
    stop:async () => {engine.shutdowns++;engine.currentState='stopped'},
    request:async (command) => {
      if(command.type==='listDevices') return {devices:[]}
      if(command.type==='listResources') return {storagePath:'',resources:[]}
      if(command.type==='startSession') {
        const event={protocolVersion:1,type:'sessionStarted',requestId:command.requestId,sessionId:'close-test'}
        engine.emit('event',event);return event
      }
      if(command.type==='stopSession') {
        engine.stops++
        await pause(150)
        if(engine.mode==='failed-stop') throw new Error('Fixture teardown failure')
        const event={protocolVersion:1,type:'sessionStopped',requestId:command.requestId,sessionId:command.sessionId}
        engine.emit('event',event);return event
      }
      throw new Error('Unexpected command '+command.type)
    },
  })
  const win = new BrowserWindow({width:900,height:230,show:false,frame:false,transparent:true,
    webPreferences:{preload:resolve('out/preload/index.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}})
  let hides=0
  const hide=win.hide.bind(win)
  win.hide=() => {hides++;hide()}
  const dispose=registerEngineIpc(engine,()=>win)
  ipcMain.handle('app:get-settings',()=>DEFAULT_SETTINGS)
  ipcMain.handle('storage:get',()=>({activePath:'',configuredPath:'',restartRequired:false}))
  ipcMain.handle('meeting:list',()=>[])
  ipcMain.handle('translation:has-credential',()=>false)
  const evaluate=code=>win.webContents.executeJavaScript(code)
  const start=()=>evaluate(`window.nolaTranslator.startSession({audioSource:{kind:'defaultOutput'},recognitionModelId:'qwen3-asr-0.6b-hf',recognitionMode:'realtime',sourceLanguage:'auto',targetLanguages:[]})`)
  async function close() {
    const previous=hides
    await evaluate(`document.querySelector('.nola-caption-actions button:last-child').click()`)
    await until(()=>evaluate(`Boolean(document.querySelector('.nola-confirm-layer'))`))
    const point=await evaluate(`(() => {
      const card=document.querySelector('.nola-caption-card');
      const layer=document.querySelector('.nola-confirm-layer');
      const button=[...layer.querySelectorAll('button')].find(b=>b.textContent==='关闭并停止');
      const rect=button.getBoundingClientRect();const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      return {x:Math.round(x),y:Math.round(y),cardRegion:getComputedStyle(card).getPropertyValue('app-region'),
        buttonRegion:getComputedStyle(button).getPropertyValue('app-region'),hit:document.elementFromPoint(x,y)===button};
    })()`)
    assert.equal(point.cardRegion,'no-drag')
    assert.equal(point.buttonRegion,'no-drag')
    assert.equal(point.hit,true)
    for(const type of ['mouseDown','mouseUp']) win.webContents.sendInputEvent({type,x:point.x,y:point.y,button:'left',clickCount:1})
    await until(()=>hides>previous)
    await until(()=>evaluate(`!document.querySelector('.nola-confirm-layer')`))
  }
  await win.loadFile(resolve('out/renderer/index.html'),{query:{overlay:'1'}})
  await until(()=>evaluate(`Boolean(document.querySelector('.nola-caption-actions'))`))
  await close() // Idle first: no session is running, so the engine is never asked to stop.
  assert.equal(engine.stops,0)
  await start()
  await close()
  assert.equal(engine.stops,1)
  await start()
  engine.mode='failed-stop'
  await close()
  assert.equal(engine.stops,2)
  assert.equal(engine.shutdowns,1)
  engine.currentState='ready'
  await start()
  engine.currentState='failed'
  await close()
  assert.equal(engine.stops,2)
  assert.equal(engine.shutdowns,2)
  const results={idle:true,running:true,failedStop:true,deadEngine:true,stops:engine.stops,shutdowns:engine.shutdowns}
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2))
  console.log(JSON.stringify(results))
  dispose();win.destroy();app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
