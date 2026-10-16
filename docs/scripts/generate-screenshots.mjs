import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const server = await createServer({
  configFile: false,
  root: resolve(root, 'docs/media-src'),
  publicDir: resolve(root, 'src/renderer/public'),
  resolve: { alias: { '@': resolve(root, 'src/renderer'), '@renderer': resolve(root, 'src/renderer') } },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] }, watch: { ignored: ['**/.electron-cache/**', '**/screenshots/**'] } },
})
try {
  await server.listen()
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}`
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const childArgs = [resolve(root, 'docs/scripts/capture-screenshots.cjs'), url]
  if (process.argv.includes('--readme')) childArgs.push('--readme')
  if (process.argv.includes('--dark')) childArgs.push('--dark')
  if (process.argv.includes('--guide')) childArgs.push('--guide')
  const child = spawn(electron, childArgs, { cwd: root, env, stdio: 'inherit' })
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
} finally {
  await server.close()
}
