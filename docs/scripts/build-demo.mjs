import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeEmptyIsCss } from './normalize-empty-is-css.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
await build({
  configFile: false,
  root: resolve(root, 'docs/media-src'),
  base: './',
  publicDir: resolve(root, 'src/renderer/public'),
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [normalizeEmptyIsCss()] } },
  resolve: { alias: { '@': resolve(root, 'src/renderer'), '@renderer': resolve(root, 'src/renderer') } },
  build: { outDir: resolve(root, 'docs/public/demo'), emptyOutDir: true },
})
