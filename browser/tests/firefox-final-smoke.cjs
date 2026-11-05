const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const http = require('node:http')
const { firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { debuggerClient } = require('./firefox-smoke.cjs')
async function main() {
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/browser-firefox-final')
  await fs.mkdir(output, { recursive: true })
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-firefox-final-'))
  const extension = path.join(directory, 'extension')
  await fs.cp(path.join(root, 'browser/extension/dist-firefox'), extension, { recursive: true })
  const manifestRaw = await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'), manifest = JSON.parse(manifestRaw)
  assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*'])
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><title>Firefox ordinary HTTP</title></head><body><main><p id="source">Hello world.</p><textarea id="draft">Unsent draft</textarea></main></body></html>') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
  const uuid = '52b244a1-81d6-47ac-83b9-50af36180f0b', origin = 'moz-extension://' + uuid
  const errors = [], consoleErrors = [], checks = [], result = { version: manifest.version, originalManifest: true, checks, errors, consoleErrors, sidebar: 'Not verified: headless run does not establish native sidebar visibility or toolbar user gesture.' }
  let remote, context
  try {
    context = await firefox.launchPersistentContext(path.join(directory, 'profile'), { executablePath: process.env.FIREFOX_EXECUTABLE, headless: true, viewport: { width: 1280, height: 900 }, args: ['-start-debugger-server', String(port)], firefoxUserPrefs: { 'extensions.webextensions.uuids': JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: uuid }), 'devtools.chrome.enabled': true, 'devtools.debugger.remote-enabled': true, 'devtools.debugger.prompt-connection': false, 'xpinstall.signatures.required': false } })
    context.on('page', page => { page.on('pageerror', error => errors.push({ url: page.url(), message: error.message })); page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ url: page.url(), message: message.text() }) }) })
    const packets = []; remote = await debuggerClient(port, packet => packets.push(packet))
    const actors = await remote.request({ to: 'root', type: 'getRoot' })
    const installed = await remote.request({ to: actors.addonsActor, type: 'installTemporaryAddon', addonPath: extension })
    assert.equal(installed.addon.id, manifest.browser_specific_settings.gecko.id); checks.push('Original manifest temporary installation')
    const probe = await context.newPage(); await probe.goto('http://127.0.0.1:' + server.address().port + '/probe'); await probe.locator('.nola-floating-trigger').waitFor({ timeout: 15000 });
    const addons = await remote.request({to:'root',type:'listAddons'}); const addon = addons.addons.find(a=>a.id===manifest.browser_specific_settings.gecko.id);
    result.addon = { warnings: addon.warnings, background: addon.backgroundScriptStatus };
    const watcher = await remote.request({to:addon.actor,type:'getWatcher'});
    await remote.request({to:watcher.actor,type:'watchTargets',targetType:'frame'}); await probe.waitForTimeout(500);
    const background = packets.find(p=>p.type==='target-available-form' && p.target.url.endsWith('/_generated_background_page.html')).target;
    const evaluate = async text => {
      const ack = await remote.request({to:background.consoleActor,type:'evaluateJSAsync',text: text.includes('await ') ? '(async()=>{'+text+'})()' : text,awaitPromise:true});
      for(let i=0;i<100;i++){ const packet=packets.find(p=>p.type==='evaluationResult' && p.resultID===ack.resultID); if(packet){assert(!packet.exception,JSON.stringify(packet));return packet.result} await probe.waitForTimeout(50) }
      throw new Error('Background evaluation result timeout')
    };
    await remote.request({to:watcher.actor,type:'watchResources',resourceTypes:['error-message','console-message']});
    await evaluate("self.__defaultClick = (await browser.storage.local.get('floatingClickAction')).floatingClickAction ?? 'translate'");
    await evaluate("await browser.storage.local.set({uiLanguage:'en',pageProvider:'microsoft-translate',sourceLanguage:'en',pageLanguage:'zh',pageScope:'main'}); return 'configured'");
    await probe.waitForTimeout(500);
    const page = await context.newPage(); await page.goto('http://127.0.0.1:' + server.address().port + '/ordinary')
    await page.locator('.nola-floating-trigger').waitFor(); checks.push('Automatic floating injection on ordinary HTTP without permission patch')
    assert.equal(await page.locator('[data-nola-translation]').count(), 0)
    await page.locator('.nola-floating-trigger').click()
    await page.locator('#source [data-nola-translation]').waitFor({ timeout: 45000 })
    result.translated = await page.locator('#source [data-nola-translation]').innerText()
    assert(/[\u3400-\u9fff]/.test(result.translated)); checks.push('Default floating click translates via real Microsoft API')
    await page.screenshot({ path: path.join(output, 'translated.png') })
    await page.locator('.nola-floating-trigger').click()
    await page.locator('#source [data-nola-translation]').waitFor({ state: 'detached' })
    assert.equal(await page.locator('#source').innerText(), 'Hello world.')
    assert.equal(await page.locator('#draft').inputValue(), 'Unsent draft'); checks.push('Second default click restores original and retains input')
    await page.screenshot({ path: path.join(output, 'restored.png') })
    await evaluate("self.__startupAudit = {id:browser.runtime.id,registrations:await browser.scripting.getRegisteredContentScripts()}");
    await probe.waitForTimeout(300);
    const raw = await evaluate('JSON.stringify(self.__startupAudit)'); result.background = typeof raw === 'string' ? JSON.parse(raw) : raw;
    assert.deepEqual(result.background.registrations, []);
    result.defaultClick = await evaluate('self.__defaultClick'); assert.equal(result.defaultClick, 'translate');
    result.sidebarDocument = packets.filter(p=>p.type==='target-available-form').map(p=>p.target.url).find(url=>url.endsWith('/sidepanel.html'));
    result.backgroundResources = packets.filter(p=>p.type==='resources-available-array');
    result.backgroundErrors = result.backgroundResources.flatMap(packet => packet.array.flatMap(([type, resources]) => type === 'error-message' ? resources.map(resource => resource.pageError).filter(error => error.error) : []));
    checks.push('Persistent background reachable, no legacy dynamic registrations')
    assert.equal(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'), manifestRaw)
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(result.backgroundErrors, [])
    result.functionalPassed = true
    result.runtimeLogReview = 'Background and sidepanel cached error resources, page errors, and console errors are empty. Native sidebar visibility and gesture remain unverified.'
  } finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
    remote?.close(); await context?.close(); await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
