"""Collect actual extension startup/reload failures; never replace the native host or runtime APIs."""
import argparse
import base64
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from developer_mode import enable_developer_mode


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--executable',required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    name='edge' if Path(args.executable).name.lower()=='msedge.exe' else 'chrome'
    output=root / 'artifacts' / 'browser-startup' / name;output.mkdir(parents=True,exist_ok=True)
    events=[]
    with tempfile.TemporaryDirectory(prefix='nola-startup-') as directory:
        extension=Path(directory)/'extension';shutil.copytree(root/'browser/extension/dist',extension)
        path=extension/'manifest.json';manifest=json.loads(path.read_text(encoding='utf-8'))
        digest=hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
        identity=digest.translate(str.maketrans('0123456789abcdef','abcdefghijklmnop'))
        assert manifest['host_permissions']==['http://*/*','https://*/*'], manifest['host_permissions']
        assert all(script['matches']==manifest['host_permissions'] for script in manifest['content_scripts'])
        with sync_playwright() as playwright:
            context=playwright.chromium.launch_persistent_context(str(Path(directory)/'profile'),executable_path=args.executable,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
            context.set_default_timeout(15000)
            enable_developer_mode(context) if name == 'chrome' else None
            browser=context.browser.new_browser_cdp_session()
            sessions=[]
            def received(event):
                message=json.loads(event['message'])
                if message.get('method') in ['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded']:
                    events.append({'context':'worker',**message})
            browser.on('Target.receivedMessageFromTarget',received)
            def observe_worker(worker):
                assert worker.evaluate('chrome.runtime.id')==identity
                targets=browser.send('Target.getTargets',{'filter':[{'exclude':False}]})['targetInfos']
                target=next(item for item in targets if item.get('url')==worker.url)
                session=browser.send('Target.attachToTarget',{'targetId':target['targetId'],'flatten':False})['sessionId'];sessions.append(session)
                for index,method in enumerate(['Runtime.enable','Log.enable']):
                    browser.send('Target.sendMessageToTarget',{'sessionId':session,'message':json.dumps({'id':index+1,'method':method})})
            def observe_page(page,label):
                page.on('pageerror',lambda error:events.append({'context':label,'kind':'pageerror','message':str(error)}))
                page.on('console',lambda message:events.append({'context':label,'kind':'console','type':message.type,'message':message.text,'location':message.location}))
                session=context.new_cdp_session(page)
                session.on('Runtime.exceptionThrown',lambda event:events.append({'context':label,'kind':'exception',**event}))
                session.send('Runtime.enable')
            try:
                events.append({'kind':'load-unpacked','result':browser.send('Extensions.loadUnpacked',{'path':str(extension)})})
                url=f'chrome-extension://{identity}/background.js'
                worker=next((w for w in context.service_workers if w.url==url),None) or context.wait_for_event('serviceworker',predicate=lambda w:w.url==url)
                observe_worker(worker)
                page=context.new_page();observe_page(page,'content')
                page.route('https://nola-startup.test/**',lambda route:route.fulfill(content_type='text/html',body='<html lang="en"><body><main><p>Startup fixture with no translation or audio requests.</p><textarea id="draft">Original draft</textarea></main></body></html>'))
                page.goto('https://nola-startup.test/start');page.locator('[data-nola-extension="floating"]').wait_for()
                popup=context.new_page();observe_page(popup,'popup');popup.goto(f'chrome-extension://{identity}/popup.html')
                options=context.new_page();observe_page(options,'options');options.goto(f'chrome-extension://{identity}/options.html#apiProviders')
                page.wait_for_timeout(2000)
                events.append({'kind':'phase','phase':'initial-load-complete'})
                print('Actual startup and extension pages loaded',flush=True)
                page.locator('#draft').fill('Unsent user draft')
                worker.evaluate("async()=>{await Promise.all(['en','ja','ko','zh-CN','en'].map(uiLanguage=>chrome.storage.local.set({uiLanguage})));}")
                page.wait_for_timeout(1000)
                events.append({'kind':'phase','phase':'preference-change-burst-complete'})
                try:worker.evaluate('chrome.runtime.reload()')
                except Exception as error:events.append({'kind':'expected-reload-interruption','message':str(error)})
                page.bring_to_front();page.evaluate('window.dispatchEvent(new Event("scroll"))');page.wait_for_timeout(1000)
                events.append({'kind':'phase','phase':'old-content-after-extension-reload'})
                events.append({'kind':'load-unpacked','result':browser.send('Extensions.loadUnpacked',{'path':str(extension)})})
                options=context.new_page();observe_page(options,'options-wake-worker')
                try:options.goto(f'chrome-extension://{identity}/options.html#apiProviders')
                except Exception:
                    manager=context.new_page();manager.goto('chrome://extensions');manager.wait_for_timeout(500)
                    state=manager.evaluate("""()=>{const roots=[document],items=[];for(let i=0;i<roots.length;i++)for(const element of roots[i].querySelectorAll('*')){if(element.shadowRoot)roots.push(element.shadowRoot);if(element.localName==='extensions-item')items.push({id:element.id,name:element.data?.name,state:element.data?.state,disableReasons:element.data?.disableReasons,runtimeErrors:element.data?.runtimeErrors,manifestErrors:element.data?.manifestErrors})}return items}""")
                    events.append({'kind':'extension-manager-state','items':state});manager.screenshot(path=str(output/'reload-manager.png'));raise
                probe=options.evaluate("()=>chrome.runtime.sendMessage({type:'registerSites'})")
                events.append({'kind':'worker-wake-probe','result':probe})
                assert probe == {'ok': True}, probe
                reinjected=options.evaluate("""async()=>{const tab=(await chrome.tabs.query({})).find(tab=>tab.url==='https://nola-startup.test/start');const before=await chrome.tabs.sendMessage(tab.id,{type:'pageStatus'}).then(()=>true,()=>false);await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});const after=await chrome.tabs.sendMessage(tab.id,{type:'pageStatus'});return{before,after}}""")
                events.append({'kind':'content-reinjection','result':reinjected})
                assert page.locator('#draft').input_value()=='Unsent user draft'
                assert page.evaluate("performance.getEntriesByType('navigation')[0].type")=='navigate'
                assert page.locator('[data-nola-extension="floating"]').count()==1
                worker=next((w for w in context.service_workers if w.url==url),None) or context.wait_for_event('serviceworker',predicate=lambda w:w.url==url)
                observe_worker(worker)
                worker.evaluate("""()=>chrome.scripting.registerContentScripts([{id:'nola-main',matches:['https://nola-startup.test/*'],js:['capture-handle.js'],world:'MAIN',runAt:'document_start'},{id:'nola-content',matches:['https://nola-startup.test/*'],js:['content.js'],runAt:'document_idle'}])""")
                worker.evaluate("""()=>{self.registryAudit=[];for(const[area,name]of[['permissions','getAll'],['scripting','getRegisteredContentScripts'],['scripting','registerContentScripts'],['scripting','updateContentScripts'],['scripting','unregisterContentScripts']]){const original=chrome[area][name].bind(chrome[area]);chrome[area][name]=async(...args)=>{try{const result=await original(...args);self.registryAudit.push({name,ok:true});return result}catch(error){self.registryAudit.push({name,ok:false,error:String(error)});throw error}}}}""")
                probes=options.evaluate("()=>Promise.all(Array.from({length:4},()=>chrome.runtime.sendMessage({type:'registerSites'})))")
                audit=worker.evaluate('self.registryAudit')
                events.append({'kind':'registration-probes','results':probes,'audit':audit})
                assert all(result == {'ok': True} for result in probes), probes
                assert all(stage['ok'] for stage in audit), audit
                remaining=worker.evaluate('()=>chrome.scripting.getRegisteredContentScripts()')
                assert not any(script['id'] in ['nola-main','nola-content'] for script in remaining), remaining
                assert not any(stage['name'] in ['registerContentScripts','updateContentScripts'] for stage in audit), audit
                events.append({'kind':'legacy-registration-migration','remaining':remaining})
                page.locator('[data-nola-extension="floating"]').wait_for()
                options=context.new_page();observe_page(options,'options-after-reload');options.goto(f'chrome-extension://{identity}/options.html#apiProviders')
                popup=context.new_page();observe_page(popup,'popup-after-reload');popup.goto(f'chrome-extension://{identity}/popup.html')
                page.wait_for_timeout(2000)
                events.append({'kind':'phase','phase':'pages-reloaded-complete'})
                result={'extension':identity,'version':manifest['version'],'events':events}
                (output/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
                failures=[event for event in events if event.get('kind') in ['exception','pageerror'] or event.get('method')=='Runtime.exceptionThrown' or event.get('method')=='Log.entryAdded' and event.get('params',{}).get('entry',{}).get('level')=='error']
                print(json.dumps({'browser':name,'errors':failures,'events':len(events),'result':str(output/'result.json')}),flush=True)
                assert not failures, failures
            finally:
                (output/'events.json').write_text(json.dumps(events,indent=2),encoding='utf-8')
                context.close()


if __name__=='__main__':main()
