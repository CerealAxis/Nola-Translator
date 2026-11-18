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
  await win.loadURL('about:blank')
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
  const loadDocument = async (target, navigate = () => win.loadURL(target)) => {
    await until("document.readyState === 'complete'")
    const domReady = new Promise(resolve => win.webContents.once('dom-ready', resolve))
    void navigate().catch(error => { if (error.code !== 'ERR_ABORTED' && error.errno !== -3) errors.push(String(error)) })
    let timeout
    try {
      await Promise.race([domReady, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`DOM readiness timed out: ${target}`)), 30000) })])
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
    await win.webContents.session.clearStorageData({ storages: ['localstorage', 'cookies'] })
    const prompt = "document.querySelector('.site-language-prompt')"
    const languageSelect = `${prompt}.querySelector('[role="combobox"]')`
    const languageValue = `${languageSelect}.querySelector('[data-slot="select-value"]')`
    await win.webContents.debugger.sendCommand('Page.enable')
    const setBrowserLanguage = browserLanguage => win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(navigator, 'languages', { configurable: true, value: [${JSON.stringify(browserLanguage)}] })`,
    })
    const initialLanguage = await setBrowserLanguage('zh-CN')
    win.setContentSize(1920, 1080)
    const requests = win.webContents.session.webRequest
    let resumeLanding
    requests.onBeforeRequest({ urls: [`${url}assets/chunks/LandingPage*.js`] }, (_details, callback) => {
      resumeLanding = () => callback({})
    })
    try {
      await loadDocument(url)
      await until("document.querySelector('.site-loading')?.offsetHeight > 0")
      assert.equal(await js("getComputedStyle(document.querySelector('.site-loading-fallback')).display"), 'none')
      assert.equal(await js("getComputedStyle(document.querySelector('.site-loader-orbit')).animationName"), 'site-loader-turn')
      assert.equal(await js("getComputedStyle(document.querySelector('.site-loader-wave i')).animationName"), 'site-loader-wave')
    } finally {
      requests.onBeforeRequest(null)
      resumeLanding?.()
    }
    await until("document.querySelector('.site-demo-window iframe')?.style.visibility === 'visible'")
    assert.equal(await js("document.querySelector('.site-loading, .site-loading-fallback')"), null)
    console.log('PASS: animated homepage loader transitions directly to the interactive homepage')
    assert.equal(await js('document.documentElement.lang'), 'en')
    const necessary = "[...document.querySelectorAll('#cc-main button')].find(button => button.textContent.trim() === 'Necessary only')"
    await until(`Boolean(${necessary})`)
    const cookieBox = "document.querySelector('#cc-main .cm')"
    await until(`getComputedStyle(${cookieBox}).visibility === 'visible'`)
    assert.equal(await js(`Boolean(${prompt})`), false, 'Cookie consent is shown before the language notice')
    const cookieStyle = await js(`['right', 'bottom', 'backgroundColor', 'borderRadius', 'boxShadow'].map(key => getComputedStyle(${cookieBox})[key])`)
    await capture('website-cookie-notice')
    await js(`(${necessary}).click()`)
    await until(`${prompt}?.lang === 'zh-CN'`)
    assert.equal(await js(`getComputedStyle(${cookieBox}).visibility`), 'hidden')
    assert.deepEqual(await js(`['right', 'bottom', 'backgroundColor', 'borderRadius', 'boxShadow'].map(key => getComputedStyle(${prompt})[key])`), cookieStyle)
    assert.equal(await js(`${languageValue}.textContent.trim()`), '简体中文')
    assert.ok(await js(`(() => {
      const [confirm, dismiss] = ${prompt}.querySelectorAll('.site-language-actions button')
      return confirm.offsetWidth === dismiss.offsetWidth && confirm.getBoundingClientRect().bottom < dismiss.getBoundingClientRect().top
    })()`), 'language actions use the same stacked layout as the Cookie notice')
    await capture('website-language-notice-zh-CN')
    await js(`${prompt}.querySelector('button[data-variant="secondary"]').click()`)
    await until(`!${prompt}`)
    await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialLanguage.identifier })
    assert.ok(await js("document.querySelector('.site-theme') !== null"), 'homepage needs a theme toggle')
    const demo = "document.querySelector('.site-demo-window iframe').contentDocument"
    const sidebar = `${demo}.querySelector('[data-slot=sidebar]')`
    const sidebarTrigger = `${demo}.querySelector('[data-slot=sidebar-trigger]')`
    const sidebarWidth = () => js(`${sidebar}.getBoundingClientRect().width`)
    await until(`${sidebarTrigger}?.getAttribute('aria-expanded') === 'true'`)
    await until(`${sidebar}.querySelector('button[aria-label="Nola Translator"] img')?.naturalWidth > 0`)
    assert.match(await js(`${sidebar}.querySelector('[data-slot=sidebar-footer]').textContent`), /Local account\s*local@xaviermc\.top/)
    await until(`${sidebar}.querySelector('.nola-sidebar-account img')?.naturalWidth > 0`)
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
    const helpPoint = await js(`(() => {
      const frame=document.querySelector('.site-demo-window iframe'), button=${guide}.closest('.settings-row').querySelector('button');
      button.scrollIntoView({ block:'center' });
      const f=frame.getBoundingClientRect(), r=button.getBoundingClientRect(), scale=f.width/frame.clientWidth;
      return {x:Math.round(f.left+(r.left+r.width/2)*scale),y:Math.round(f.top+(r.top+r.height/2)*scale)};
    })()`)
    win.webContents.sendInputEvent({type:'mouseMove',...helpPoint})
    const explanation = `${demo}.querySelector('[data-description="true"]')`
    await until(`${explanation}?.textContent.includes('CABLE Input')`)
    assert.match(await js(`${explanation}.textContent`), /CABLE Input.*CABLE Output/)
    assert.equal(await js(`getComputedStyle(${explanation}).fontSize`), '14px')
    await js(`${guide}.focus()`)
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
      assert.ok(dark ? colors.hero < .1 : colors.hero >= .1 && colors.hero < .45,
        `${dark ? 'dark' : 'light'} hero luminance: ${JSON.stringify(colors)}`);
      assert.equal(await js("getComputedStyle(document.querySelector('.site-locale')).backgroundColor"),
        'rgba(0, 0, 0, 0)', 'homepage locale button must not inherit preview material');
      assert.ok(colors.contrast >= 4.5, `download text contrast: ${JSON.stringify(colors)}`)
    }
    await js("document.querySelector('.site-theme').click()")
    await checkTheme(true)
    console.log('PASS: live demo and hero dark theme')
    await capture('website-dark-1920')
    await js("document.querySelector('#features').scrollIntoView({ block: 'start', behavior: 'instant' })")
    await until("document.querySelector('.site-nav--scrolled')")
    await until("document.querySelector('#features [data-reveal=section]:not(.is-offscreen)')")
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
    assert.equal(await js("location.pathname"), '/', 'unsupported browser language keeps the English homepage')
    assert.equal(await js("document.querySelector('.site-language-prompt')"), null)
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

    await js("localStorage.removeItem('nola-site-language'); sessionStorage.removeItem('nola-language-prompt-dismissed')")
    const languageDescriptions = {
      'zh-CN': '想以您的语言查看本页吗？',
      'zh-TW': '您想要檢視此頁面的 正體中文（繁體）版本嗎？',
      'zh-HK': '想以您的語言瀏覽此頁嗎？',
      ko: '한국어로 현재 페이지를 보시겠습니까?',
      ja: 'このページを日本語で表示しますか?',
    }
    for (const [browserLanguage, locale] of [['en-US', 'en'], ['zh-CN', 'zh-CN'], ['zh-Hant-TW', 'zh-TW'], ['zh-Hant-HK', 'zh-HK'], ['ko-KR', 'ko'], ['ja-JP', 'ja']]) {
      const { identifier } = await setBrowserLanguage(browserLanguage)
      try {
        await loadDocument(`${url}?locale-check=${locale}`)
        await until("document.querySelector('.site-locale')")
        assert.equal(await js('navigator.languages[0]'), browserLanguage)
        assert.equal(await js('location.pathname'), '/')
        assert.equal(await js('document.documentElement.lang'), 'en')
        if (locale === 'en') assert.equal(await js(`${prompt}?.lang ?? null`), null)
        else {
          await until(`${prompt}?.lang === ${JSON.stringify(locale)}`)
          assert.equal(await js(`${prompt}.querySelector('[data-slot="card-description"]').textContent.trim()`), languageDescriptions[locale])
          assert.ok(await js(`${languageSelect}.querySelector('svg').getBoundingClientRect().width > 0`))
        }
        if (locale === 'ja') {
          assert.equal(await js(`${prompt}.getAttribute('role')`), 'region')
          assert.equal(await js(`${prompt}.contains(document.activeElement)`), false)
          assert.equal(await js(`getComputedStyle(${prompt}).position`), 'fixed')
          win.webContents.setZoomFactor(2)
          const checkPromptGeometry = async () => {
            await geometry('Japanese language notice at 200%')
            assert.ok(await js(`(() => {
              const {left, top, right, bottom} = ${prompt}.getBoundingClientRect()
              return left > 0 && top > 0 && right < innerWidth && bottom < innerHeight
            })()`))
          }
          await checkPromptGeometry()
          assert.ok(await js(`[...${prompt}.querySelectorAll('.site-language-actions button')].every(button => button.offsetHeight >= 42 && getComputedStyle(button).borderRadius === '18px')`))
          await capture('website-language-prompt-dark')
          win.webContents.setZoomFactor(1)
          await settle()
          const heroTop = await js("document.querySelector('.site-hero-wordmark').getBoundingClientRect().top")
          await js(`${prompt}.querySelector('button[data-variant="secondary"]').click()`)
          await until(`!${prompt} && document.activeElement.classList.contains('site-locale')`)
          assert.equal(await js("document.querySelector('.site-hero-wordmark').getBoundingClientRect().top"), heroTop)
          await loadDocument(`${url}?locale-check=dismissed`)
          await until("document.querySelector('.site-locale')")
          assert.equal(await js(`${prompt}?.lang ?? null`), null)
          await js("document.querySelector('.site-theme').click()")
          await until("!document.documentElement.classList.contains('dark')")
          await finishTransitions()
          await js("sessionStorage.removeItem('nola-language-prompt-dismissed')")
          await loadDocument(`${url}?locale-check=confirmed`)
          await until(`${prompt}?.lang === 'ja'`)
          win.webContents.setZoomFactor(2)
          await checkPromptGeometry()
          await capture('website-language-prompt-light')
          win.webContents.setZoomFactor(1)
          assert.equal(await js(`${languageValue}.textContent.trim()`), '日本語')
          await js(`${languageSelect}.click()`)
          const options = "document.querySelector('.site-language-options')"
          await until(`${options}?.querySelectorAll('[role="option"]').length === 6`)
          await js(`${options}.querySelector('[role="option"][lang="zh-TW"]').click()`)
          await until(`!${options} && ${languageValue}.textContent.includes('台灣')`)
          assert.equal(await js('location.pathname'), '/')
          assert.equal(await js(`${prompt}.lang`), 'ja')
          await loadDocument(`${url}zh-TW/`, () => js(`setTimeout(() => ${prompt}.querySelector('button[data-variant="default"]').click(), 50); true`))
          await until("location.pathname === '/zh-TW/' && document.querySelector('.site-locale')")
          assert.equal(await js(`${prompt}?.lang ?? null`), null)
          await loadDocument(`${url}ja/`)
          await until("location.pathname === '/ja/' && document.querySelector('.site-locale')")
          assert.equal(await js(`${prompt}?.lang ?? null`), null)
          await until(`${demo}?.querySelector('[aria-labelledby="nola-home-releases-title"]')?.textContent.includes('リリースのお知らせはありません。')`)
          await js("document.querySelector('.site-theme').click()")
          await until("document.documentElement.classList.contains('dark')")
          await finishTransitions()
        }
      } finally {
        await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier })
      }
    }
    console.log('PASS: English homepage and localized language suggestions')
    await js("localStorage.setItem('nola-site-language', 'en')")
    await loadDocument(`${url}en/getting-started/`)
    await until("document.querySelector('.VPDoc') && document.documentElement.classList.contains('dark')")
    console.log('PASS: document retains dark preference')
    await loadDocument(`${url}vis/foundations/typography.html`)
    const specimen = '[data-scene="appearance-typography"]'
    await until(`document.querySelector('${specimen} .type-code')`)
    for (const dark of [true, false]) {
      await js(`document.documentElement.classList.toggle('dark', ${dark})`)
      await settle()
      const actual = await js(`['h1','h2','h3','h4','body','small','muted','code'].map(role => {
        const el = document.querySelector('${specimen} .type-' + role), style = getComputedStyle(el);
        return [parseFloat(style.fontSize), parseFloat(style.lineHeight), style.fontWeight,
          style.letterSpacing === 'normal' ? 0 : Number(parseFloat(style.letterSpacing).toFixed(3))];
      })`)
      assert.deepEqual(actual, [[36,40,'800',0], [30,36,'600',0], [24,32,'600',0], [20,28,'600',0],
        [dark ? 15 : 14,22,'400',dark ? 0.225 : 0], [14,20,'500',dark ? 0.28 : 0],
        [14,20,'400',dark ? 0.28 : 0], [14,20,'600',0]], `product typography preview in ${dark ? 'dark' : 'light'} theme`)
    }
    console.log('PASS: eight product typography styles in both preview themes')
    win.setContentSize(1440, 960)
    await loadDocument(`${url}vis/components/shadcn/typography.html`)
    const preview = '.vitepress-demo-plugin-preview'
    await until(`document.querySelector('${preview} blockquote') && document.querySelector('.markdown-alert-note .markdown-alert-title svg')`)
    await until(`[...document.querySelectorAll('${preview}')].every(frame => frame.firstElementChild?.firstElementChild)`)
    const typography = await js(`(() => {
      const h1 = getComputedStyle(document.querySelector('${preview} h1'));
      const quote = getComputedStyle(document.querySelector('${preview} blockquote'));
      const note = getComputedStyle(document.querySelector('.markdown-alert-note'));
      const icon = getComputedStyle(document.querySelector('.markdown-alert-note .markdown-alert-title svg'));
      return [h1.fontSize, h1.webkitTextFillColor, h1.color, h1.backgroundImage,
        quote.borderInlineStartWidth, quote.backgroundColor, note.borderInlineStartWidth, icon.fill === icon.color];
    })()`)
    assert.equal(typography[0], '36px')
    assert.equal(typography[1], typography[2], 'the preview title uses product text, not the article gradient')
    assert.deepEqual(typography.slice(3), ['none', '2px', 'rgba(0, 0, 0, 0)', '0px', true])
    await capture('component-typography')
    await loadDocument(`${url}vis/components/shadcn/alert-dialog.html`)
    const trigger = '[data-slot="alert-dialog-trigger"]'
    const popup = '[data-slot="alert-dialog-content"]'
    const description = '[data-slot="alert-dialog-description"]'
    const firstTrigger = `document.querySelector('${preview}')?.querySelector('${trigger}')`
    await until(firstTrigger)
    await js(`${firstTrigger}.click()`)
    await until(`document.querySelector('${popup}')?.checkVisibility()`)
    for (const dark of [false, true]) {
      await js(`document.documentElement.classList.toggle('dark', ${dark})`)
      await finishTransitions()
      const colorsAndType = await js(`(() => {
        const root = document.querySelector('${preview}');
        const portal = document.querySelector('${popup}').closest('[data-base-ui-portal]');
        const description = document.querySelector('${description}');
        const probe = document.createElement('span');
        probe.className = 'text-muted-foreground';
        root.append(probe);
        const inlineColor = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(description);
        return [getComputedStyle(portal).colorScheme, style.color, inlineColor, style.fontSize,
          style.lineHeight, style.fontFamily === getComputedStyle(root).fontFamily];
      })()`)
      const mutedColor = dark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)'
      assert.deepEqual(colorsAndType, [dark ? 'dark' : 'light', mutedColor, mutedColor, '14px', '20px', true])
      await capture(`component-alert-dialog-${dark ? 'dark' : 'light'}`)
    }
    win.setContentSize(760, 820)
    win.webContents.setZoomFactor(2)
    await settle()
    await finishTransitions()
    const fits = await js(`(() => {
      const rect = document.querySelector('${popup}').getBoundingClientRect();
      return rect.left > 0 && rect.right < innerWidth && rect.top > 0 && rect.bottom < innerHeight;
    })()`)
    assert.ok(fits, 'the alert dialog fits a narrow viewport at 200%')
    await capture('component-alert-dialog-narrow-200')
    console.log('PASS: component preview colors, popups, typography isolation and callouts')
    assert.deepEqual(errors, [], 'renderer console errors')
    assert.deepEqual(failedRequests, [], 'failed resource requests')
    console.log('PASS: website sidebar, themes, iframe state, contrast, language fallback and responsive layout')
  } catch (error) {
    console.error(error)
    await capture('failure').catch(() => undefined)
    await fs.writeFile(path.join(output, 'failure.txt'), JSON.stringify({ error: error.stack ?? String(error), errors, failedRequests, state: await js("({ url: location.href, page: document.querySelector('[data-page]')?.getAttribute('data-page'), buttons: [...document.querySelectorAll('button')].map(item => ({ text: item.textContent.trim(), label: item.getAttribute('aria-label'), disabled: item.disabled })), text: document.body.innerText })").catch(cause => ({ diagnosticError: String(cause) })) }, null, 2))
    throw error
  } finally {
    if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach()
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
