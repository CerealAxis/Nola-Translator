import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'docs/public/demo')
await build({
  configFile: false,
  root: resolve(root, 'docs/media-src'),
  base: './',
  publicDir: resolve(root, 'src/renderer/public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(root, 'src/renderer'),
      '@renderer': resolve(root, 'src/renderer'),
      react: resolve(root, 'node_modules/react'),
      'react-dom': resolve(root, 'node_modules/react-dom'),
    },
  },
  build: {
    outDir, emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'docs/media-src/index.html') },
  },
})
