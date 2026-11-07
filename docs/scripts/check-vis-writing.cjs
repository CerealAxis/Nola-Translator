const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')

const output = path.resolve(__dirname, '../../artifacts/vis-chapter5')
async function check() {
  await fs.mkdir(output, { recursive: true })
  const origin = new URL(process.argv[2] || 'http://127.0.0.1:5174')
  const browserPath = path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')
  assert.ok(existsSync(browserPath), 'Microsoft Edge is required for the documentation visual check')
  const profile = await fs.mkdtemp(path.join(output, 'browser-'))
  const browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  const launchDeadline = Date.now() + 20000
  while (!existsSync(portFile)) {
    assert.ok(Date.now() < launchDeadline, 'Browser did not start')
    await sleep(100)
  }
  const port = (await fs.readFile(portFile, 'utf8')).split('\n')[0]
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const errors = []
  const hydrationWarnings = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const response = pending.get(message.id)
      if (!response) return
      pending.delete(message.id)
      clearTimeout(response.timer)
      if (message.error) response.reject(new Error(message.error.message))
      else response.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args.map(arg => arg.value || arg.description).join(' ')
      if (text === 'Hydration completed but contains mismatches.') hydrationWarnings.push(text)
      else errors.push(text)
    }
  })
  function command(method, params = {}) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)) }, 15000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  await command('Page.enable')
  await command('Runtime.enable')
  async function viewport(width, height, scale = 1) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  }
  await viewport(1440, 1000)
  async function read(source) {
    const result = await command('Runtime.evaluate', {
      expression: `(() => {
        const boxes = [...document.querySelectorAll('.vitepress-demo-plugin-preview')];
        return (${source});
      })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  async function wait(source) {
    const end = Date.now() + 20000
    while (!await read(`Boolean(${source})`)) {
      if (Date.now() > end) throw new Error(`Timed out: ${source}`)
      await sleep(100)
    }
  }
  async function screenshot(name, full = false) {
    await sleep(200)
    const size = await read('({width:innerWidth,height:document.documentElement.scrollHeight})')
    if (full) {
      const result = await command('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
      })
      await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'))
    } else {
      const result = await command('Page.captureScreenshot', { format: 'png' })
      await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'))
    }
  }
  async function geometry(article, mode) {
    const result = await read(`({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boards: boxes.map(box => {
        const board = box.querySelector('[data-writing-scene]');
        return {width:board.clientWidth, overflow:board.scrollWidth-board.clientWidth};
      })
    })`)
    assert.ok(result.overflow <= 1 && result.boards.every(board => board.width > 200 && board.overflow <= 1), `${article} ${mode}: ${JSON.stringify(result)}`)
  }
  async function showToast() {
    await read("boxes[0].querySelector('button').click()")
    await wait("document.querySelector('.nola-toast:not([data-ending-style]) .nola-toast-title')")
    await sleep(550)
    const style = await read(`(() => {
      const toast = document.querySelector('.nola-toast:not([data-ending-style])');
      return {title:getComputedStyle(toast.querySelector('.nola-toast-title')).fontSize,
        description:getComputedStyle(toast.querySelector('.nola-toast-description')).fontSize,
        radius:getComputedStyle(toast).borderRadius};
    })()`)
    assert.deepEqual(style, {title:'14px',description:'12px',radius:'12px'})
  }
  try {
    await fs.mkdir(output, { recursive: true })
    const articles = { voice: 1, actions: 1, states: 1, localization: 0 }
    for (const [article, count] of Object.entries(articles)) {
      const md = await fs.readFile(path.resolve(__dirname, `../design-system/writing/${article}.md`), 'utf8')
      assert.ok(md.length > 600 && !/^(来源|参考|组件参考)[：:]/m.test(md), `${article}: incomplete article or reference footer`)
      console.log(`Loading ${article}`)
      await command('Page.navigate', { url: new URL(`/vis/writing/${article}`, origin).href })
      console.log(`Rendering ${article}`)
      await wait(`document.querySelector('.vp-doc h1') && boxes.length === ${count} && boxes.every(box => box.querySelector('[data-writing-scene]'))`)
      await read(`document.querySelector('.cm__btn[data-role="necessary"]')?.click()`)
      await geometry(article, 'light')
      assert.equal(await read("document.querySelectorAll('.vp-doc h1').length"), 1)
      const tokens = await read(`boxes.map(box => {
        const root = box.querySelector('.foundation-demo');
        const style = getComputedStyle(root);
        return {font:style.fontSize, primary:style.getPropertyValue('--primary').trim(), inert:root.inert};
      })`)
      for (const token of tokens) assert.deepEqual(token, { font: '14px', primary: '#1d4ed8', inert: article !== 'states' })
      const controls = await read(`boxes.flatMap(box => [...box.querySelectorAll('.button,.input')].map(control => ({height:control.getBoundingClientRect().height,font:getComputedStyle(control).fontSize})))`)
      for (const control of controls) assert.ok(Math.abs(control.height - 36) < 1 && control.font === '14px', `${article}: control ${JSON.stringify(control)}`)
      if (article === 'actions') {
        const footer = await read(`(() => {
          const footer = document.querySelector('.writing-dialog [data-slot=dialog-footer]');
          const buttons = [...footer.querySelectorAll('button')].map(button => button.getBoundingClientRect());
          return {padding: getComputedStyle(footer).paddingTop, gap: buttons[1].left-buttons[0].right,
            belowLine:buttons[0].top-footer.getBoundingClientRect().top};
        })()`)
        assert.ok(footer.padding === '16px' && footer.belowLine >= 16 && Math.abs(footer.gap-8) < 1, `dialog footer spacing: ${JSON.stringify(footer)}`)
      }
      if (article === 'states') await showToast()
      await screenshot(`${article}-light`, true)
      if (count) {
        await read("boxes[0].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot(`${article}-example`)
        await read("boxes[0].closest('.vitepress-demo-plugin__container').querySelector('.vitepress-demo-plugin-description__handle-btn svg').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        await wait("document.querySelector('.vitepress-demo-plugin-source').getBoundingClientRect().height > 30")
        await read("boxes[0].closest('.vitepress-demo-plugin__container').querySelector('.vitepress-demo-plugin-description__handle-btn svg').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
      }
      await read("document.documentElement.classList.add('dark')")
      await geometry(article, 'dark')
      if (article === 'states') await showToast()
      await screenshot(`${article}-dark`, true)
      if (article === 'states') await screenshot('states-dark-example')
      if (count) assert.equal(await read("getComputedStyle(boxes[0].querySelector('.foundation-demo')).getPropertyValue('--primary').trim()"), '#60a5fa')
      await read("document.documentElement.classList.remove('dark')")
      await viewport(390, 844)
      await sleep(150)
      await geometry(article, 'narrow')
      if (article === 'states') await showToast()
      await screenshot(`${article}-narrow`, true)
      if (article === 'states') {
        await read("boxes[0].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('states-narrow-example')
      }
      if (article === 'actions') {
        await read("document.querySelector('.writing-action-entry button').textContent = 'Export translated subtitles'")
        await geometry(article, 'long English label')
        await screenshot('actions-long-label', true)
        await read("document.querySelector('.writing-action-entry button').textContent = '翻訳された字幕を書き出す'")
        await geometry(article, 'long Japanese label')
        await read("document.querySelector('.writing-action-entry button').textContent = '导出字幕'")
      }
      // Match the CSS viewport and physical pixel scale of desktop 200% zoom.
      await viewport(720, 500, 2)
      await sleep(150)
      await geometry(article, '200% zoom')
      await viewport(1440, 1000)
      console.log(`${article}: copy, source, light/dark, narrow and zoom checks passed`)
    }
    assert.deepEqual(errors, [], 'browser console errors')
    console.log(`Passed four writing articles, two static examples and a real Toast example. Hydration warnings: ${hydrationWarnings.length}`)
  } catch (error) {
    await screenshot('failure')
    throw error
  } finally {
    socket.close()
    browser.kill()
  }
}

check().catch(error => { console.error(error); process.exitCode = 1 })
