const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { existsSync, readFileSync } = require('node:fs')
const { mkdir, mkdtemp, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const catalog = require('../.vitepress/component-catalog.json')
const { componentCatalog } = require('../.vitepress/component-catalog.ts')

const origin = new URL(process.env.CATALOG_URL ?? process.argv[2] ?? 'http://localhost:5173/')
const output = join(__dirname, '../public/component-previews')
const preview = '.vitepress-demo-plugin-preview'
const width = 1440
const height = 1080
const deviceScaleFactor = 3
const nolaTheme = join(__dirname, '../../src/renderer/theme')
const pageColors = Object.fromEntries([['light', 'surface'], ['dark', 'background']].map(([mode, token]) => {
  const theme = readFileSync(join(nolaTheme, `nola-${mode}.css`), 'utf8')
  const color = theme.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]
  assert.ok(color, `Missing ${mode} documentation background`)
  return [mode, color]
}))
const viewportWidth = 1280
const viewportHeight = 820
const jobs = Object.entries(componentCatalog).flatMap(([library, articles]) => {
  const overrides = new Map(catalog[library].map(entry => [entry.path, entry]))
  return articles.map(article => ({ library, ...article, ...overrides.get(article.path) }))
})
const selection = process.env.CATALOG_SELECTION ?? process.argv[3]
const shard = selection?.match(/^(\d+)\/(\d+)$/)
const selected = jobs.filter(({ path, library }, index) => {
  if (shard) return index % Number(shard[2]) === Number(shard[1])
  return !selection || selection.split(',').some(value => value === library || value === path)
})

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.disableHardwareAcceleration()

