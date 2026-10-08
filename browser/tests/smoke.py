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
            context = playwright.chromium.launch_persistent_context(str(Path(directory) / 'profile'), executable_path=args.executable, headless=True,
                ignore_default_args=['--disable-extensions'],
                args=([f'--disable-extensions-except={extension}', f'--load-extension={extension}'] if not args.cdp_load else ['--enable-unsafe-extension-debugging']), viewport={'width': 1280, 'height': 900})
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
                panel.get_by_role('button', name='Choose video', exact=True).click()
                panel.get_by_role('option', name='Video 1', exact=True).click()
                bounds = panel.bounding_box()
                assert bounds and bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 1280
                page.screenshot(path=str(output / 'panel.png'))
                panel.get_by_role('button', name='Close', exact=True).click()
                panel.wait_for(state='hidden')
                # Dynamic discovery must keep one trigger and require a fresh explicit choice.
                page.evaluate("const video = document.querySelector('video').cloneNode(); video.removeAttribute('id'); document.body.append(video)")
                trigger.get_by_role('button').click()
                panel.get_by_role('button', name='Choose video', exact=True).click()
                panel.get_by_role('option', name='Video 3', exact=True).wait_for(state='visible')
                assert trigger.count() == 1
                page.evaluate("document.querySelector('video:last-of-type').remove()")
                page.reload()
                page.wait_for_load_state('networkidle')
                page.locator('[data-nola-extension="trigger"]').wait_for(state='visible')
                assert page.locator('[data-nola-extension="trigger"]').count() == 1
                assert not errors, errors
                (output / 'result.json').write_text(json.dumps({'passed': True, 'browser': args.name, 'worker': worker.url, 'checks': ['MV3 load', 'capture handle marker', 'single injection', 'hidden panel/empty captions', 'multiple video selection', 'viewport layout', 'panel close', 'reload cleanup'], 'pageErrors': errors}, indent=2))
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
