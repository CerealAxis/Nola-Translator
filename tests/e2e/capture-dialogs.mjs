import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow } from 'electron'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { build } from 'vite'

const root = process.cwd()
const output = resolve(root, 'artifacts/dialog-audit')
const renderer = resolve(output, 'renderer')
const pause = ms => new Promise(done => setTimeout(done, ms))
const cases = ['standard', 'alert', 'export', 'model', 'model-config', 'model-source', 'onboarding', 'onboarding-step', 'completion', 'overlay', 'toast']
const workbenchCases = ['toast', 'dialog', 'image', 'mermaid']
app.disableHardwareAcceleration()

async function run() {
  await mkdir(output, { recursive: true })
  await build({
    configFile: false,
    root: resolve(root, 'tests/e2e/fixtures'),
    base: './',
    plugins: [react(), tailwind()],
    resolve: { alias: { '@': resolve(root, 'src/renderer') } },
    build: { rollupOptions: { input: {
      dialogGallery: resolve(root, 'tests/e2e/fixtures/dialog-gallery.html'),
      workbenchToast: resolve(root, 'tests/e2e/fixtures/workbench-toast.html'),
    } }, outDir: renderer, emptyOutDir: true, minify: false },
  })

  const metrics = []
  const window = new BrowserWindow({ width: 1180, height: 860, show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  window.webContents.on('console-message', event => { if (event.level >= 2) console.error(event.message) })
  for (const theme of ['light', 'dark']) {
    for (const kind of cases) {
      await window.loadURL(`${pathToFileURL(resolve(renderer, 'dialog-gallery.html')).href}?case=${kind}&theme=${theme}`)
      await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
      if (kind === 'toast') window.showInactive()
      const selector = kind === 'toast' ? '.nola-toast' : kind === 'overlay' ? '.dialog-gallery__overlay' : kind === 'onboarding-step' ? '.onboarding-tour__card' : '[data-slot="dialog-content"]'
      for (let attempt = 0; attempt < 100; attempt++) {
        const visible = await window.webContents.executeJavaScript(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); return !!element && element.getBoundingClientRect().width > 0; })()`)
        if (visible) break
        if (attempt === 99) {
          const page = await window.webContents.executeJavaScript(`({ url: location.href, body: document.body.innerText.slice(0, 500), popup: document.querySelector(${JSON.stringify(selector)})?.outerHTML })`)
          throw new Error(`Popup did not render: ${theme}/${kind} ${JSON.stringify(page)}`)
        }
        await pause(50)
      }
      await pause(kind === 'toast' ? 900 : 250)
      const state = await window.webContents.executeJavaScript(`(() => {
        const selector = ${JSON.stringify(selector)};
        const popup = document.querySelector(selector);
        const rect = popup.getBoundingClientRect();
        const title = popup.querySelector('[data-slot="dialog-title"], [data-slot="card-title"], .nola-confirm-title, .nola-toast-title');
        const description = popup.querySelector('[data-slot="dialog-description"], [data-slot="card-description"], .nola-confirm-text, .nola-toast-description');
        const buttons = [...popup.querySelectorAll('.button')];
        const footer = popup.querySelector('.nola-dialog-footer');
        const close = popup.querySelector('.nola-dialog-close');
        return {
          card: popup.classList.contains('card'),
          width: Math.round(rect.width), height: Math.round(rect.height),
          top: Math.round(rect.top), right: Math.round(rect.right), opacity: getComputedStyle(popup).opacity,
          state: popup.dataset.state ?? null, starting: popup.hasAttribute('data-starting-style'), ending: popup.hasAttribute('data-ending-style'),
          radius: getComputedStyle(popup).borderRadius,
          background: getComputedStyle(popup).backgroundColor,
          titleSize: title ? getComputedStyle(title).fontSize : null,
          bodySize: description ? getComputedStyle(description).fontSize : null,
          footerBottomGap: footer ? Math.round((rect.bottom - footer.getBoundingClientRect().bottom) * 10) / 10 : null,
          spacing: popup.classList.contains('nola-dialog-content') ? getComputedStyle(popup).rowGap : null,
          closeBackground: close ? getComputedStyle(close).backgroundColor : null,
          languageChipHeights: [...popup.querySelectorAll('.model-language-chip')].map(chip => Math.round(chip.getBoundingClientRect().height)),
          buttonHeights: buttons.map(button => Math.round(button.getBoundingClientRect().height)),
          primaryBackgrounds: buttons.filter(button => button.dataset.variant === 'default').map(button => getComputedStyle(button).backgroundColor),
        };
      })()`)
      assert.equal(state.card, true, `${kind} popup root must use Card`)
      if (state.spacing) assert.equal(state.spacing, '16px', `${theme}/${kind} Card spacing differs`)
      assert.ok(state.buttonHeights.every(height => height === 40), `${theme}/${kind} button heights differ from 40px: ${state.buttonHeights}`)
      assert.ok(state.primaryBackgrounds.every(color => color !== 'rgba(0, 0, 0, 0)'), `${theme}/${kind} primary button styling is missing`)
      if (state.footerBottomGap !== null) assert.ok(state.footerBottomGap <= 1.5, `${theme}/${kind} has a blank strip below its CardFooter: ${JSON.stringify(state)}`)
      if (state.closeBackground !== null) assert.equal(state.closeBackground, 'rgba(0, 0, 0, 0)', `${theme}/${kind} close button background is not transparent`)
      if (state.languageChipHeights.length) assert.ok(state.languageChipHeights.every(height => height <= 28), `${theme}/${kind} language chips are oversized: ${state.languageChipHeights}`)
      if (state.titleSize) assert.equal(state.titleSize, '15px', `${theme}/${kind} title size differs`)
      if (state.bodySize) assert.equal(state.bodySize, '14px', `${theme}/${kind} body size differs`)
      const filename = `${theme}-${kind}.png`
      await writeFile(resolve(output, filename), (await window.webContents.capturePage()).toPNG())
      metrics.push({ theme, kind, ...state, screenshot: filename })
      if (kind === 'model-config') {
        await window.webContents.executeJavaScript(`document.querySelector('.model-language-toggle').click()`)
        for (let attempt = 0; attempt < 100; attempt++) {
          const count = await window.webContents.executeJavaScript(`document.querySelectorAll('.model-language-popup .model-language-option').length`)
          if (count > 0) break
          if (attempt === 99) throw new Error(`Language options did not render: ${theme}`)
          await pause(50)
        }
        const labels = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-language-popup .model-language-option'), item => item.textContent.trim())`)
        const autoLabels = ['自动检测', 'Auto-detect', 'Auto detect', '自動偵測', '自動検出', '자동 감지']
        assert.equal(labels.filter(label => autoLabels.includes(label)).length, 1, `${theme} model configuration must list auto detection once`)
      }
    }
  }
  for (const theme of ['light', 'dark']) {
    for (const kind of workbenchCases) {
      const url = `${pathToFileURL(resolve(renderer, 'workbench-toast.html')).href}?case=${kind}&theme=${theme}`
      console.log(`Loading workbench ${kind} ${theme}`)
      await Promise.race([
        window.loadURL(url),
        pause(15_000).then(() => { throw new Error(`Timed out loading ${url}`) }),
      ])
      await window.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
      window.showInactive()
      const selector = kind === 'toast' ? '.nola-toast' : kind === 'dialog' ? '[data-slot="dialog-content"]' : kind === 'image' ? '.aui-image-zoom-card' : '.aui-mermaid-zoom-overlay'
      if (kind === 'image' || kind === 'mermaid') {
        const trigger = kind === 'image' ? '[data-slot="image-zoom-trigger"]' : '[data-slot="mermaid-zoom-trigger"]'
        for (let attempt = 0; attempt < 100; attempt++) {
          const visible = await window.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(trigger)})?.getBoundingClientRect().width`)
          if (visible) break
          if (attempt === 99) throw new Error(`Workbench popup trigger did not render: ${theme}/${kind}`)
          await pause(50)
        }
        await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(trigger)}).click()`)
      }
      for (let attempt = 0; attempt < 100; attempt++) {
        const visible = await window.webContents.executeJavaScript(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); return !!element && element.getBoundingClientRect().width > 0; })()`)
        if (visible) break
        if (attempt === 99) {
          const page = await window.webContents.executeJavaScript(`({ url: location.href, body: document.body.innerText.slice(0, 500) })`)
          throw new Error(`Workbench popup did not render: ${theme}/${kind} ${JSON.stringify(page)}`)
        }
        await pause(50)
      }
      await pause(kind === 'toast' ? 900 : 250)
      const state = await window.webContents.executeJavaScript(`(() => {
        const popup = document.querySelector(${JSON.stringify(selector)});
        const rect = popup.getBoundingClientRect();
        const title = popup.querySelector('[data-slot="dialog-title"], .nola-toast-title');
        const description = popup.querySelector('[data-slot="dialog-description"], .nola-toast-description');
        const buttons = [...popup.querySelectorAll('.button')];
        const footer = popup.querySelector('.nola-dialog-footer');
        const close = popup.querySelector('.nola-dialog-close');
        return {
          card: popup.classList.contains('card'),
          width: Math.round(rect.width), height: Math.round(rect.height),
          radius: getComputedStyle(popup).borderRadius,
          background: getComputedStyle(popup).backgroundColor,
          titleSize: title ? getComputedStyle(title).fontSize : null,
          bodySize: description ? getComputedStyle(description).fontSize : null,
          footerBottomGap: footer ? Math.round((rect.bottom - footer.getBoundingClientRect().bottom) * 10) / 10 : null,
          closeBackground: close ? getComputedStyle(close).backgroundColor : null,
          buttonHeights: buttons.map(button => Math.round(button.getBoundingClientRect().height)),
        };
      })()`)
      assert.equal(state.card, true, `workbench/${kind} popup root must use Card`)
      assert.ok(state.buttonHeights.every(height => height === 40), `workbench/${kind} button heights differ from 40px: ${state.buttonHeights}`)
      if (state.footerBottomGap !== null) assert.ok(state.footerBottomGap <= 1.5, `workbench/${kind} has a blank strip below its CardFooter: ${state.footerBottomGap}px`)
      if (state.closeBackground !== null) assert.equal(state.closeBackground, 'rgba(0, 0, 0, 0)', `workbench/${kind} close button background is not transparent`)
      if (state.titleSize) assert.equal(state.titleSize, '15px', `workbench/${kind} title size differs`)
      if (state.bodySize) assert.equal(state.bodySize, '14px', `workbench/${kind} body size differs`)
      const filename = `${theme}-workbench-${kind}.png`
      await writeFile(resolve(output, filename), (await window.webContents.capturePage()).toPNG())
      metrics.push({ theme, kind: `workbench-${kind}`, ...state, screenshot: filename })
    }
  }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify({
    reference: 'https://ui.shadcn.com/docs/components/base/card.md',
    cases: [...cases, ...workbenchCases.map(kind => `workbench-${kind}`)],
    metrics,
  }, null, 2)}\n`)
  console.log(`Captured ${metrics.length} Card popup states in ${output}`)
  app.quit()
}

void app.whenReady().then(run).catch(error => {
  console.error(error)
  app.exit(1)
})
