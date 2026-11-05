"""Exercise the actual MV3 bundle with a fixture site and a simulated native transport."""
import argparse
import base64
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable', required=True)
    parser.add_argument('--name', default='chromium')
    parser.add_argument('--cdp-load', action='store_true', help='Use Extensions.loadUnpacked for branded Chrome')
    parser.add_argument('--pipeline', action='store_true', help='Also exercise the legacy sharing fallback with real fixture PCM and simulated captions')
    parser.add_argument('--trigger-only', action='store_true', help='Check subtitle trigger appearance across languages and themes')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / 'artifacts' / 'browser-smoke' / args.name
    output.mkdir(parents=True, exist_ok=True)
    fixture = (root / 'browser/extension/fixtures/player.html').read_text(encoding='utf-8')
    if args.trigger_only:
        fixture = fixture.replace('<video id="first" controls width="640" height="360"></video>', '<div id="movie_player" style="position:relative;width:640px;height:408px;background:#333"><video id="first" controls width="640" height="360"></video><div class="ytp-chrome-bottom" style="position:absolute;bottom:0;right:0;height:48px"><div class="ytp-right-controls" style="display:flex;height:48px"><button style="width:48px;height:48px;padding:8px;border:0;background:transparent"><svg width="32" height="32"><rect x="4" y="4" width="24" height="24" fill="white"/></svg></button></div></div></div>')
    with tempfile.TemporaryDirectory(dir=output) as directory:
        extension = Path(directory) / 'extension'
        shutil.copytree(root / 'browser/extension/dist', extension)
        manifest_path = extension / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
        extension_id = digest.translate(str.maketrans('0123456789abcdef', 'abcdefghijklmnop'))
        worker_url = f'chrome-extension://{extension_id}/background.js'
        manifest['host_permissions'].append('https://nola.test/*')
        for script in manifest['content_scripts']:
            script['matches'].append('https://nola.test/*')
        manifest_path.write_text(json.dumps(manifest))
        with sync_playwright() as playwright:
            flags = [f'--disable-extensions-except={extension}', f'--load-extension={extension}'] if not args.cdp_load else ['--enable-unsafe-extension-debugging']
            if args.pipeline:
                flags.extend(['--window-position=-32000,-32000', '--auto-select-tab-capture-source-by-title=Nola browser caption fixture', '--auto-accept-this-tab-capture'])
            context = playwright.chromium.launch_persistent_context(str(Path(directory) / 'profile'), executable_path=args.executable, headless=not args.pipeline,
                ignore_default_args=['--disable-extensions', '--mute-audio'], args=flags, viewport={'width': 1280, 'height': 900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                if args.cdp_load:
                    # Chrome's Extensions domain replaces the removed branded CLI loader; this profile is disposable.
                    session = context.browser.new_browser_cdp_session()
                    session.send('Extensions.loadUnpacked', {'path': str(extension)})
                    session.detach()
                worker = next((candidate for candidate in context.service_workers if candidate.url == worker_url), None)
                if worker is None:
                    worker = context.wait_for_event('serviceworker', predicate=lambda candidate: candidate.url == worker_url)
                worker.evaluate('''legacy => {
                      self.pipeline = {chunks: 0, peak: 0, epoch: 0, configs: []};
                      chrome.runtime.connectNative = () => {
                        const listeners = [];
                        const emit = value => listeners.forEach(listener => listener(value));
                        return {onMessage: {addListener: listener => listeners.push(listener)}, onDisconnect: {addListener: () => {}}, disconnect: () => {}, postMessage: request => {
                          let value;
                          if (request.type === 'hello') value = {protocolVersion: 2, extensionVersion: chrome.runtime.getManifest().version, extensionCompatible: true, textTranslation: true, realtimeTranslation: !legacy, uiLanguage: 'ko', sourceLanguage: 'en', targetLanguage: 'zh', devices: [], browserAudio: true, captionServiceActive: legacy, config: {audioSource: 'tab', sourceLanguage: 'en', targetLanguage: 'zh', appearance: {showSource: true, showTranslation: true}}};
                          if (request.type === 'translate') value = {text: 'Fixture translation: ' + request.text};
                          if (request.type === 'start') value = {sessionId: 'fixture'};
                          if (request.type === 'reset') self.pipeline.epoch = request.epoch;
                          if (request.type === 'debug' && request.event === 'ext.capture') self.pipeline.configs.push(request.data.settings);
                          if (request.type === 'audio') {
                            self.pipeline.chunks++;
                            const bytes = Uint8Array.from(atob(request.pcmBase64), c => c.charCodeAt(0));
                            for (const sample of new Int16Array(bytes.buffer)) self.pipeline.peak = Math.max(self.pipeline.peak, Math.abs(sample));
                            if (self.pipeline.chunks % 10 === 0) setTimeout(() => emit({type: 'event', event: {protocolVersion: 1, type: 'caption', requestId: 'fixture', sessionId: 'fixture', streamEpoch: self.pipeline.epoch, videoStartedAtMs: 0, segment: {segmentId: 'fixture-phrase', revision: self.pipeline.chunks, startedAtMs: 0, sourceText: 'Audio reaches the caption pipeline', translations: [{targetLanguage: 'zh', text: '音频已传到字幕链路', state: 'complete', provider: 'fixture'}], isFinal: true}}}), 0);
                          }
                          setTimeout(() => emit({type: 'result', id: request.id, value}), 0);
                        }};
                      };
                      return chrome.storage.local.set({uiLanguage: 'en', theme: 'dark', autoSites: ['https://nola.test']});
                    }''', args.pipeline)
                page.route('https://nola.test/**', lambda route: route.fulfill(content_type='text/html', body=fixture))
                page.goto('https://nola.test/player')
                page.wait_for_load_state('networkidle')
                trigger = page.locator('[data-nola-extension="trigger"]')
                trigger.wait_for(state='visible')
                assert trigger.count() == 1
                def check_trigger(label):
                    badge = trigger.locator('.nola-trigger-state')
                    assert badge.inner_text() == label
                    paint = trigger.evaluate("""host => {const button=getComputedStyle(host.shadowRoot.querySelector('button'));const badge=getComputedStyle(host.shadowRoot.querySelector('.nola-trigger-state'));return {background:button.backgroundColor,fill:badge.backgroundColor,color:badge.color,radius:parseFloat(badge.borderRadius),height:parseFloat(badge.height)}}""")
                    assert paint['background'] == 'rgba(0, 0, 0, 0)', paint
                    assert paint['fill'] in ['oklch(0 0 0)', 'rgb(0, 0, 0)'], paint
                    assert paint['color'] == 'rgb(255, 255, 255)', paint
                    assert paint['radius'] >= paint['height'] / 2, paint
                check_trigger('OFF')
                if args.trigger_only:
                    page.evaluate("document.documentElement.style.fontSize='10px'")
                    geometry = trigger.evaluate("""host=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return{button:rect(host.shadowRoot.querySelector('button')),logo:rect(host.shadowRoot.querySelector('svg')),badge:rect(host.shadowRoot.querySelector('.nola-trigger-state'))}}""")
                    assert geometry['button']['width'] == 48 and geometry['logo']['width'] == 32, geometry
                    assert geometry['badge']['y'] >= geometry['logo']['y'] + geometry['logo']['height'] * .75, geometry
                    assert geometry['badge']['right'] >= geometry['logo']['right'] + 8, geometry
                    for theme in ['light', 'dark']:
                        for locale in ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']:
                            worker.evaluate('value => chrome.storage.local.set(value)', {'uiLanguage': locale, 'theme': theme})
                            page.wait_for_function("([locale,theme])=>{const host=document.querySelector('[data-nola-extension=trigger]');return host.lang===locale&&host.dataset.theme===theme}", arg=[locale, theme])
                            trigger.get_by_role('button').hover()
                            check_trigger('OFF')
                            trigger.get_by_role('button').click()
                            page.locator('[data-nola-extension="panel"]').wait_for(state='visible')
                            check_trigger('OFF')
                            worker.evaluate("async()=>{const [tab]=await chrome.tabs.query({url:'https://nola.test/player'});return chrome.tabs.sendMessage(tab.id,{type:'toggleSubtitles'})}")
                            trigger.locator('.nola-trigger-state', has_text='ON').wait_for()
                            check_trigger('ON')
                            if locale == 'zh-CN': trigger.screenshot(path=str(output / f'trigger-{theme}-on.png'))
                            worker.evaluate("async()=>{const [tab]=await chrome.tabs.query({url:'https://nola.test/player'});return chrome.tabs.sendMessage(tab.id,{type:'toggleSubtitles'})}")
                            trigger.locator('.nola-trigger-state', has_text='OFF').wait_for()
                            check_trigger('OFF')
                            if locale == 'zh-CN': trigger.screenshot(path=str(output / f'trigger-{theme}-off.png'))
                            trigger.get_by_role('button').click()
                    assert not errors, errors
                    page.locator('#movie_player').screenshot(path=str(output / 'player-controls.png'))
                    print(json.dumps({'checks':24,'locales':6,'themes':2,'errors':errors}),flush=True)
                    return
                assert page.locator('html').get_attribute('data-nola-capture-handle')
                panel = page.locator('[data-nola-extension="panel"]')
                assert panel.is_hidden(), 'Panel must stay hidden before the user opens it'
                assert page.locator('[data-nola-extension="overlay"]').is_hidden()
                page.screenshot(path=str(output / 'player.png'))
                trigger.get_by_role('button').click()
                panel.wait_for(state='visible')
                check_trigger('OFF')
                start_label = 'Start' if args.pipeline else 'Start live translation'
                panel.get_by_role('button', name=start_label, exact=True).wait_for()
                assert panel.get_by_role('button', name='Refresh', exact=True).count() == 1
                assert panel.get_by_role('button', name='Close', exact=True).count() == 1
                assert panel.get_by_text('Font size', exact=True).count() == 0
                bounds = panel.bounding_box()
                assert bounds and bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 1280
                assert panel.get_attribute('data-theme') == 'dark'
                assert panel.evaluate("(host) => getComputedStyle(host).getPropertyValue('--surface').trim()").startswith('oklch(27%')
                page.screenshot(path=str(output / 'panel.png'))
                panel.get_by_role('button', name='Subtitle settings', exact=True).click()
                assert panel.get_by_text('Live pipeline', exact=True).count() == 0
                page.screenshot(path=str(output / 'subtitle-settings.png'))
                panel.get_by_role('combobox', name='Target language', exact=True).click()
                panel.get_by_role('combobox', name='Search languages', exact=True).fill('Japanese')
                panel.get_by_role('option', name='Japanese', exact=True).click()
                panel.get_by_role('combobox', name='Target language', exact=True).get_by_text('Japanese', exact=True).wait_for()
                assert worker.evaluate("async () => (await chrome.storage.local.get('videoLanguage')).videoLanguage") == 'ja'
                worker.evaluate("() => chrome.storage.local.set({videoLanguage: 'zh'})")
                panel.get_by_role('button', name='Subtitle style', exact=True).click()
                page.screenshot(path=str(output / 'subtitle-style.png'))
                panel.get_by_role('button', name='Back', exact=True).click()
                panel.get_by_role('button', name='Back', exact=True).click()
                page.locator('#sample-paragraph').get_by_text('Fixture translation: A fixture paragraph for translation.', exact=True).wait_for()
                panel.get_by_role('switch', name='Translate existing subtitles', exact=True).click()
                overlay = page.locator('[data-nola-extension="overlay"]')
                overlay.get_by_text('Fixture translation: A fixture subtitle.', exact=True).wait_for()
                check_trigger('ON')
                trigger.screenshot(path=str(output / 'trigger-on.png'))
                panel.get_by_role('switch', name='Translate existing subtitles', exact=True).click()
                overlay.wait_for(state='hidden')
                check_trigger('OFF')
                trigger.screenshot(path=str(output / 'trigger-off.png'))
                options = context.new_page()
                options.goto(worker.url.rsplit('/', 1)[0] + '/options.html')
                options.get_by_role('heading', name='General', exact=True).wait_for()
                options.locator('aside nav').get_by_role('button', name='Video subtitles', exact=True).click()
                options.locator('[data-preview=video] .nola-demo-browser').wait_for()
                options.close()
                if args.pipeline:
                    page.locator('#tone').click()
                    panel.get_by_role('button', name='Start', exact=True).click()
                    overlay.get_by_text('Audio reaches the caption pipeline', exact=True).wait_for(state='visible')
                    assert worker.evaluate('self.pipeline.peak') > 100, 'Real PCM audio must be nonzero'
                    settings = worker.evaluate('self.pipeline.configs.at(-1)')
                    assert settings['echoCancellation'] is False and settings['noiseSuppression'] is False and settings['autoGainControl'] is False, settings
                    # YouTube's root rem scale must not shrink the extension controls.
                    page.evaluate("document.documentElement.style.fontSize = '10px'")
                    font = panel.get_by_role('button', name='Refresh', exact=True).evaluate('(button) => getComputedStyle(button).fontSize')
                    assert font == '13px', font
                    page.screenshot(path=str(output / 'captions.png'))
                    (output / 'pipeline.json').write_text(json.dumps(worker.evaluate('self.pipeline'), indent=2))
                panel.get_by_role('button', name='Close', exact=True).click()
                panel.wait_for(state='hidden')
                # Dynamic discovery must keep one trigger and need no extra settings UI.
                page.evaluate("const video = document.querySelector('video').cloneNode(); video.removeAttribute('id'); document.body.append(video)")
                trigger.get_by_role('button').click()
                assert panel.get_by_role('button', name=start_label, exact=True).count() == 1
                assert trigger.count() == 1
                page.evaluate("document.querySelector('video:last-of-type').remove()")
                page.reload()
                page.wait_for_load_state('networkidle')
                page.locator('[data-nola-extension="trigger"]').wait_for(state='visible')
                assert page.locator('[data-nola-extension="trigger"]').count() == 1
                assert not errors, errors
                checks = ['MV3 load', 'capture handle marker', 'single injection', 'hidden panel/empty captions', 'automatic video selection', 'viewport layout', 'panel close', 'reload cleanup', 'protocol v2 webpage and HTML5 subtitle translation', 'independent UI language', 'dark theme', 'options preview']
                if args.pipeline:
                    checks.extend(['real nonzero tab PCM', 'voice processing disabled', 'test transport captions rendered', 'website rem isolation'])
                (output / 'result.json').write_text(json.dumps({'passed': True, 'browser': args.name, 'worker': worker.url, 'checks': checks, 'pageErrors': errors}, indent=2))
                print(f'{args.name}: browser rendering smoke passed')
            except Exception:
                page.screenshot(path=str(output / 'failure.png'))
                print(json.dumps({'pageErrors': errors, 'hosts': page.locator('[data-nola-extension]').count(), 'handle': page.locator('html').get_attribute('data-nola-capture-handle')}))
                (output / 'result.json').write_text(json.dumps({'passed': False, 'browser': args.name, 'pageErrors': errors, 'extensionLoaded': bool(context.service_workers)}, indent=2))
                raise
            finally:
                context.close()


if __name__ == '__main__':
    main()
