import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFile, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const release = JSON.parse(await readFile(resolve(root, '../version.json'), 'utf8'))
const firefox = process.argv.includes('--firefox')
const identity = await readFile(resolve(root, '../../src/shared/browser.ts'), 'utf8')
const key = identity.match(/BROWSER_EXTENSION_KEY = '([^']+)'/)?.[1]
const firefoxId = identity.match(/FIREFOX_EXTENSION_ID = '([^']+)'/)?.[1]
if (!key || (firefox && !firefoxId)) throw new Error('Missing extension identity')
const outDir = resolve(root, firefox ? 'dist-firefox' : 'dist')
const common = { configFile: false, root, resolve: { alias: { '@': resolve(root, '../../src/renderer') } }, define: { ...(firefox ? { chrome: 'globalThis.browser' } : {}), 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [react(), tailwindcss()], build: { outDir, emptyOutDir: false, minify: true } }
await build({ ...common, base: './', build: { ...common.build, emptyOutDir: true, rollupOptions: { input: ['popup.html', 'options.html', 'sidepanel.html', 'document.html', ...(firefox ? [] : ['offscreen.html'])].map(path => resolve(root, path)) } } })
for (const name of ['background', 'content', 'capture-handle', 'worklet']) {
  await build({ ...common, build: { ...common.build, lib: { entry: resolve(root, `${name}.${name === 'content' ? 'tsx' : 'ts'}`), name: `Nola_${name.replace('-', '_')}`, formats: ['iife'], fileName: () => `${name}.js` }, rollupOptions: { output: { inlineDynamicImports: true } } } })
}
await mkdir(outDir, { recursive: true })
await cp(resolve(root, '../../node_modules/pdfjs-dist/standard_fonts'), resolve(outDir, 'pdf-standard-fonts'), { recursive: true })
// Chrome loads no SVG for extension icons, so the shipped PNGs stand in for the project logo.
await mkdir(resolve(outDir, 'icons'), { recursive: true })
const iconNames = (await readdir(resolve(root, 'icons'))).filter(name => name.endsWith('.png'))
const icon = size => `icons/${iconNames.find(name => name === `icon-${size}.png`) ?? ''}`
const icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, icon(size)]))
await Promise.all(iconNames.map(name => copyFile(resolve(root, 'icons', name), resolve(outDir, 'icons', name))))
const webPages = ['http://*/*', 'https://*/*']
await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Nola Translator', version: release.version, ...(firefox ? { browser_specific_settings: { gecko: { id: firefoxId, strict_min_version: '128.0' } } } : { key, minimum_chrome_version: '116.0' }), description: 'Translate web pages and video subtitles with Nola Translator.', icons, permissions: ['nativeMessaging', 'scripting', 'activeTab', 'storage', 'contextMenus', 'declarativeNetRequestWithHostAccess', ...(firefox ? [] : ['tabCapture', 'offscreen', 'sidePanel'])], host_permissions: webPages, commands: { togglePageTranslation: { suggested_key: { default: 'Alt+T' }, description: 'Translate this page' }, translateSelection: { suggested_key: { default: 'Alt+S' }, description: 'Translate selected text' }, toggleSubtitles: { suggested_key: { default: 'Alt+V' }, description: 'Translate video subtitles' } }, background: firefox ? { scripts: ['background.js'] } : { service_worker: 'background.js' }, options_ui: { page: 'options.html', open_in_tab: true }, ...(firefox ? { sidebar_action: { default_panel: 'sidepanel.html', default_title: 'Nola Translator' } } : { side_panel: { default_path: 'sidepanel.html' } }), action: { default_popup: 'popup.html', default_title: 'Nola Translator', default_icon: Object.fromEntries([16, 24, 32].map(size => [size, icon(size)])) }, content_scripts: [{ matches: webPages, js: ['capture-handle.js'], run_at: 'document_start', world: 'MAIN' }, { matches: webPages, js: ['content.js'], run_at: 'document_idle' }], web_accessible_resources: [{ resources: ['worklet.js'], matches: webPages }] }, null, 2))
