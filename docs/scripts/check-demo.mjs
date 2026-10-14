import { preview } from 'vite'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const site = process.argv.includes('--site')
const server = await preview({
  configFile: false, root,
  base: site ? '/' : '/toy/nola-demo/',
  build: { outDir: resolve(root, site ? 'docs/dist' : 'artifacts/toy') },
  preview: { host: '127.0.0.1', port: 0, open: false },
})
try {
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}${site ? '/' : '/toy/nola-demo/'}`
  if (process.argv.includes('--serve')) {
    console.log(`Preview: ${url}`)
    await new Promise(resolveExit => {
      process.once('SIGINT', resolveExit)
      process.once('SIGTERM', resolveExit)
    })
  } else {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electron, [resolve(root, 'docs/scripts/check-demo.cjs'), url, ...(site ? ['--site'] : [])], { cwd: root, env, stdio: 'inherit' })
    process.exitCode = await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('exit', code => resolveExit(code ?? 1))
    })
  }
} finally {
  await server.close()
}
