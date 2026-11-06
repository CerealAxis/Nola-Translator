import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

const run = promisify(execFile)
const root = resolve('build/game-hook')
const output = resolve('artifacts/game-hook')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/main/game-hook.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: resolve(output, 'game-hook.cjs') })
const { GameHook } = createRequire(import.meta.url)(resolve(output, 'game-hook.cjs'))
for (const bits of ['64', '32']) {
  const executable = resolve(`build/game-hook-build/helper-${bits}/Release/nola-game-hook-test-target.exe`)
  const target = spawn(executable, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const host = new GameHook(root)
  try {
    const targetLine = await new Promise((resolveLine, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture did not start')), 5000)
      createInterface({ input: target.stdout }).once('line', line => { clearTimeout(timer); resolveLine(JSON.parse(line)) })
      target.once('error', reject)
    })
    const { stdout } = await run(resolve(root, 'nola-game-hook64.exe'), ['--probe', targetLine.handle], { windowsHide: true })
    const identity = JSON.parse(stdout)
    assert.equal(identity.architecture, bits === '64' ? 'x64' : 'x86')
    assert.equal(identity.pid, target.pid)
    await assert.rejects(run(resolve(root, `nola-game-hook${bits}.exe`), ['--attach', targetLine.handle, String(identity.pid), String(BigInt(identity.started) + 1n)], { windowsHide: true }), error => error.code === 3 && error.stdout.includes('targetChanged'))
    if (bits === '32') await assert.rejects(run(resolve(root, 'nola-game-hook64.exe'), ['--attach', targetLine.handle, String(identity.pid), identity.started], { windowsHide: true }), error => error.code === 3 && error.stdout.includes('targetChanged'))
    assert(await host.available(), 'Both verified native architectures must be installed')
    const events = []
    await host.start(`window:${targetLine.handle}:1`, executable, event => events.push(event))
    const started = Date.now()
    while (!events.some(event => event.type === 'text' && event.text.includes('Nola native hook fixture'))) {
      assert(!events.some(event => event.type === 'error'), JSON.stringify(events))
      assert(Date.now() - started < 15000, `No extracted fixture text: ${JSON.stringify(events.slice(-10))}`)
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    assert(events.some(event => event.type === 'thread'))
    await host.stop()
    assert.equal(target.exitCode, null)
    console.log(JSON.stringify({ architecture: identity.architecture, extracted: true, detached: true, targetAlive: true }))
  } finally { await host.stop(); target.kill() }
}