async function waitFor(read, label, timeout = 20_000) {
  const deadline = Date.now() + timeout
  do {
    const result = await read()
    if (result) return result
    await delay(60)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  app.setPath('userData', await mkdtemp(join(tmpdir(), 'nola-component-previews-')))
  await app.whenReady()
  const win = new BrowserWindow({
    show: false,
    width: viewportWidth,
    height: viewportHeight,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  })
  win.setContentSize(viewportWidth * deviceScaleFactor, viewportHeight * deviceScaleFactor)
  const contents = win.webContents
  contents.debugger.attach('1.3')
  const js = async expression => {
    const { result, exceptionDetails } = await contents.debugger.sendCommand(
      'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true },
    )
    if (exceptionDetails) throw new Error(result.description ?? exceptionDetails.text)
    return result.value
  }
  const root = `document.querySelector(${JSON.stringify(preview)})`
  let captureStyle

  async function openPreview(route) {
    if (contents.getURL().startsWith(origin.href) && contents.getURL() !== route.href) {
      try {
        if (captureStyle) await contents.removeInsertedCSS(captureStyle)
        captureStyle = undefined
        await js(`(() => {
          document.querySelectorAll('[data-catalog-backdrop]').forEach(element => element.removeAttribute('data-catalog-backdrop'));
          document.documentElement.style.removeProperty('--vp-c-bg');
          window.previousCatalogPreview = ${root};
          const link = document.createElement('a');
          link.href = ${JSON.stringify(route.href)};
          document.body.append(link);
          link.click();
          link.remove();
        })()`)
        await waitFor(() => js(`location.pathname === ${JSON.stringify(route.pathname)}
          && ${root} !== window.previousCatalogPreview && Boolean(${root}?.firstElementChild?.firstElementChild)`), 'navigation', 5000)
        return
      } catch {
        // A full load also recovers from a Vite development reload.
      }
    }
    const ready = once(contents, 'dom-ready', { signal: AbortSignal.timeout(25_000) })
    await Promise.race([ready, win.loadURL(route.href)])
    captureStyle = undefined
    contents.setZoomFactor(deviceScaleFactor)
  }
  assert.ok(selected.length, 'No matching components to capture')
  console.log(`Capturing missing previews for ${selected.length} components`)
  const failures = []
  try {
    for (const entry of selected) {
      const files = ['light', 'dark'].map(mode => ({
        mode,
        file: join(output, entry.library, `${entry.slug}-${mode}.webp`),
      })).filter(({ file }) => process.env.CATALOG_OVERWRITE || !existsSync(file))
      if (!files.length) continue
      let loaded = false
      for (const { mode, file } of files) {
        try {
          nativeTheme.themeSource = mode
          const route = new URL(`vis/components/${entry.path}`, origin)
          if (!loaded) await openPreview(route)
          await waitFor(() => js(`Boolean(${root}?.firstElementChild?.firstElementChild)`), entry.path)
          await waitFor(() => js(`devicePixelRatio === ${deviceScaleFactor} && innerWidth === ${viewportWidth}`), 'capture viewport')
          await waitFor(() => js(`document.documentElement.classList.contains('dark') === ${mode === 'dark'}`), `${mode} theme`)
          assert.ok(await js(`getComputedStyle(${root}.firstElementChild).getPropertyValue('--radius').trim()`), 'Preview theme is missing')
          const background = pageColors[mode]
          await js(`document.documentElement.style.setProperty('--vp-c-bg', ${JSON.stringify(background)}, 'important')`)

          if (!(await contents.session.cookies.get({ name: 'nola_cookie_consent', url: route.href })).length) {
            const necessary = "[...document.querySelectorAll('#cc-main button')].find(button => button.textContent.trim() === '仅必要')"
            await waitFor(() => js(`Boolean(${necessary})`), 'cookie preferences')
            await js(`(${necessary}).click()`)
          }

          if (!loaded) {
            captureStyle = await contents.insertCSS(`
              html, body, [data-catalog-backdrop] { background: var(--vp-c-bg) !important; }
              #cc-main, [data-slot$="-overlay"] { display: none !important; }
              .VPNav, .VPSidebar, .VPLocalNav, .VPDocAside,
              .vitepress-demo-plugin-source, .vitepress-demo-plugin-description {
                visibility: hidden !important;
              }
              * { animation: none !important; transition: none !important; }
              :is([class*="shadow-lg"], [class*="shadow-xl"], [class*="shadow-2xl"]) {
                --tw-shadow: 0 0 #0000 !important;
              }
              ${entry.portal ? '.Layout { visibility: hidden !important; }' : ''}
            `)
          }
          const action = entry.trigger ?? entry.contextmenu ?? entry.hover ?? entry.input
          if (action && !loaded) {
            const trigger = `${root}.querySelector(${JSON.stringify(action)})`
            await waitFor(() => js(`Boolean(${trigger}?.getClientRects().length)`), `${entry.path} trigger`)
            const point = await js(`(() => {
              const trigger = ${trigger};
              trigger.style.setProperty('visibility', 'visible', 'important');
              trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
              const rect = trigger.getBoundingClientRect();
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            })()`)
            if (entry.input) {
              await js(`${trigger}.focus()`)
              await contents.insertText(entry.text)
            } else {
              await contents.debugger.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mouseMoved' })
              if (!entry.hover) {
                const button = entry.contextmenu ? 'right' : 'left'
                await contents.debugger.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', button, clickCount: 1 })
                await contents.debugger.sendCommand('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', button, clickCount: 1 })
              }
            }
          }
          const stage = `${root}.firstElementChild`
          const target = entry.target
            ? `document.querySelector(${JSON.stringify(entry.target)})`
            : `(${stage}.querySelector('[data-assistant-preview]')?.firstElementChild ?? (${stage}.childElementCount === 1 ? ${stage}.firstElementChild : ${stage}))`
          const readyTarget = entry.ready ? `document.querySelector(${JSON.stringify(entry.ready)})` : target
          await waitFor(() => js(`Boolean(${readyTarget}?.getClientRects().length)`), `${entry.path} preview`)
          loaded = true
          const crop = await js(`(async () => {
            const target = ${target};
            const include = ${entry.include ? `document.querySelector(${JSON.stringify(entry.include)})` : 'null'};
            await document.fonts.ready;
            if (${Boolean(entry.portal)}) {
              ${root}.querySelector(${JSON.stringify(action ?? ':not(*)')})?.style.removeProperty('visibility');
              target.style.setProperty('visibility', 'visible', 'important');
              include?.style.setProperty('visibility', 'visible', 'important');
            }
            for (let parent = target.parentElement; parent; parent = parent.parentElement) {
              parent.setAttribute('data-catalog-backdrop', '');
            }
            if (!${Boolean(entry.portal)}) {
              ${root}.querySelector('[aria-label="重播演示"], [aria-label="暂停演示"]')?.style.setProperty('visibility', 'hidden');
              if (!${Boolean(entry.hover)}) target.scrollIntoView({ block: '${entry.frame === 'top' ? 'start' : 'center'}', behavior: 'instant' });
            }
            await Promise.race([
              Promise.allSettled([...target.querySelectorAll('img')].map(img => img.decode())),
              new Promise(resolve => setTimeout(resolve, 1200)),
            ]);
            await Promise.all(target.getAnimations({ subtree: true })
              .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
              .map(animation => animation.finished.catch(() => {})));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const rects = [target, include].filter(Boolean).map(element => element.getBoundingClientRect());
            const padding = ${entry.padding ?? 8};
            const x = Math.max(0, Math.floor(Math.min(...rects.map(rect => rect.left)) - padding));
            const y = Math.max(0, Math.floor(Math.min(...rects.map(rect => rect.top)) - padding), ${entry.frame === 'top' ? 64 : 0});
            const right = Math.min(innerWidth, Math.ceil(Math.max(...rects.map(rect => rect.right)) + padding));
            const bottom = Math.min(innerHeight, Math.ceil(Math.max(...rects.map(rect => rect.bottom)) + padding));
            return {
              x: x * devicePixelRatio, y: y * devicePixelRatio,
              width: (right - x) * devicePixelRatio, height: (bottom - y) * devicePixelRatio,
            };
          })()`)
          assert.ok(crop.width > 12 && crop.height > 12, `Empty preview for ${entry.path}`)
          await delay(entry.settle ?? (entry.portal ? 350 : 120))
          const snapshot = entry.portal ? (await contents.capturePage()).crop(crop) : await contents.capturePage(crop)
          const sourceSize = snapshot.getSize()
          assert.equal(sourceSize.width, crop.width, 'Preview must be captured at native resolution')
          assert.equal(sourceSize.height, crop.height, 'Preview must be captured at native resolution')
          const data = await js(`(async () => {
            const source = new Image();
            source.src = ${JSON.stringify(snapshot.toDataURL())};
            await source.decode();
            const canvas = document.createElement('canvas');
            canvas.width = ${width};
            canvas.height = ${height};
            const context = canvas.getContext('2d');
            context.fillStyle = ${JSON.stringify(background)};
            context.fillRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(1, (canvas.width - 96) / source.width, (canvas.height - 96) / source.height);
            const width = source.width * scale;
            const height = source.height * scale;
            context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
            return canvas.toDataURL('image/webp', 1).split(',')[1];
          })()`)
          await mkdir(join(output, entry.library), { recursive: true })
          await writeFile(file, Buffer.from(data, 'base64'))
          console.log(`${entry.path} ${mode}`)
        } catch (error) {
          loaded = false
          failures.push(`${entry.path} ${mode}: ${error.message}`)
          console.error(failures.at(-1))
        }
      }
    }
  } finally {
    win.destroy()
  }
  if (failures.length) throw new Error(`${failures.length} previews failed`)
}

main().then(() => app.exit(0)).catch(error => {
  console.error(error)
  app.exit(1)
})
