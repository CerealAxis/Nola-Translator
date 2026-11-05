const { firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { debuggerClient } = require('./firefox-smoke.cjs')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), net = require('node:net')
async function main() {
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/browser-firefox')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-bili-capture-probe-'))
  const extension = path.join(directory, 'extension'); await fs.cp(path.join(root, 'browser/extension/dist-firefox'), extension, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'))
  manifest.host_permissions.push('https://edge.microsoft.com/*')
  manifest.background.scripts.unshift('fixture-native.js')
  for (const script of manifest.content_scripts) if (script.world !== 'MAIN') script.js.unshift('fixture-capture.js')
  await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest))
  await fs.writeFile(path.join(extension, 'probe.html'), '<!doctype html><html><body>Read-only extension probe<script src="probe-control.js"></script></body></html>')
  await fs.writeFile(path.join(extension, 'probe-control.js'), 'window.probeReady = true;')
  await fs.writeFile(path.join(extension, 'fixture-native.js'), `
    const stats = { totalChunks: 0, maxPeak: 0, nonzeroChunks: 0, aboveThreshold: 0, transcripts: 0, threshold: 300, debug: [] };
    browser.storage.local.set({ uiLanguage:'en', sourceLanguage:'en', pageProvider:'microsoft-translate', subtitleProvider:'microsoft-translate', pipeline:'cascade', videoLanguage:'zh', floatingButton:false });
    browser.runtime.onMessage.addListener((message,sender,reply) => { if(message.type==='fixtureCollect'){ browser.tabs.sendMessage(sender.tab.id,{type:'pageStatus'}).then(status=>reply({stats,status}),error=>reply({stats,statusError:error.message})); return true } if(message.type==='fixtureBackgroundProbe'){ reply(stats); return true } if(message.type==='fixtureThreshold'){ stats.threshold=message.value; reply({ok:true}); return true } });
    browser.runtime.connectNative = () => { const listeners=[];let streamId='',closed=false;
      const emit = value => setTimeout(()=>{ if(!closed) listeners.forEach(listener=>listener(value)) },0);
      return {onMessage:{addListener:f=>listeners.push(f)},onDisconnect:{addListener:()=>{}},disconnect:()=>{closed=true},postMessage:request=>{
        if(request.type==='debug'){stats.debug.push({event:request.event,data:request.data});if(stats.debug.length>100)stats.debug.shift()}
        if(request.type==='streamStart')streamId=request.id;
        if(request.type==='streamAudio'){const samples=new Int16Array(Uint8Array.from(atob(request.pcmBase64),c=>c.charCodeAt(0)).buffer);let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));stats.totalChunks++;stats.maxPeak=Math.max(stats.maxPeak,peak);if(peak>0)stats.nonzeroChunks++;if(peak>stats.threshold){stats.aboveThreshold++;if(stats.aboveThreshold%10===0){stats.transcripts++;emit({type:'capabilityEvent',id:streamId,event:{type:'asr',data:{type:'transcript',item_id:'probe-'+stats.transcripts,text:'Captured actual audio.',final:true}}})}}}
        emit({type:'result',id:request.id,value:{}})
      }};
    };

  `)
  await fs.writeFile(path.join(extension, 'fixture-capture.js'), `
    document.documentElement.dataset.nolaProbeUrl = browser.runtime.getURL('probe.html');
    const probes=[];
    const snapshot=()=>probes.map(p=>({src:p.video.currentSrc,time:p.video.currentTime,paused:p.video.paused,muted:p.video.muted,volume:p.video.volume,hasAudio:p.video.mozHasAudio,readyState:p.video.readyState,tracks:p.stream.getTracks().map(t=>({kind:t.kind,readyState:t.readyState,muted:t.muted,enabled:t.enabled,settings:t.getSettings()})),events:p.events}));
    document.addEventListener('nola:fixture-probe',async()=>{ let value;try{value={...(await browser.runtime.sendMessage({type:'fixtureCollect'})),captures:snapshot()}}catch(error){value={probeError:error.message}}document.documentElement.dataset.nolaProbeResult=JSON.stringify(value);document.dispatchEvent(new Event('nola:fixture-result')) });
    for(const name of ['captureStream','mozCaptureStream']){ const original=HTMLMediaElement.prototype[name];if(typeof original!=='function')continue;HTMLMediaElement.prototype[name]=function(...args){const stream=original.apply(this,args);const events=[];stream.addEventListener('addtrack',e=>events.push({type:'add',kind:e.track.kind}));stream.addEventListener('removetrack',e=>events.push({type:'remove',kind:e.track.kind}));probes.push({video:this,stream,events});return stream} }
    browser.runtime.onMessage.addListener((message,sender,reply)=>{ if(message.type!=='fixtureCaptureProbe')return;reply(probes.map(p=>({src:p.video.currentSrc,time:p.video.currentTime,paused:p.video.paused,muted:p.video.muted,volume:p.video.volume,hasAudio:p.video.mozHasAudio,readyState:p.video.readyState,tracks:p.stream.getTracks().map(t=>({kind:t.kind,readyState:t.readyState,muted:t.muted,enabled:t.enabled,settings:t.getSettings()})),events:p.events})));return true });
  `)
  const port = await new Promise(resolve => { const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value))}) })
  const uuid='52b244a1-81d6-47ac-83b9-50af36180f0b'
  const context=await firefox.launchPersistentContext(path.join(directory,'profile'),{executablePath:process.env.FIREFOX_EXECUTABLE,headless:true,viewport:{width:1280,height:900},args:['-start-debugger-server',String(port)],firefoxUserPrefs:{'extensions.webextensions.uuids':JSON.stringify({[manifest.browser_specific_settings.gecko.id]:uuid}),'devtools.chrome.enabled':true,'devtools.debugger.remote-enabled':true,'devtools.debugger.prompt-connection':false,'xpinstall.signatures.required':false,'media.autoplay.default':0}})
  let remote;const result={kind:'Real Bilibili playback/capture; simulated native ASR; no real model accuracy claim',responses:[],errors:[],samples:[]}
  try {
    result.stage='debugger-handshake';console.log('Firefox debugger port',port);remote=await debuggerClient(port);const actors=await remote.request({to:'root',type:'getRoot'});console.log('Firefox debugger ready');await remote.request({to:actors.addonsActor,type:'installTemporaryAddon',addonPath:extension});console.log('Bili probe addon installed')
    const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));page.on('response',response=>{if(response.status()>=400||/playurl/.test(response.url()))result.responses.push({url:response.url().split('?')[0],status:response.status()})})
    result.stage='navigate-site';const response=await page.goto('https://www.bilibili.com/video/BV16vKb6YEqt/',{waitUntil:'domcontentloaded',timeout:45000});result.documentStatus=response.status()
    result.stage='wait-video';await page.locator('video').first().waitFor({state:'attached',timeout:45000})
    const snapshot=async phase=>{
      const media=await page.locator('video').first().evaluate(video=>({time:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,muted:video.muted,volume:video.volume,hasAudio:video.mozHasAudio,readyState:video.readyState,networkState:video.networkState,src:video.currentSrc,error:video.error?.message}))
      const probe=await page.evaluate(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture DOM probe timed out')),5000);document.addEventListener('nola:fixture-result',()=>{clearTimeout(timer);resolve(JSON.parse(document.documentElement.dataset.nolaProbeResult))},{once:true});document.dispatchEvent(new Event('nola:fixture-probe'))}))
      const {status,captures,stats,...probeExtras}=probe
      const sample={phase,media,status,captures,stats,...probeExtras};result.samples.push(sample);console.log(JSON.stringify(sample))
    }
    result.stage='before-play';await snapshot('loaded-before-play')
    result.stage='play-volume-0.05';await page.locator('video').first().evaluate(video=>{video.volume=0.05;return video.play()})
    await page.locator('[data-nola-extension="trigger"]').getByRole('button').click()
    const panel=page.locator('[data-nola-extension="panel"]')
    result.stage='start-plugin';await panel.getByRole('button',{name:'Start live translation',exact:true}).click()
    await page.waitForTimeout(12000);await snapshot('original-smoke-volume-0.05')
    await page.screenshot({path:path.join(output,'bilibili-capture-probe.png')})
    if(!await page.locator('[data-nola-extension="overlay"]').getByText('Captured actual audio.',{exact:true}).isVisible()) {
      await page.locator('video').first().evaluate(video=>{video.muted=false;video.volume=1;return video.play()})
      await page.waitForTimeout(12000);await snapshot('explicit-unmute-volume-1')
    }
    await page.screenshot({path:path.join(output,'bilibili-capture-final.png')})
    if(await panel.getByRole('button',{name:'End',exact:true}).isVisible())await panel.getByRole('button',{name:'End',exact:true}).click()
  } catch(error) {result.probeError=error.message;console.error(error)} finally {await fs.writeFile(path.join(output,'bilibili-capture-probe.json'),JSON.stringify(result,null,2));remote?.close();await context.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
