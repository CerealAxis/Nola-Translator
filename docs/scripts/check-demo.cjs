const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')

const url = process.argv[2]
const site = process.argv.includes('--site')
const output = path.resolve(__dirname, '../../artifacts/demo-check')
app.setPath('userData', path.join(output, 'electron-cache'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function main() {
  await app.whenReady()
  await fs.mkdir(output, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  const errors = []
  const failedRequests = []
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message))
  win.webContents.session.webRequest.onCompleted(details => {
    if (details.statusCode >= 400) failedRequests.push(`${details.statusCode} ${details.url}`)
  })
  const js = source => win.webContents.executeJavaScript(source, true)
  const until = source => js(`new Promise((resolve, reject) => { const deadline = Date.now() + 15000; const check = () => { if (${source}) resolve(); else if (Date.now() > deadline) reject(new Error(${JSON.stringify(source)})); else setTimeout(check, 50) }; check() })`)
  const settle = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const clickText = text => js(`(() => { const matches = [...document.querySelectorAll('button')].filter(item => !item.disabled && (item.textContent.trim() === ${JSON.stringify(text)} || item.getAttribute('aria-label') === ${JSON.stringify(text)})); const element = matches.find(item => item.closest('[role=dialog], [role=alertdialog]')) ?? matches[0]; if (!element) throw new Error('Missing button: ' + ${JSON.stringify(text)}); element.click() })()`)
  const capture = async name => fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  const geometry = async label => {
    await settle()
    const result = await js(`({ width: innerWidth, document: document.documentElement.scrollWidth, main: [...document.querySelectorAll('.nola-main')].map(element => ({ client: element.clientWidth, scroll: element.scrollWidth })) })`)
    assert.ok(result.document <= result.width + 1, `${label}: document overflow ${JSON.stringify(result)}`)
    assert.ok(result.main.every(item => item.scroll <= item.client + 1), `${label}: content overflow ${JSON.stringify(result)}`)
  }
  try {
    if (site) {
      win.setContentSize(1920, 1080)
      // Enter the detected locale directly; its automatic redirect aborts Electron's initial load promise.
      await win.loadURL(`${url}en/`)
      await until("document.querySelector('.site-demo-window iframe')?.style.visibility === 'visible'")
      await geometry('site 1920x1080')
      await capture('website-1920')
    } else {
      await win.loadURL(`${url}index.html?locale=zh-CN`)
      await until("document.documentElement.dataset.captureReady === 'true'")
      await capture('toy-home')
      const releaseDir = path.resolve(output, '../toy-release')
      await fs.mkdir(releaseDir, { recursive: true })
      win.setContentSize(1200, 900)
      await settle()
      await fs.writeFile(path.join(releaseDir, 'poster.png'), (await win.webContents.capturePage()).toPNG())
      const routes = ['#/', '#/workspace', '#/overlay', '#/video-captions', '#/records', '#/records/docs-demo', '#/models', ...['general', 'audio', 'translation', 'compute', 'performance', 'appearance', 'browser', 'storage', 'advanced', 'more'].map(tab => `#/settings/${tab}`)]
      for (const size of [[1440, 960], [1180, 780], [760, 560]]) {
        win.setContentSize(...size)
        for (const route of routes) {
          await js(`location.hash = ${JSON.stringify(route)}`)
          await until(`document.querySelector('[data-page]')?.getAttribute('data-page') === ${JSON.stringify(route === '#/' ? 'home' : route.startsWith('#/records/') ? 'record' : route.split('/')[1])}`)
          await geometry(`${size.join('x')} ${route}`)
        }
      }
      win.setContentSize(1440, 960)
      await win.loadURL(`${url}index.html?locale=zh-CN#/workspace`)
      await until("document.documentElement.dataset.captureReady === 'true'")
      await clickText('开始同传')
      await until("document.querySelector('[role=dialog] input')")
      await clickText('开始')
      await until("[...document.querySelectorAll('[role=dialog] button')].some(item => !item.disabled && item.textContent.trim() === '开始同传')")
      await clickText('开始同传')
      await until("document.querySelector('[data-slot=session-bar]')")
      await until("document.body.textContent.includes('Welcome, everyone.')")
      await capture('toy-workspace')
      await clickText('暂停')
      await clickText('继续')
      await js("location.hash = '#/settings/more'")
      await geometry('running More')
      await js("location.hash = '#/workspace'")
      await clickText('结束同传')
      await until("document.querySelector('[role=alertdialog]')")
      await capture('toy-stop-dialog')
      await js("[...document.querySelectorAll('[role=alertdialog] button')].find(item => item.textContent.includes('结束')).click()")
      await until("location.hash === '#/records/docs-demo'")
      await js("location.hash = '#/settings/more'")
      await until("document.querySelector('[data-onboarding=replay]')")
      await js("document.querySelector('[data-onboarding=replay]').click()")
      await until("document.querySelector('.onboarding-welcome')")
      await capture('toy-onboarding')
      await clickText('稍后再看')
      for (const locale of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) {
        await win.loadURL(`${url}index.html?locale=${locale}&page=dark-mode#/settings/more`)
        await until("document.documentElement.dataset.captureReady === 'true'")
        await until("document.documentElement.classList.contains('dark')")
        await geometry(`${locale} dark`)
        await capture(`toy-more-${locale}-dark`)
      }
    }
    assert.deepEqual(errors, [], 'renderer console errors')
    assert.deepEqual(failedRequests, [], 'failed resource requests')
    console.log(`PASS: ${site ? 'website at 1920x1080' : 'Toy subpath assets, 17 routes × 3 sizes, session controls, records, manual onboarding, 6 dark locales'}`)
  } catch (error) {
    await capture('failure').catch(() => undefined)
    await fs.writeFile(path.join(output, 'failure.txt'), JSON.stringify({ error: String(error), errors, failedRequests, text: await js('document.body.innerText') }, null, 2))
    throw error
  } finally {
    win.destroy()
    app.quit()
  }
}
main().catch(error => { console.error(error); app.exit(1) })
