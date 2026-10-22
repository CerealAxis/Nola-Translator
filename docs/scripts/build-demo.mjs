import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const toy = process.argv.includes('--toy')
const outDir = resolve(root, toy ? 'artifacts/toy' : 'docs/public/demo')
await build({
  configFile: false,
  root: resolve(root, 'docs/media-src'),
  base: './',
  mode: toy ? 'toy' : 'production',
  publicDir: resolve(root, 'src/renderer/public'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src/renderer'), '@renderer': resolve(root, 'src/renderer') } },
  build: { outDir, emptyOutDir: true },
})
if (toy) {
  console.log(`Toy package: ${outDir}`)
}
