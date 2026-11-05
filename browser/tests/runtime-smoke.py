"""Exercise the packaged content runtime against deterministic browser and native fixtures."""
import argparse
import base64
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from capture_audit import OffscreenAudit, instrument_copy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / 'artifacts' / 'browser-runtime' / ('edge' if Path(args.executable).name.lower() == 'msedge.exe' else 'chrome')
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='nola-runtime-') as directory:
        extension = Path(directory) / 'extension'
        shutil.copytree(root / 'browser/extension/dist', extension)
        path = extension / 'manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
        identity = digest.translate(str.maketrans('0123456789abcdef', 'abcdefghijklmnop'))
        manifest['host_permissions'].extend(['https://nola.test/*', 'http://nola-http.test/*', 'https://edge.microsoft.com/*'])
        for script in manifest['content_scripts']:
            script['matches'].extend(['https://nola.test/*','http://nola-http.test/*'])
        path.write_text(json.dumps(manifest), encoding='utf-8')
        instrument_copy(extension)
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(str(Path(directory) / 'profile'), executable_path=args.executable,
                headless=True, ignore_default_args=['--disable-extensions','--mute-audio'], args=['--enable-unsafe-extension-debugging'])
            try:
                session = context.browser.new_browser_cdp_session()
                session.send('Extensions.loadUnpacked', {'path': str(extension)}); session.detach()
                context.set_default_timeout(20000)
                print('Browser launched; waiting for extension worker', flush=True)
                worker_url=f'chrome-extension://{identity}/background.js'
                worker = next((candidate for candidate in context.service_workers if candidate.url == worker_url), None) or context.wait_for_event('serviceworker',predicate=lambda candidate: candidate.url == worker_url)
                assert worker.evaluate('chrome.runtime.id') == identity
                print('Extension worker ready', flush=True)
                worker.evaluate("""() => {
                  self.pcmChunks=0; self.pcmPeak=0; self.pcmFrames=[]; self.streamId='';
                  self.nativeRequests=[]; chrome.runtime.connectNative = () => {
                    const listeners=[];
                    return {onMessage:{addListener:f=>listeners.push(f)},onDisconnect:{addListener:()=>{}},disconnect:()=>{},postMessage:r=>{ self.nativeRequests.push(r);
                      const value=r.type==='hello'?{protocolVersion:3,extensionVersion:chrome.runtime.getManifest().version,extensionCompatible:true,textTranslation:true,realtimeTranslation:true,uiLanguage:'en',sourceLanguage:'en',targetLanguage:'zh',devices:[],browserAudio:true,captionServiceActive:true,config:{audioSource:'tab',sourceLanguage:'en',targetLanguage:'zh',appearance:{showSource:true,showTranslation:true}}}:r.type==='translate'?{text:'Translated '+r.text}:{};
                      if(r.type==='streamStart')self.streamId=r.id;
                      if(r.type==='streamAudio'){
                        self.pcmChunks++;
                        const bytes=Uint8Array.from(atob(r.pcmBase64),c=>c.charCodeAt(0));
                        let peak=0;for(const sample of new Int16Array(bytes.buffer))peak=Math.max(peak,Math.abs(sample));self.pcmPeak=Math.max(self.pcmPeak,peak);let energy=0;for(const sample of new Int16Array(bytes.buffer))energy+=sample*sample;if(self.pcmFrames.length<300)self.pcmFrames.push({peak,rms:Math.sqrt(energy/(bytes.byteLength/2)),samples:bytes.byteLength/2});
                        if(self.pcmChunks===2)setTimeout(()=>listeners.forEach(f=>f({type:'capabilityEvent',id:self.streamId,event:{type:'asr',data:{type:'conversation.item.input_audio_transcription.completed',item_id:'fixture',transcript:'Audio reaches speech runtime',audio_start_ms:0,audio_end_ms:30000}}})),0);
                      }
                      setTimeout(()=>listeners.forEach(f=>f({type:'result',id:r.id,value})),0);
                    }};
                  };
                  return chrome.storage.local.set({uiLanguage:'en',pageLanguage:'zh',pageScope:'main',pageDisplay:'bilingual',autoSites:['https://nola.test'],inputTranslation:true});
                }""")
                assert worker.evaluate("chrome.storage.local.get(['autoSites','pageLanguage'])") == {'autoSites':['https://nola.test'],'pageLanguage':'zh'}
                page = context.new_page()
                errors=[]
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://nola.test/**', lambda route: route.fulfill(content_type='text/html', body="""<!doctype html><html lang="en"><head><title>Runtime fixture</title></head><body><main><p id="source">A paragraph for translation.</p><p id="selection">Selected words for translation.</p><textarea id="input">Editable source text.</textarea><video style="width:640px;height:360px" controls></video></main><script>const track=document.querySelector('video').addTextTrack('subtitles','Fixture English','en');track.addCue(new VTTCue(0,5,'First subtitle.'));track.addCue(new VTTCue(5,10,'Second subtitle.'));</script></body></html>"""))
                print('Opening runtime fixture', flush=True)
                page.goto('https://nola.test/runtime')
                try:
                    page.locator('#source [data-nola-translation]').wait_for()
                except Exception:
                    print('RUNTIME ERROR', errors, page.locator('html').get_attribute('data-nola-installed'), page.locator('[data-nola-extension]').count(), page.locator('body').inner_text(), worker.evaluate('self.nativeRequests'),worker.evaluate("chrome.storage.local.get(['autoSites','pageProvider','pageLanguage','pipeline'])"), flush=True)
                    raise
                assert page.locator('#source').inner_text().startswith('A paragraph for translation.')
                page.evaluate("""() => { const range=document.createRange();range.selectNodeContents(document.querySelector('#selection').firstChild);window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.querySelector('#selection').dispatchEvent(new PointerEvent('pointerup',{bubbles:true})); }""")
                actions=page.locator('[data-nola-extension="text-actions"]')
                actions.get_by_role('button',name='Translate selection',exact=True).click()
                try:
                    actions.get_by_text('Translated Selected words for translation.',exact=True).wait_for()
                except Exception:
                    print('SELECTION ERROR', actions.inner_text(), worker.evaluate('self.nativeRequests.slice(-10)'), flush=True)
                    raise
                actions.get_by_role('button',name='Close',exact=True).click()
                page.locator('#input').focus();page.keyboard.press('Alt+Enter')
                actions.get_by_role('button',name='Translate input',exact=True).click()
                page.wait_for_function("document.querySelector('#input').value.startsWith('Translated ')")
                actions.get_by_role('button',name='Restore input',exact=True).click()
                assert page.locator('#input').input_value()=='Editable source text.'
                actions.get_by_role('button',name='Close',exact=True).click()
                page.locator('[data-nola-extension="trigger"]').get_by_role('button').click()
                panel=page.locator('[data-nola-extension="panel"]')
                panel.get_by_role('button',name='Translate existing subtitles',exact=True).click()
                panel.get_by_role('button',name='Transcript',exact=True).click()
                panel.get_by_role('button',name='0:00 First subtitle.').wait_for()
                with page.expect_download() as downloading:
                    panel.get_by_role('button',name='Original subtitles · SRT',exact=True).click()
                download=downloading.value
                assert 'First subtitle.' in Path(download.path()).read_text(encoding='utf-8')
                panel.get_by_role('button',name='0:05 Second subtitle.').click()
                assert page.locator('video').evaluate('(video)=>video.currentTime')==5
                (root / 'artifacts').mkdir(exist_ok=True)
                page.screenshot(path=str(output / 'text-and-subtitles.png'), full_page=True)
                assert not errors, errors
                print('Text and subtitle runtime checks passed; testing audio pipeline', flush=True)
                worker.evaluate("""() => chrome.storage.local.set({pipeline:'cascade',asrProvider:'desktop',subtitleProvider:'microsoft-translate',autoSites:[]})""")
                tone=(root / 'browser/extension/fixtures/player.html').read_text(encoding='utf-8')
                page.route('https://nola.test/audio', lambda route: route.fulfill(content_type='text/html',body=tone))
                print('Opening tone fixture',flush=True)
                page.goto('https://nola.test/audio')
                print('Playing tone',flush=True)
                page.locator('#tone').click()
                page.wait_for_function("document.querySelector('video').readyState>=2")
                print('Tone video ready',flush=True)
                page.locator('[data-nola-extension="trigger"]').get_by_role('button').click()
                panel=page.locator('[data-nola-extension="panel"]')
                toolbar=context.browser.new_browser_cdp_session()
                targets=toolbar.send('Target.getTargets', {'filter':[{'type':'tab','exclude':False}]})['targetInfos']
                target=next(item for item in targets if item.get('url')=='https://nola.test/audio')
                toolbar.send('Extensions.triggerAction', {'id':identity,'targetId':target['targetId']}); toolbar.detach()
                for popup in context.pages:
                    if popup.url.startswith(f'chrome-extension://{identity}/'): popup.close()
                page.bring_to_front()
                capture_audit=OffscreenAudit(context,page,identity)
                print('Starting realtime with genuine toolbar activeTab grant',flush=True)
                panel.get_by_role('button',name='Start live translation',exact=True).click()
                try:
                    page.locator('[data-nola-extension="overlay"]').get_by_text('Audio reaches speech runtime',exact=True).wait_for(timeout=30000)
                except Exception:
                    print('AUDIO ERROR',panel.evaluate("(host)=>host.shadowRoot.querySelector('section')?.innerText"),worker.evaluate('({chunks:self.pcmChunks,peak:self.pcmPeak,frames:self.pcmFrames,requests:self.nativeRequests.slice(-8).map(({type,id})=>({type,id}))})'),flush=True)
                    raise
                page.locator('[data-nola-extension="overlay"] .nola-caption-line').filter(has_text=re.compile('[\u4e00-\u9fff]')).wait_for(timeout=20000)
                page.wait_for_function('true')
                for attempt in range(30):
                    if worker.evaluate('self.pcmFrames.length')>=30: break
                    page.wait_for_timeout(1000)
                pcm=worker.evaluate('({chunks:self.pcmChunks,peak:self.pcmPeak,frames:self.pcmFrames})')
                (output / 'pcm.json').write_text(json.dumps(pcm),encoding='utf-8')
                assert len(pcm['frames'])>=2, pcm
                page.screenshot(path=str(output / 'audio-captions.png'),full_page=True)
                pcm=worker.evaluate('({chunks:self.pcmChunks,peak:self.pcmPeak,frames:self.pcmFrames})')
                (output / 'pcm.json').write_text(json.dumps(pcm),encoding='utf-8')
                assert worker.evaluate('self.pcmPeak')>100
                assert worker.evaluate('self.pcmChunks')>=2
                before_pause=capture_audit.read()
                page.evaluate("document.querySelectorAll('video').forEach(video=>video.pause())")
                page.wait_for_timeout(1500)
                audit=capture_audit.read()
                audit['pauseIndex']=len(before_pause['frames'])
                (output / 'capture-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
                assert len(pcm['frames'])>=30, pcm
                assert max(frame['peak'] for frame in pcm['frames'])<=6000, pcm
                paused=audit['frames'][audit['pauseIndex']:]
                assert paused and max(frame['rms'] for frame in paused[-5:])<0.0001, audit
                capture_audit.close()
                panel.get_by_role('button',name='End',exact=True).click()
                print('Real PCM capture through speech-client and native streaming passed',flush=True)
                worker.evaluate("""() => chrome.storage.local.set({autoSites:['https://nola.test']})""")
                print('Native fixture runtime checks passed; testing Microsoft without a native host', flush=True)
                worker.evaluate("""() => {
                  self.pcmChunks=0; self.pcmPeak=0; self.pcmFrames=[]; self.streamId='';
                  self.nativeRequests=[]; chrome.runtime.connectNative = () => { throw new Error('Native host deliberately unavailable'); };
                  return chrome.storage.local.set({pageProvider:'microsoft-translate',selectionProvider:'microsoft-translate',inputProvider:'microsoft-translate',translateTitle:false});
                }""")
                page.route('https://nola.test/free', lambda route: route.fulfill(content_type='text/html', body='<html lang="en"><body><main><p id="free">Hello</p></main></body></html>'))
                page.goto('https://nola.test/free')
                annotation=page.locator('#free [data-nola-translation]')
                annotation.wait_for(timeout=45000)
                assert any(word in annotation.inner_text() for word in ['你好','您好']), annotation.inner_text()
                assert page.locator('#free').inner_text().startswith('Hello')
                print('Microsoft real endpoint runtime check passed: '+annotation.inner_text(), flush=True)
                worker.evaluate("""() => chrome.storage.local.set({autoSites:['http://nola-http.test'],shortcutPage:'Alt+Y'})""")
                page.route('http://nola-http.test/free', lambda route: route.fulfill(content_type='text/html', body='<html lang="en"><body><main><p id="http">Hello</p></main></body></html>'))
                page.goto('http://nola-http.test/free')
                http_annotation=page.locator('#http [data-nola-translation]')
                try:
                    http_annotation.wait_for(timeout=45000)
                except Exception:
                    print('HTTP ERROR',page.url,page.locator('html').get_attribute('data-nola-installed'),page.locator('[data-nola-extension]').count(),page.locator('body').inner_text(),worker.evaluate("chrome.storage.local.get(['autoSites','pageProvider','pageLanguage'])"),flush=True)
                    raise
                assert any(word in http_annotation.inner_text() for word in ['\u4f60\u597d','\u60a8\u597d'])
                page.keyboard.press('Alt+Y');http_annotation.wait_for(state='detached')
                page.keyboard.press('Alt+Y');http_annotation.wait_for()
                print('HTTP real translation and customized shortcut restore/restart passed',flush=True)
                result={'extension':identity,'pcm':pcm,'checks':['page bilingual','selection translation','editable translation and restore','native subtitle transcript seek and SRT','real PCM capture through speech-client native streaming','real Microsoft without native host','HTTP translation and customized shortcut'],'pageErrors':errors}
                (output / 'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                print(json.dumps(result))
            finally:
                context.close()


if __name__ == '__main__':
    main()
