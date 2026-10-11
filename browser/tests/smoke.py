"""Render the actual MV3 bundle in a disposable Chromium/Edge profile.

Only the generic fixture's host permission is added to a temporary extension copy.
Native host/ASR, sharing picker and real-site DOM acceptance remain separate checks.
"""
import argparse
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
    parser.add_argument('--pipeline', action='store_true', help='Capture real fixture audio with a test native transport; no ASR service is called')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / 'artifacts' / 'browser-smoke' / args.name
    output.mkdir(parents=True, exist_ok=True)
    fixture = (root / 'browser/extension/fixtures/player.html').read_text(encoding='utf-8')
    with tempfile.TemporaryDirectory(dir=output) as directory:
        extension = Path(directory) / 'extension'
        shutil.copytree(root / 'browser/extension/dist', extension)
        manifest_path = extension / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
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
                worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
                if args.pipeline:
                    worker.evaluate('''() => {
                      self.pipeline = {chunks: 0, peak: 0, epoch: 0, configs: []};
                      chrome.runtime.connectNative = () => {
                        const listeners = [];
                        const emit = value => listeners.forEach(listener => listener(value));
                        return {onMessage: {addListener: listener => listeners.push(listener)}, onDisconnect: {addListener: () => {}}, disconnect: () => {}, postMessage: request => {
                          let value;
                          if (request.type === 'hello') value = {protocolVersion: 1, extensionVersion: chrome.runtime.getManifest().version, extensionCompatible: true, uiLanguage: 'en', sourceLanguage: 'en', targetLanguage: 'zh', devices: [], browserAudio: true, captionServiceActive: true, config: {audioSource: 'tab', sourceLanguage: 'en', targetLanguage: 'zh', appearance: {showSource: true, showTranslation: true}}};
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
                    }''')
                page.route('https://nola.test/**', lambda route: route.fulfill(content_type='text/html', body=fixture))
                page.goto('https://nola.test/player')
                page.wait_for_load_state('networkidle')
                trigger = page.locator('[data-nola-extension="trigger"]')
                trigger.wait_for(state='visible')
                assert trigger.count() == 1
                assert page.locator('html').get_attribute('data-nola-capture-handle')
                panel = page.locator('[data-nola-extension="panel"]')
                assert panel.is_hidden(), 'Panel must stay hidden before the user opens it'
                assert page.locator('[data-nola-extension="overlay"]').is_hidden()
                page.screenshot(path=str(output / 'player.png'))
                trigger.get_by_role('button').click()
                panel.wait_for(state='visible')
                assert panel.get_by_role('button', name='Start', exact=True).count() == 1
                assert panel.get_by_role('button', name='Refresh', exact=True).count() == 1
                assert panel.get_by_role('button', name='Close', exact=True).count() == 1
                assert panel.get_by_text('Font size', exact=True).count() == 0
                bounds = panel.bounding_box()
                assert bounds and bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 1280
                page.screenshot(path=str(output / 'panel.png'))
                if args.pipeline:
                    page.locator('#tone').click()
                    panel.get_by_role('button', name='Start', exact=True).click()
                    overlay = page.locator('[data-nola-extension="overlay"]')
                    overlay.get_by_text('Audio reaches the caption pipeline', exact=True).wait_for(state='visible')
                    assert worker.evaluate('self.pipeline.peak') > 100, 'Real PCM audio must be nonzero'
                    settings = worker.evaluate('self.pipeline.configs.at(-1)')
                    assert settings['echoCancellation'] is False and settings['noiseSuppression'] is False and settings['autoGainControl'] is False, settings
                    # YouTube's root rem scale must not shrink the extension controls.
                    page.evaluate("document.documentElement.style.fontSize = '10px'")
                    font = panel.get_by_role('button', name='Refresh', exact=True).evaluate('(button) => getComputedStyle(button).fontSize')
                    assert font == '14px', font
                    page.screenshot(path=str(output / 'captions.png'))
                    (output / 'pipeline.json').write_text(json.dumps(worker.evaluate('self.pipeline'), indent=2))
                panel.get_by_role('button', name='Close', exact=True).click()
                panel.wait_for(state='hidden')
                # Dynamic discovery must keep one trigger and need no extra settings UI.
                page.evaluate("const video = document.querySelector('video').cloneNode(); video.removeAttribute('id'); document.body.append(video)")
                trigger.get_by_role('button').click()
                assert panel.get_by_role('button', name='Start', exact=True).count() == 1
                assert trigger.count() == 1
                page.evaluate("document.querySelector('video:last-of-type').remove()")
                page.reload()
                page.wait_for_load_state('networkidle')
                page.locator('[data-nola-extension="trigger"]').wait_for(state='visible')
                assert page.locator('[data-nola-extension="trigger"]').count() == 1
                assert not errors, errors
                checks = ['MV3 load', 'capture handle marker', 'single injection', 'hidden panel/empty captions', 'automatic video selection', 'minimal controls', 'viewport layout', 'panel close', 'reload cleanup']
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
