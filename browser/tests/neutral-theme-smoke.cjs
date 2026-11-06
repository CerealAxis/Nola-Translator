const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

function appearance(element) {
  const style = getComputedStyle(element)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  const pixel = color => {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data]
  }
  return {
    background: pixel(style.backgroundColor), foreground: pixel(style.color),
    primary: pixel(style.getPropertyValue('--primary').trim()),
    palette: Object.fromEntries(['--border', '--separator', '--field-background', '--accent', '--overlay', '--nola-ui-border'].map(key => [key, pixel(style.getPropertyValue(key).trim())])),
    scrollbar: style.scrollbarWidth,
    webkitScrollbar: getComputedStyle(element, '::-webkit-scrollbar').display,
  }
}

function neutral(value) {
  for (const [key, color] of Object.entries({ background: value.background, foreground: value.foreground, primary: value.primary, ...value.palette })) {
    const [r, g, b] = color
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, `${key} must be neutral: ${color}`)
  }
  assert.equal(value.scrollbar, 'none')
  assert.equal(value.webkitScrollbar, 'none')
}

function geometry(element) {
  const style = getComputedStyle(element)
  return Object.fromEntries(['height', 'fontFamily', 'fontSize', 'fontWeight', 'borderRadius', 'paddingLeft', 'paddingRight'].map(key => [key, style[key]]))
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const output = path.join(root, 'artifacts/browser-neutral')
  await fs.mkdir(output, { recursive: true })
  const extension = path.join(root, 'browser/extension/dist')
  const id = (await fs.readFile(path.join(root, 'src/shared/browser.ts'), 'utf8')).match(/BROWSER_EXTENSION_ID = '([^']+)'/)[1]
  const server = http.createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><html><body style="background:rgb(210,230,250);color:rgb(10,30,50)"><h1>Host page stays unchanged</h1><video width="640" height="360" controls></video></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const context = await chromium.launchPersistentContext(await fs.mkdtemp(path.join(os.tmpdir(), 'nola-neutral-')), {
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  const errors = []; const results = []
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`chrome-extension://${id}/options.html#general`)
    await page.locator('.nola-settings-sidebar nav button').last().waitFor()
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => chrome.storage.local.set({ theme, uiLanguage: 'en', floatingLocked: true }), theme)
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && document.documentElement.lang === 'en', theme)
      for (const width of [1920, 1280, 390]) {
        await page.setViewportSize({ width, height: 720 })
        neutral(await page.locator('body').evaluate(appearance))
        neutral(await page.locator('.nola-settings-sidebar').evaluate(appearance))
        neutral(await page.locator('nav [aria-current="page"]').evaluate(appearance))
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await page.screenshot({ path: path.join(output, `settings-${theme}-${width}.png`) })
        const shortChoice = await page.getByRole('combobox', { name: 'Interface language', exact: true }).evaluate(geometry)
        const searchableChoice = await page.getByRole('combobox', { name: 'Source language', exact: true }).evaluate(geometry)
        assert.deepEqual(searchableChoice, shortChoice, 'Searchable and regular fields share the same font, height, radius and padding')
      }
      await page.setViewportSize({ width: 1280, height: 600 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.mouse.move(950, 400); await page.mouse.wheel(0, 400)
      await page.waitForFunction(() => window.scrollY > 0)
      await page.locator('.nola-settings-sidebar').evaluate(element => { element.scrollTop = 0 })
      await page.mouse.move(100, 400); await page.mouse.wheel(0, 400)
      await page.waitForFunction(() => document.querySelector('.nola-settings-sidebar').scrollTop > 0)
      await page.getByRole('combobox', { name: 'Source language', exact: true }).click()
      const list = page.locator('.nola-choice-search-list [role="listbox"]')
      await list.waitFor()
      neutral(await list.evaluate(appearance))
      await list.hover(); await page.mouse.wheel(0, 350)
      await page.waitForFunction(() => document.querySelector('.nola-choice-search-list [role="listbox"]').scrollTop > 0)
      await page.getByRole('combobox', { name: 'Search options' }).focus()
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('End')
      assert.ok(await page.getByRole('option').count() > 7)
      assert.equal(await page.getByRole('option').last().getAttribute('data-highlighted'), '')
      await page.screenshot({ path: path.join(output, `dropdown-${theme}.png`) })
      await page.keyboard.press('Escape')
      await page.locator('.nola-settings-sidebar nav button').nth(4).click()
      const track = await page.locator('.slider__track').first().evaluate(geometry)
      const thumb = await page.locator('.slider__thumb').first().evaluate(geometry)
      const colorField = await page.getByRole('button', { name: 'Subtitle background color', exact: true }).evaluate(geometry)
      const popup = await context.newPage()
      popup.on('pageerror', error => errors.push(error.message))
      for (const name of ['popup', 'sidepanel']) {
        await popup.setViewportSize({ width: 376, height: 650 })
        await popup.goto(`chrome-extension://${id}/${name}.html`)
        await popup.locator('.nola-popup-translate').waitFor()
        neutral(await popup.locator('.nola-popup').evaluate(appearance))
        await popup.screenshot({ path: path.join(output, `${name}-${theme}.png`) })
      }
      await popup.close()
      const host = await context.newPage()
      host.on('pageerror', error => errors.push(error.message))
      await host.goto(`http://127.0.0.1:${server.address().port}/`)
      await host.evaluate(() => { document.documentElement.style.fontSize = '10px' })
      const floating = host.locator('[data-nola-extension="floating"] .nola-floating-trigger')
      await floating.waitFor()
      neutral(await floating.evaluate(appearance))
      assert.equal(await host.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(210, 230, 250)')
      assert.notEqual(await host.locator('body').evaluate(element => getComputedStyle(element).scrollbarWidth), 'none')
      const trigger = host.locator('[data-nola-extension="trigger"] button')
      await trigger.click()
      neutral(await host.locator('[data-nola-extension="panel"] .nola-panel').evaluate(appearance))
      await host.screenshot({ path: path.join(output, `content-${theme}.png`) })
      const panel = host.locator('[data-nola-extension="panel"]')
      assert.equal((await panel.getByRole('button', { name: 'Subtitle settings', exact: true }).evaluate(geometry)).fontSize, '13px', 'Compact buttons keep their caption size on 10px-rem websites')
      await panel.getByRole('button', { name: 'Subtitle settings', exact: true }).click()
      await panel.getByRole('button', { name: 'Subtitle style', exact: true }).click()
      assert.deepEqual(await panel.locator('.slider__track').first().evaluate(geometry), track, 'Settings and player sliders use the same track')
      assert.deepEqual(await panel.locator('.slider__thumb').first().evaluate(geometry), thumb, 'Settings and player sliders use the same thumb')
      assert.deepEqual(await panel.getByRole('button', { name: 'Subtitle background color', exact: true }).evaluate(geometry), colorField, 'Color controls keep their typography and spacing on websites with 10px rem')
      await panel.getByRole('button', { name: 'Subtitle background color', exact: true }).click()
      const hex = panel.getByRole('textbox', { name: 'Subtitle background color · HEX', exact: true })
      await hex.waitFor()
      assert.equal((await hex.evaluate(geometry)).fontSize, '14px')
      assert.ok((await panel.locator('.nola-color-picker__area').boundingBox()).height >= 128, 'The color palette stylesheet must load inside the shadow root')
      await hex.fill('#112233'); await hex.blur()
      await page.waitForFunction(async () => (await chrome.storage.local.get('subtitleBackground')).subtitleBackground === '#112233')
      await host.screenshot({ path: path.join(output, `player-style-${theme}.png`) })
      await host.close()
      await page.locator('.nola-settings-sidebar nav button').first().click()
      results.push({ theme, widths: [1920, 1280, 390], documentScroll: true, sidebarScroll: true, dropdownScroll: true, popup: true, sidepanel: true, shadowRoots: true, hostPageUnchanged: true })
    }
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ results, errors }, null, 2))
    console.log(JSON.stringify({ results, errors }))
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
