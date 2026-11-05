"""Control for browser-policy effects on CDP-loaded development-extension reloads."""
import argparse
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from developer_mode import enable_developer_mode

STATE = """()=>{const roots=[document],items=[];for(let i=0;i<roots.length;i++)for(const element of roots[i].querySelectorAll('*')){if(element.shadowRoot)roots.push(element.shadowRoot);if(element.localName==='extensions-item')items.push({id:element.id,name:element.data?.name,state:element.data?.state,disableReasons:element.data?.disableReasons,runtimeErrors:element.data?.runtimeErrors,manifestErrors:element.data?.manifestErrors})}return items}"""

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--executable',required=True);parser.add_argument('--developer-mode',action='store_true');args=parser.parse_args()
    root=Path(__file__).resolve().parents[2];output=root/'artifacts'/'browser-startup'/'reload-control';output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='nola-reload-control-') as directory:
        extension=Path(directory)/'extension';extension.mkdir()
        (extension/'manifest.json').write_text(json.dumps({'manifest_version':3,'name':'MV3 reload control','version':'1.0.0','background':{'service_worker':'background.js'}}))
        (extension/'background.js').write_text('self.controlReady=true;')
        (extension/'options.html').write_text('<!doctype html><title>Control</title><p>MV3 reload control</p>')
        with sync_playwright() as playwright:
            context=playwright.chromium.launch_persistent_context(str(Path(directory)/'profile'),executable_path=args.executable,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'])
            try:
                if args.developer_mode:enable_developer_mode(context)
                browser=context.browser.new_browser_cdp_session();identity=browser.send('Extensions.loadUnpacked',{'path':str(extension)})['id']
                url=f'chrome-extension://{identity}/background.js'
                worker=next((w for w in context.service_workers if w.url==url),None) or context.wait_for_event('serviceworker',predicate=lambda w:w.url==url)
                initial=context.new_page();initial.goto(f'chrome-extension://{identity}/options.html')
                assert initial.locator('p').inner_text()=='MV3 reload control'
                try:worker.evaluate('chrome.runtime.reload()')
                except Exception:pass
                browser.send('Extensions.loadUnpacked',{'path':str(extension)})
                page=context.new_page();failure=None
                try:page.goto(f'chrome-extension://{identity}/options.html')
                except Exception as error:failure=str(error)
                manager=context.new_page();manager.goto('chrome://extensions');manager.wait_for_timeout(500)
                result={'developerMode':args.developer_mode,'extension':identity,'reloadFailure':failure,'manager':manager.evaluate(STATE)}
                (output/('developer-mode.json' if args.developer_mode else 'result.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
                print(json.dumps(result),flush=True)
            finally:context.close()

if __name__=='__main__':main()
