const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')

const url = process.argv[2]
const output = path.resolve(__dirname, '../../artifacts/demo-check')
app.setPath('userData', path.join(output, `site-electron-cache-${process.pid}`))
app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function main() {
  await app.whenReady()
  await fs.mkdir(output, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  const errors = []
  const failedRequests = []
  win.webContents.on('console-message', event => {
    if (event.level !== 'error') return
    const message = `${event.message} (${event.sourceId || 'renderer'}:${event.lineNumber ?? 0})`
    errors.push(message)
    console.error(`[renderer] ${message}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    const message = `Renderer exited: ${details.reason} (${details.exitCode})`
    errors.push(message)
    console.error(message)
  })
  win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message))
  win.webContents.session.webRequest.onCompleted(details => {
    if (details.statusCode >= 400) failedRequests.push(`${details.statusCode} ${details.url}`)
  })
  win.webContents.debugger.attach('1.3')
  const js = async source => {
    // Return renderer exceptions as data; executeJavaScript otherwise loses their message and stack.
    const expression = `(async () => { try { return { ok: true, value: await (0, eval)(${JSON.stringify(source)}) }; } catch (error) { return { ok: false, message: String(error), stack: error?.stack }; } })()`
    // Evaluate after DOM readiness without waiting for third-party comment frames to finish loading.
    const { result, exceptionDetails } = await win.webContents.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    const outcome = result.value
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    if (!outcome?.ok) throw new Error(`${outcome?.message ?? 'Renderer returned no result'}\n${outcome?.stack ?? ''}\nEvaluation: ${source.slice(0, 1500)}`)
    return outcome.value
  }
  const until = source => js(`new Promise((resolve, reject) => { const deadline = Date.now() + 15000; const check = () => { if (${source}) resolve(); else if (Date.now() > deadline) reject(new Error(${JSON.stringify(source)})); else setTimeout(check, 50) }; check() })`)
  const settle = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const finishTransitions = () => js(`Promise.all([document, document.querySelector('iframe')?.contentDocument].filter(Boolean).flatMap(doc => doc.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))))`)
  const loadDocument = async target => {
    // Third-party comments must not hold the site's own theme check behind the window load event.
    win.webContents.stop()
    const domReady = new Promise(resolve => win.webContents.once('dom-ready', resolve))
    void win.loadURL(target).catch(error => { if (error.code !== 'ERR_ABORTED') errors.push(String(error)) })
    let timeout
    try {
      await Promise.race([domReady, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`DOM readiness timed out: ${target}`)), 15000) })])
    } finally { clearTimeout(timeout) }
  }
  const capture = async name => {
    // Capture readiness is set by React before Chromium necessarily presents its first frame.
    await settle()
    try { await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG()) }
    catch (cause) { throw new Error(`Screenshot failed: ${name} (${win.webContents.getURL()})`, { cause }) }
  }
  const geometry = async label => {
    await settle()
    const result = await js(`({ width: innerWidth, document: document.documentElement.scrollWidth, main: [...document.querySelectorAll('.nola-main')].map(element => ({ client: element.clientWidth, scroll: element.scrollWidth })) })`)
    assert.ok(result.document <= result.width + 1, `${label}: document overflow ${JSON.stringify(result)}`)
    assert.ok(result.main.every(item => item.scroll <= item.client + 1), `${label}: content overflow ${JSON.stringify(result)}`)
  }
  try {
    nativeTheme.themeSource = 'light'
    await win.webContents.session.clearStorageData({ storages: ['localstorage'] })
    win.setContentSize(1920, 1080)
    // Enter the detected locale directly; its automatic redirect aborts Electron's initial load promise.
    await loadDocument(`${url}en/`)
    await until("document.querySelector('.site-demo-window iframe')?.style.visibility === 'visible'")
    assert.ok(await js("document.querySelector('.site-theme') !== null"), 'homepage needs a theme toggle')
    const demo = "document.querySelector('.site-demo-window iframe').contentDocument"
    const sidebar = `${demo}.querySelector('[data-slot=sidebar]')`
    const sidebarTrigger = `${demo}.querySelector('[data-slot=sidebar-trigger]')`
    const sidebarWidth = () => js(`${sidebar}.getBoundingClientRect().width`)
    await until(`${sidebarTrigger}?.getAttribute('aria-expanded') === 'true'`)
    await until(`${sidebar}.querySelector('img[alt="Nola Translator"]')?.naturalWidth > 0`)
    assert.match(await js(`${sidebar}.querySelector('[data-slot=sidebar-footer]').textContent`), /Local user\s*local@nola\.invalid/)
    assert.equal(await js(`${sidebar}.querySelector('[data-slot=avatar-fallback]').textContent`), 'N')
    for (const element of [sidebarTrigger, `${sidebar}.querySelector('.nola-sidebar-account')`]) {
      assert.equal(await js(`getComputedStyle(${element}).backgroundColor`), 'rgba(0, 0, 0, 0)')
    }
    const expandedWidth = await sidebarWidth()
    await js(`${sidebarTrigger}.click()`)
    await until(`${sidebar}.dataset.collapsible === 'icon'`)
    await finishTransitions()
    assert.ok(await sidebarWidth() < expandedWidth)
    await js(`${sidebar}.querySelector('[data-onboarding=nav-model-gateway]').click()`)
    await until(`${sidebar}.querySelector('[data-onboarding=nav-model-gateway]').getAttribute('aria-current') === 'page'`)
    await js(`${sidebar}.querySelector('[data-onboarding=nav-home]').click(); ${sidebarTrigger}.click()`)
    await until(`${sidebarTrigger}.getAttribute('aria-expanded') === 'true'`)
    await finishTransitions()
    assert.equal(await sidebarWidth(), expandedWidth)
    await geometry('site 1920x1080')
    await capture('website-1920')
    assert.equal(await js("document.querySelector('.site-locale span').textContent"), 'Auto detect')
    await js("document.querySelector('.site-demo-window iframe').contentWindow.location.hash = '#/settings/audio'")
    const guide = `${demo}.querySelector('a[href="https://vb-audio.com/Cable/"]')`
    await until(`${guide}?.textContent.trim() === 'Installation guide'`)
    assert.match(await js(`${guide}.closest('.settings-row').textContent`), /CABLE Input.*CABLE Output.*receiving app/)
    // Theme messages must preserve the live iframe, including its current route.
    await js("window.dispatchEvent(new CustomEvent('nola-demo-page', { detail: 'workspace' }))")
    await until("document.querySelector('iframe').contentWindow.location.hash === '#/workspace'")
    await js("document.querySelector('iframe').contentWindow.__themeCheck = 'retained'")
    const checkTheme = async dark => {
      await until(`document.documentElement.classList.contains('dark') === ${dark}`)
      await until(`document.querySelector('iframe').contentDocument.documentElement.classList.contains('dark') === ${dark}`)
      await finishTransitions()
      assert.equal(await js("document.querySelector('iframe').contentWindow.__themeCheck"), 'retained', 'theme change must not reload the demo')
      assert.equal(await js("document.querySelector('iframe').contentWindow.location.hash"), '#/workspace')
      assert.ok(await js(`[...document.querySelectorAll('.site-poster-window img, .site-download-art img')].every(image => image.src.endsWith(${JSON.stringify(dark ? '-dark.png' : '.png')}) && ${dark ? 'true' : "!image.src.endsWith('-dark.png')"})`), 'posters must follow site theme')
      const colors = await js(`(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const luminance = color => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4 });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const probe = document.createElement('span'); probe.style.color = 'var(--site-hero-start)'; document.querySelector('.nola-site').append(probe);
        const hero = luminance(getComputedStyle(probe).color); probe.remove();
        const button = getComputedStyle(document.querySelector('.site-download-button'));
        const foreground = luminance(button.color), background = luminance(button.backgroundColor);
        return { hero, contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
      })()`)
      if (dark) assert.ok(colors.hero < .1, `dark hero too bright: ${JSON.stringify(colors)}`)
      assert.ok(colors.contrast >= 4.5, `download text contrast: ${JSON.stringify(colors)}`)
    }
    await js("document.querySelector('.site-theme').click()")
    await checkTheme(true)
    console.log('PASS: live demo and hero dark theme')
    await capture('website-dark-1920')
    await js("window.scrollTo({ top: 1500, behavior: 'instant' })")
    await until("document.querySelector('.site-nav--scrolled')")
    await until("document.querySelector('.site-scenarios.is-visible')")
    await finishTransitions()
    await capture('website-dark-scrolled')
    await js("document.querySelector('.site-theme').click()")
    await checkTheme(false)
    console.log('PASS: live demo light theme')
    await js("document.querySelector('.site-theme').click()")
    await checkTheme(true)
    console.log('PASS: repeated theme switch')
    assert.equal(await js("localStorage.getItem('vitepress-theme-appearance')"), 'dark')
    await js("Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-FR'] }); document.querySelector('.site-locale').click()")
    await until("[...document.querySelectorAll('[role=menuitemradio]')].some(item => item.textContent.includes('Auto detect'))")
    await js("[...document.querySelectorAll('[role=menuitemradio]')].find(item => item.textContent.includes('Auto detect')).click()")
    assert.equal(await js("location.pathname"), '/en/', 'unsupported browser language falls back to English')
    assert.equal(await js("document.querySelector('.site-locale span').textContent"), 'Auto detect')
    const missingPosters = await js(`Promise.all(['zh-CN','zh-TW','zh-HK','en','ja','ko'].flatMap(locale => ['home','workspace','models','overlay-scene','browser-scene'].map(async page => {
      const path = '${url}screenshots/' + locale + '/' + page + '-dark.png';
      return (await fetch(path)).ok ? null : path;
    }))).then(items => items.filter(Boolean))`)
    assert.deepEqual(missingPosters, [], 'six locales must have every dark poster')
    for (const size of [[1920, 1080], [1180, 780], [760, 560]]) {
      win.setContentSize(...size)
      await geometry(`site dark ${size.join('x')}`)
    }
    await js("localStorage.setItem('nola-site-language', 'en')")
    await loadDocument(`${url}en/getting-started/`)
    await until("document.querySelector('.VPDoc') && document.documentElement.classList.contains('dark')")
    console.log('PASS: document retains dark preference')
    assert.deepEqual(errors, [], 'renderer console errors')
    assert.deepEqual(failedRequests, [], 'failed resource requests')
    console.log('PASS: website sidebar, themes, iframe state, contrast, language fallback and responsive layout')
  } catch (error) {
    console.error(error)
    await capture('failure').catch(() => undefined)
    await fs.writeFile(path.join(output, 'failure.txt'), JSON.stringify({ error: error.stack ?? String(error), errors, failedRequests, state: await js("({ url: location.href, page: document.querySelector('[data-page]')?.getAttribute('data-page'), buttons: [...document.querySelectorAll('button')].map(item => ({ text: item.textContent.trim(), label: item.getAttribute('aria-label'), disabled: item.disabled })), text: document.body.innerText })").catch(cause => ({ diagnosticError: String(cause) })) }, null, 2))
    throw error
  } finally {
    win.destroy()
    app.quit()
  }
}
main().catch(error => { console.error(error); app.exit(1) })
