const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const baseUrl = process.argv[2]
const readmeOnly = process.argv.includes('--readme')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setPath('userData', path.resolve(__dirname, '../media-src/.electron-cache'))
const root = path.resolve(__dirname, '../..')
const locales = readmeOnly ? ['zh-CN'] : ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']
const pages = readmeOnly
  ? ['home', 'overlay-scene', 'browser-scene', 'models', 'compute-environment', 'dark-mode', 'llm-configuration']
  : ['home', 'workspace', 'models', 'overlay-scene', 'browser-scene']
const routes = { home: '#/', workspace: '#/workspace', models: '#/models', 'overlay-scene': '#/', 'browser-scene': '#/', 'compute-environment': '#/settings/compute', 'dark-mode': '#/', 'llm-configuration': '#/settings/translation' }
const sourceComponents = {
  'overlay-scene': ['src/renderer/features/overlay/OverlayRoot.tsx', 'src/renderer/features/overlay/CaptionTrack.tsx', 'docs/media-src/Scene.tsx'],
  'browser-scene': ['browser/extension/styles.css', 'browser/extension/captionPresentation.ts', 'docs/media-src/Scene.tsx'],
  'compute-environment': ['src/renderer/features/settings/tabs/ComputeTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  'dark-mode': ['src/renderer/features/home/HomePage.tsx', 'src/renderer/components/primitives/AppShell.tsx'],
  'llm-configuration': ['src/renderer/features/settings/tabs/TranslationTab.tsx', 'src/renderer/features/settings/SettingsPage.tsx'],
  home: ['src/renderer/features/home/HomePage.tsx', 'src/renderer/features/home/RecentMeetings.tsx', 'src/renderer/components/home/HeroSection.tsx', 'src/renderer/components/primitives/AppShell.tsx'],
  workspace: ['src/renderer/features/workspace/WorkspacePage.tsx', 'src/renderer/components/caption/CaptionStage.tsx', 'src/renderer/components/notes/NotesPanel.tsx', 'src/renderer/features/workspace/WorkspaceToolbar.tsx'],
  models: ['src/renderer/features/models/ModelsPage.tsx', 'src/renderer/features/models/ModelCard.tsx', 'src/shared/model-capabilities.ts', 'engine/nola_translator_engine/resources.py'],
}

async function main() {
  await app.whenReady()
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1000,
    backgroundColor: '#f8fafc',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  const outputRoot = path.join(root, 'docs/public/screenshots')
  await fs.mkdir(outputRoot, { recursive: true })
  let manifest
  const manifestPath = path.join(outputRoot, 'manifest.json')
  if (readmeOnly) {
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch { manifest = { viewport: { width: 1440, height: 1000 }, demoOnly: true, images: [] } }
    manifest.images = manifest.images.filter(item => item.locale !== 'zh-CN' || !pages.includes(item.page))
  } else manifest = { viewport: { width: 1440, height: 1000 }, demoOnly: true, images: [] }
  manifest.generatedAt = new Date().toISOString()
  try {
    for (const locale of locales) {
      const localeDir = path.join(outputRoot, locale)
      await fs.mkdir(localeDir, { recursive: true })
      for (const page of pages) {
        const url = `${baseUrl}/?locale=${encodeURIComponent(locale)}&page=${page}&snapshot=1${routes[page]}`
        await win.loadURL(url)
        await win.webContents.executeJavaScript(`new Promise((resolve, reject) => { const deadline = Date.now() + 30000; const check = () => document.documentElement.dataset.captureReady === 'true' ? resolve() : Date.now() > deadline ? reject(new Error('UI demo did not finish rendering')) : setTimeout(check, 25); check() })`)
        await new Promise(resolve => setTimeout(resolve, 120))
        const png = await win.webContents.capturePage()
        const buffer = png.toPNG()
        const size = png.getSize()
        const file = path.join(localeDir, `${page}.png`)
        await fs.writeFile(file, buffer)
        manifest.images.push({ locale, page, path: `screenshots/${locale}/${page}.png`, width: size.width, height: size.height, bytes: buffer.length, sourceComponents: sourceComponents[page], demoDescription: '真实 React 页面与 theme 渲染；内容由 docs/media-src/demo.ts 注入的虚构演示数据提供，不读取凭据、真实记录、音频或模型。' })
        console.log(`captured ${locale}/${page}.png`)
      }
    }
    await fs.writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  } finally {
    win.destroy()
    await app.quit()
  }
}
main().catch(error => { console.error(error); app.exit(1) })
