import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const release = JSON.parse(await readFile(resolve(root, '../version.json'), 'utf8'))
const firefox = process.argv.includes('--firefox')
const outDir = resolve(root, firefox ? 'dist-firefox' : 'dist')
const common = { configFile: false, root, resolve: { dedupe: ['react-stately'] }, define: { ...(firefox ? { chrome: 'globalThis.browser' } : {}), 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [react(), tailwindcss()], build: { outDir, emptyOutDir: false, minify: true } }
await build({ ...common, build: { ...common.build, emptyOutDir: true, rollupOptions: { input: resolve(root, 'popup.html') } } })
for (const name of ['background', 'content', 'capture-handle', 'worklet']) {
  await build({ ...common, build: { ...common.build, lib: { entry: resolve(root, `${name}.${name === 'content' ? 'tsx' : 'ts'}`), name: `Nola_${name.replace('-', '_')}`, formats: ['iife'], fileName: () => `${name}.js` }, rollupOptions: { output: { inlineDynamicImports: true } } } })
}
// Build the manifest from the same identity constants used by the desktop host.
const identity = await import('node:fs/promises').then(fs => fs.readFile(resolve(root, '../../src/shared/browser.ts'), 'utf8'))
const key = identity.match(/BROWSER_EXTENSION_KEY = '([^']+)'/)?.[1]
if (!key) throw new Error('Missing extension identity')
await mkdir(outDir, { recursive: true })
// Chrome loads no SVG for extension icons, so the shipped PNGs stand in for the project logo.
await mkdir(resolve(outDir, 'icons'), { recursive: true })
const iconNames = (await readdir(resolve(root, 'icons'))).filter(name => name.endsWith('.png'))
const icon = size => `icons/${iconNames.find(name => name === `icon-${size}.png`) ?? ''}`
const icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, icon(size)]))
await Promise.all(iconNames.map(name => copyFile(resolve(root, 'icons', name), resolve(outDir, 'icons', name))))
await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Nola Captions', version: release.version, ...(firefox ? { browser_specific_settings: { gecko: { id: identity.match(/FIREFOX_EXTENSION_ID = '([^']+)'/)?.[1], strict_min_version: '128.0' } } } : { key }), description: 'Live video captions through Nola Translator.', icons, permissions: ['nativeMessaging', 'storage', 'scripting', 'activeTab'], host_permissions: ['https://www.youtube.com/*', 'https://www.bilibili.com/*'], optional_host_permissions: ['https://*/*'], background: firefox ? { scripts: ['background.js'] } : { service_worker: 'background.js' }, action: { default_popup: 'popup.html', default_title: 'Nola Captions', default_icon: Object.fromEntries([16, 24, 32].map(size => [size, icon(size)])) }, content_scripts: [{ matches: ['https://www.youtube.com/*', 'https://www.bilibili.com/*'], js: ['capture-handle.js'], run_at: 'document_start', world: 'MAIN' }, { matches: ['https://www.youtube.com/*', 'https://www.bilibili.com/*'], js: ['content.js'], run_at: 'document_idle' }], web_accessible_resources: [{ resources: ['worklet.js'], matches: ['https://*/*'] }] }, null, 2))
