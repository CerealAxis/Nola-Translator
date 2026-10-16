const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const baseUrl = process.argv[2]
const readmeOnly = process.argv.includes('--readme')
const darkOnly = process.argv.includes('--dark')
const guideOnly = process.argv.includes('--guide')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setPath('userData', path.resolve(__dirname, '../media-src/.electron-cache'))
const root = path.resolve(__dirname, '../..')
const locales = readmeOnly || guideOnly ? ['zh-CN'] : ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']
const pages = guideOnly ? ['home', 'workspace', 'session-setup', 'session-check', 'models', 'download-source', 'compute-environment', 'compute-components', 'llm-configuration', 'audio', 'browser'] : readmeOnly
  ? ['home', 'overlay-scene', 'browser-scene', 'models', 'compute-environment', 'dark-mode', 'llm-configuration']
  : ['home', 'workspace', 'models', 'overlay-scene', 'browser-scene']
const routes = { home: '#/', workspace: '#/workspace', models: '#/models', 'overlay-scene': '#/', 'browser-scene': '#/', 'compute-environment': '#/settings/compute', 'dark-mode': '#/', 'llm-configuration': '#/settings/translation' }
const sourceComponents = {
  'session-setup': ['src/renderer/features/workspace/SessionSetupDialog.tsx', 'src/renderer/features/workspace/WorkspacePage.tsx'],
  'session-check': ['src/renderer/features/workspace/PreflightDialog.tsx', 'src/renderer/features/workspace/WorkspacePage.tsx'],
  'download-source': ['src/renderer/features/models/DownloadSourceDialog.tsx', 'src/renderer/features/models/ModelsPage.tsx'],
  'compute-components': ['src/renderer/features/settings/tabs/RuntimeComponents.tsx', 'src/renderer/features/settings/tabs/ComputeTab.tsx'],
  audio: ['src/renderer/features/settings/tabs/AudioTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  browser: ['src/renderer/features/settings/tabs/BrowserTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  'overlay-scene': ['src/renderer/features/overlay/OverlayRoot.tsx', 'src/renderer/features/overlay/CaptionTrack.tsx', 'docs/media-src/Scene.tsx'],
  'browser-scene': ['browser/extension/styles.css', 'browser/extension/captionPresentation.ts', 'docs/media-src/Scene.tsx'],
  'compute-environment': ['src/renderer/features/settings/tabs/ComputeTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  'dark-mode': ['src/renderer/features/home/HomePage.tsx', 'src/renderer/components/primitives/AppShell.tsx'],
  'llm-configuration': ['src/renderer/features/settings/tabs/TranslationTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  home: ['src/renderer/features/home/HomePage.tsx', 'src/renderer/features/home/RecentMeetings.tsx', 'src/renderer/components/home/HeroSection.tsx', 'src/renderer/components/primitives/AppShell.tsx'],
  workspace: ['src/renderer/features/workspace/WorkspacePage.tsx', 'src/renderer/components/caption/CaptionStage.tsx', 'src/renderer/components/notes/NotesPanel.tsx', 'src/renderer/features/workspace/WorkspaceToolbar.tsx'],
  models: ['src/renderer/features/models/ModelsPage.tsx', 'src/renderer/features/models/ModelCard.tsx', 'src/shared/model-capabilities.ts', 'engine/nola_translator_engine/resources.py'],
}

const viewport = guideOnly ? { width: 1920, height: 1080 } : { width: 1440, height: 1000 }
const capturePath = (locale, page, theme) => {
  const name = guideOnly ? ({ 'compute-environment': 'compute', 'llm-configuration': 'translation' }[page] ?? page) : page
  return `screenshots/${locale}/${guideOnly ? 'guide/' : ''}${name}${theme === 'dark' ? '-dark' : ''}.png`
}
if (guideOnly) Object.assign(routes, { audio: '#/settings/audio', browser: '#/settings/browser', 'compute-components': '#/settings/compute', 'session-setup': '#/workspace', 'session-check': '#/workspace', 'download-source': '#/models' })

async function pressGuideButton(win, label) {
  await win.webContents.executeJavaScript(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(element => !element.disabled && element.textContent.trim() === ${JSON.stringify(label)})
    if (!button) throw new Error('Guide button missing: ' + ${JSON.stringify(label)})
    button.click()
  })()`)
}

async function waitForGuideDialog(win, text) {
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000
    const check = () => Array.from(document.querySelectorAll('[role="dialog"]')).some(element => element.textContent.includes(${JSON.stringify(text)}))
      ? resolve() : Date.now() > deadline ? reject(new Error('Guide dialog missing: ' + ${JSON.stringify(text)})) : setTimeout(check, 25)
    check()
  })`)
}

async function main() {
  await app.whenReady()
  const win = new BrowserWindow({
    show: false,
    ...viewport,
    ...(guideOnly ? { useContentSize: true } : {}),
    backgroundColor: '#f8fafc',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  const outputRoot = path.join(root, 'docs/public/screenshots')
  await fs.mkdir(outputRoot, { recursive: true })
  let manifest
  const manifestPath = path.join(outputRoot, guideOnly ? 'zh-CN/guide/manifest.json' : 'manifest.json')
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch { manifest = { viewport, demoOnly: true, images: [] } }
  // Replace only captured paths, preserving README illustrations and the other theme.
  const themes = readmeOnly || guideOnly ? ['light'] : darkOnly ? ['dark'] : ['light', 'dark']
  const capturedPaths = new Set(locales.flatMap(locale => themes.flatMap(theme => pages.map(page => capturePath(locale, page, theme)))))
  manifest.images = manifest.images.filter(item => !capturedPaths.has(item.path))
  manifest.generatedAt = new Date().toISOString()
  try {
    for (const locale of locales) {
      const localeDir = path.join(outputRoot, locale, guideOnly ? 'guide' : '')
      await fs.mkdir(localeDir, { recursive: true })
      for (const theme of themes) {
        for (const page of pages) {
          const suffix = theme === 'dark' ? '-dark' : ''
          const url = `${baseUrl}/?locale=${encodeURIComponent(locale)}&page=${page}&snapshot=1${theme === 'dark' ? '&theme=dark' : ''}${routes[page]}`
          await win.loadURL(url)
          await win.webContents.executeJavaScript(`new Promise((resolve, reject) => { const deadline = Date.now() + 30000; const check = () => document.documentElement.dataset.captureReady === 'true' ? resolve() : Date.now() > deadline ? reject(new Error('UI demo did not finish rendering')) : setTimeout(check, 25); check() })`)
          if (guideOnly && page === 'compute-components') {
            await win.webContents.executeJavaScript("document.querySelector('.nola-main').scrollTo({ top: document.querySelector('.nola-main').scrollHeight, behavior: 'instant' })")
          }
          if (guideOnly && (page === 'session-setup' || page === 'session-check')) {
            await pressGuideButton(win, '开始同传')
            await waitForGuideDialog(win, '新建同传')
            if (page === 'session-check') {
              await pressGuideButton(win, '开始')
              await waitForGuideDialog(win, '检查通过')
            }
          }
          if (guideOnly && page === 'download-source') {
            await pressGuideButton(win, '安装')
            await waitForGuideDialog(win, '选择下载源')
          }
          if (guideOnly) {
            await win.webContents.executeJavaScript("Promise.race([Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))), new Promise(resolve => setTimeout(resolve, 600))])")
          }
          if (theme === 'dark') {
            if (!await win.webContents.executeJavaScript("document.documentElement.classList.contains('dark')")) throw new Error(`Dark theme missing: ${locale}/${page}`)
          }
          await new Promise(resolve => setTimeout(resolve, 120))
          const png = await win.webContents.capturePage()
          const buffer = png.toPNG()
          const size = png.getSize()
          const relativePath = capturePath(locale, page, theme)
          const file = path.join(root, 'docs/public', relativePath)
          await fs.writeFile(file, buffer)
          manifest.images.push({ locale, page, theme: page === 'dark-mode' ? 'dark' : theme, path: relativePath, width: size.width, height: size.height, bytes: buffer.length, sourceComponents: sourceComponents[page], demoDescription: '真实 React 页面与 theme 渲染；内容由 docs/media-src/demo.ts 注入的虚构演示数据提供，不读取凭据、真实记录、音频或模型。' })
          console.log(`captured ${locale}/${page}${suffix}.png`)
        }
      }
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  } finally {
    win.destroy()
    await app.quit()
  }
}
main().catch(error => { console.error(error); app.exit(1) })
