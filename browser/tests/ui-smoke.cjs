const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

// Run after build:browser. A disposable profile loads the real unpacked Chromium extension.
async function main() {
  const quick = process.argv.includes('--quick')
  const root = path.resolve(__dirname, '../..')
  const output = path.join(root, 'artifacts/browser-ui')
  await fs.mkdir(output, { recursive: true })
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-ui-smoke-'))
  const extension = path.join(root, 'browser/extension/dist')
  const identity = await fs.readFile(path.join(root, 'src/shared/browser.ts'), 'utf8')
  const extensionId = identity.match(/BROWSER_EXTENSION_ID = '([^']+)'/)[1]
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, acceptDownloads: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  })
  const errors = []; const colors = []; let screenshots = 0
  try {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.locator('aside nav button').last().waitFor()
    const locales = ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja']
    for (const locale of locales) for (const theme of ['light', 'dark']) for (const width of [1920, 1280, 390]) {
      if (quick && !['en:light:1920', 'zh-CN:light:1280', 'zh-CN:dark:390'].includes(`${locale}:${theme}:${width}`)) continue
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(values => chrome.storage.local.set(values), { uiLanguage: locale, theme })
      await page.waitForFunction(expected => document.documentElement.lang === expected.locale && document.documentElement.dataset.theme === expected.theme, { locale, theme })
      await page.locator('aside nav button').nth(0).click()
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => undefined))) })
      const computed = await page.evaluate(() => {
        const input = document.querySelector('[data-slot="input-group"]') || document.querySelector('input'); const selected = document.querySelector('nav [aria-current="page"]')
        const color = selector => { const value = getComputedStyle(selector).backgroundColor; const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d'); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return { css: value, rgba: [...ctx.getImageData(0, 0, 1, 1).data] } }
        return { input: color(input), selected: color(selected), font: getComputedStyle(document.body).fontFamily, headingFont: getComputedStyle(document.querySelector('.nola-options-header strong')).fontFamily }
      })
      colors.push({ locale, theme, width, ...computed })
      console.log({ locale, theme, ...computed })
      assert.ok(computed.font.includes('sans-serif') && computed.headingFont.includes('sans-serif'), 'Extension typography must use the independent system sans stack')
      if (theme === 'light') { assert.ok(computed.input.rgba[0] > 230, 'Light input must be near white'); assert.ok(computed.selected.rgba[0] > 200 && computed.selected.rgba[2] > computed.selected.rgba[0], 'Selected navigation must use the soft Nola surface') }
      else assert.ok(computed.input.rgba[0] < 100, 'Dark input must use the dark Nola surface')
      await page.screenshot({ path: path.join(output, `settings-${locale}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' }); screenshots++
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      assert.equal(overflow, false, `Horizontal overflow: ${locale} ${theme} ${width}`)
      assert.equal(await page.locator('aside nav button').count(), 13)
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en', theme: 'light' }))
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    // A 1280px window at 200% browser zoom has a 640px CSS viewport.
    await page.setViewportSize({ width: 640, height: 450 })
    await page.screenshot({ path: path.join(output, 'settings-en-light-zoom-200.png'), fullPage: true, animations: 'disabled' }); screenshots++
    assert.ok(await page.evaluate(() => document.body.getBoundingClientRect().right <= innerWidth + 1), 'Horizontal overflow at 200% zoom')
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const index of Array.from({ length: 13 }, (_, i) => i)) {
      await page.locator('aside nav button').nth(index).click()
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => undefined))) })
      await page.screenshot({ path: path.join(output, `section-${index}.png`), fullPage: true, animations: 'disabled' }); screenshots++
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Section overflow: ${index}`)
    }
    await page.locator('aside nav button').nth(1).click()
    await page.getByRole('button', { name: 'Google Translate', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved provider draft')
    await page.evaluate(() => chrome.storage.local.set({ contextAware: true, providerRevision: 'ui-test-revision' }))
    await page.waitForFunction(async () => (await chrome.storage.local.get('contextAware')).contextAware === true)
    assert.equal(await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue(), 'Unsaved provider draft')
    await page.locator('aside nav button').nth(9).click()
    await page.getByRole('combobox', { name: 'Button side' }).click()
    await page.getByRole('option', { name: 'Left', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.nola-demo-floating')?.getAttribute('data-side') === 'left')
    assert.equal((await page.evaluate(() => chrome.storage.local.get('floatingSide'))).floatingSide, 'left')
    const position = page.getByRole('slider', { name: 'Vertical position' })
    await position.focus(); await page.keyboard.press('Home')
    await page.waitForFunction(async () => (await chrome.storage.local.get('floatingPosition')).floatingPosition === 0)
    await page.getByRole('switch', { name: 'Keep button visible' }).click()
    await page.waitForFunction(async () => (await chrome.storage.local.get('floatingLocked')).floatingLocked === true)
    await page.getByRole('textbox', { name: 'Hidden on these websites' }).fill('example.com')
    await page.locator('.nola-demo-dock').click()
    await page.locator('.nola-illustration-translation').waitFor()
    await page.reload()
    await page.getByRole('switch', { name: 'Keep button visible' }).waitFor()
    assert.equal(await page.getByRole('switch', { name: 'Keep button visible' }).getAttribute('aria-checked'), 'true')
    await page.locator('aside nav button').nth(5).click()
    await page.getByRole('switch', { name: 'Copy translation' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.nola-illustration-toolbar > svg').length === 1)
    await page.getByRole('slider', { name: 'Opacity' }).focus(); await page.keyboard.press('Home')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.nola-illustration-toolbar')).opacity === '0.2')
    await page.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN', theme: 'light', floatingSide: 'right', floatingPosition: 0.65, floatingLocked: false, floatingDisabledSites: [], selectionCopy: true, selectionOpacity: 0.95 }))
    await page.waitForFunction(() => document.documentElement.lang === 'zh-CN')
    for (const index of [1, 4, 5, 9, 11, 12]) {
      await page.locator('aside nav button').nth(index).click()
      await page.screenshot({ path: path.join(output, `review-zh-CN-section-${index}.png`), fullPage: true, animations: 'disabled' }); screenshots++
    }
    await page.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en', theme: 'light' }))
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    await page.locator('aside nav button').nth(11).click()
    await page.getByRole('button', { name: 'New glossary library' }).click()
    await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('Test glossary')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Add term' }).click()
    await page.getByRole('textbox', { name: 'Source', exact: true }).fill('Example')
    await page.getByRole('textbox', { name: 'Translation', exact: true }).fill('示例')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await page.getByRole('cell', { name: 'Example', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('cell', { name: 'Example', exact: true }).waitFor()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    assert.equal(download.suggestedFilename(), 'Test glossary.csv')
    await download.saveAs(path.join(output, 'terminology.csv'))
    assert.match(await fs.readFile(path.join(output, 'terminology.csv'), 'utf8'), /Example.*示例/)
    await page.getByRole('textbox', { name: 'Search settings' }).fill('backup')
    const backupPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export configuration' }).click()
    await (await backupPromise).saveAs(path.join(output, 'configuration.json'))
    const backup = JSON.parse(await fs.readFile(path.join(output, 'configuration.json'), 'utf8'))
    assert.equal(backup.version, 2)
    assert.ok(backup.providers.every(provider => provider.apiKey === ''))
    assert.deepEqual(errors, [])
    const result = { browser: 'Edge (real unpacked extension)', profile, screenshots, quick, colors, locales, themes: ['light', 'dark'], widths: [1920, 1280, 390], assertions: ['provider draft preserved across unrelated settings', 'floating side, slider, lock and website rules persist', 'interactive translation preview', 'toolbar visibility and opacity update', 'no horizontal overflow', '13 navigable sections', 'settings search', 'terminology persistence', 'CSV download', 'configuration export without secrets', 'no page exceptions'], limitations: ['Options-page checks only. Real toolbar popup is verified by toolbar-popup-smoke.cjs.', 'No cloud request or live audio was started.'] }
    await fs.writeFile(path.join(output, quick ? 'result-quick.json' : 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(error); throw error } finally { await context.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
