"""Verify translation-cache persistence across real browser/background restarts."""
import argparse
import base64
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from developer_mode import enable_developer_mode

RPC = """request => new Promise((resolve,reject)=>{
  const port=chrome.runtime.connect({name:'nola-provider'}),id=crypto.randomUUID();let done=false;
  const timer=setTimeout(()=>{done=true;port.disconnect();reject(new Error('RPC timeout'))},30000);
  port.onMessage.addListener(message=>{if(message?.id!==id)return;done=true;clearTimeout(timer);port.disconnect();if(message.error)reject(new Error(message.error));else resolve(message.result)});
  port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;if(!done){clearTimeout(timer);reject(new Error('RPC disconnected'))}});
  port.postMessage({...request,id});
})"""
READ = """() => new Promise((resolve,reject)=>{
  const open=indexedDB.open('nola-extension-providers',1);
  open.onerror=()=>reject(open.error);open.onsuccess=()=>{
    const db=open.result,request=db.transaction('settings').objectStore('settings').getAll(IDBKeyRange.bound('translation-cache-v1:','translation-cache-v1:\uffff'));
    request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>{db.close();reject(request.error)};
  };
})"""


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--executable',required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parents[2];name='edge' if Path(args.executable).name.lower()=='msedge.exe' else 'chrome'
    output=root/'artifacts'/'browser-cache'/name;output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='nola-cache-') as directory:
        extension=Path(directory)/'extension';shutil.copytree(root/'browser/extension/dist',extension)
        manifest_path=extension/'manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        digest=hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32];identity=digest.translate(str.maketrans('0123456789abcdef','abcdefghijklmnop'))
        manifest['host_permissions'].append('https://edge.microsoft.com/*');manifest_path.write_text(json.dumps(manifest),encoding='utf-8')
        translation={'type':'translate','providerId':'microsoft-translate','text':'Hello cache','sourceLanguage':'en','targetLanguage':'zh','purpose':'web'}
        cycles=[]
        with sync_playwright() as playwright:
            for cycle in range(2):
                context=playwright.chromium.launch_persistent_context(str(Path(directory)/'profile'),executable_path=args.executable,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
                try:
                    enable_developer_mode(context) if name == 'chrome' else None
                    browser=context.browser.new_browser_cdp_session();browser.send('Extensions.loadUnpacked',{'path':str(extension)});browser.detach()
                    url=f'chrome-extension://{identity}/background.js'
                    worker=next((item for item in context.service_workers if item.url==url),None) or context.wait_for_event('serviceworker',predicate=lambda item:item.url==url)
                    assert worker.evaluate('chrome.runtime.id')==identity
                    worker.evaluate("""()=>{self.cacheNetworkCalls=0;const fetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(...args)=>{if(String(args[0]).startsWith('https://edge.microsoft.com/translate/'))self.cacheNetworkCalls++;return fetch(...args)}}""")
                    page=context.new_page();page.goto(f'chrome-extension://{identity}/options.html#apiProviders')
                    if cycle==0:page.evaluate(RPC,{'type':'clearCache'})
                    result=page.evaluate(RPC,translation)
                    rows=worker.evaluate(READ)
                    assert len(rows)==1,rows
                    assert len(rows[0]['key'])==64 and set(rows[0])=={'key','text','createdAt'},rows
                    calls=worker.evaluate('self.cacheNetworkCalls')
                    assert calls==(1 if cycle==0 else 0),calls
                    if cycle==1:
                        page.evaluate(RPC,{'type':'clearCache'});assert worker.evaluate(READ)==[]
                        assert page.evaluate(RPC,translation)==result
                        assert worker.evaluate('self.cacheNetworkCalls')==1
                        page.evaluate(RPC,{'type':'clearCache'});assert worker.evaluate(READ)==[]
                    cycles.append({'cycle':cycle,'initialNetworkRequests':calls,'text':result['text'],'clearVerified':cycle==1})
                    print(json.dumps(cycles[-1]),flush=True)
                finally:context.close()
        result={'extension':identity,'version':manifest['version'],'cycles':cycles}
        (output/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)


if __name__=='__main__':main()
