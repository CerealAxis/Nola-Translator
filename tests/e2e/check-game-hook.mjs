import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, resolve } from 'node:path'
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
  const target = spawn(executable, [], { cwd: dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const host = new GameHook(root)
  try {
    let embedded = false, expired = false, answer = false
    const targetOutput = createInterface({ input: target.stdout })
    targetOutput.on('line', line => { const message = JSON.parse(line); if (message.embedded) embedded = true; if (message.expired) expired = true })
    const targetLine = await new Promise((resolveLine, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture did not start')), 5000)
      targetOutput.once('line', line => { clearTimeout(timer); resolveLine(JSON.parse(line)) })
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
    await host.start(`window:${targetLine.handle}:1`, executable, event => {
      events.push(event)
      if (answer && event.type === 'embedRequest') host.reply(event.token, 'Nola embedded translation')
    })
    const code = `ENHQN${bits === '64' ? '-1C' : '4'}@${targetLine.offset.toUpperCase()}:nola-game-hook-test-target.exe`
    try { await host.insert(code) }
    catch (error) {
      const native = events.filter(event => ['connected', 'disconnected', 'inserted', 'thread', 'error'].includes(event.type))
      throw new Error(`${identity.architecture} rejected ${code} (target exit ${target.exitCode}): ${JSON.stringify(native.slice(-50))}`, { cause: error })
    }
    const started = Date.now()
    while (!events.some(event => event.type === 'text' && event.text.includes('Nola native hook fixture'))) {
      assert(!events.some(event => event.type === 'error'), JSON.stringify(events))
      assert(Date.now() - started < 15000, `No extracted fixture text: ${JSON.stringify(events.slice(-10))}`)
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    async function until(condition, description) {
      const deadline = Date.now() + 10000
      while (!condition()) {
        assert(Date.now() < deadline, `${description}: ${JSON.stringify(events.slice(-8))}`)
        await new Promise(resolveWait => setTimeout(resolveWait, 30))
      }
    }
    host.search('Nola native hook fixture', 10)
    await until(() => events.some(event => event.type === 'searchDone'), 'Search completion')
    assert(events.some(event => event.type === 'candidate' && event.code.startsWith('RQ@')))
    await until(() => events.some(event => event.type === 'thread' && event.embed), 'Embed-capable thread')
    const thread = events.find(event => event.type === 'thread' && event.embed && event.code.toUpperCase() === code.toUpperCase())
    assert(thread, JSON.stringify(events.slice(-12)))
    host.enableEmbed(thread.id, 100)
    await until(() => events.some(event => event.type === 'embedRequest'), 'First embed request')
    const stale = events.find(event => event.type === 'embedRequest')
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
    host.reply(stale.token, 'Expired translation')
    answer = true
    host.enableEmbed(thread.id, 1500)
    await until(() => embedded, 'Target-side translated argument')
    assert.equal(expired, false)
    host.enableEmbed('', 0)
    await assert.rejects(host.insert('HZ0@1'), { message: 'invalidHook' })
    assert(events.some(event => event.type === 'error' && event.code === 'invalidHook'), 'The target parser must explicitly reject the code')
    await host.stop()
    assert.equal(target.exitCode, null)
    console.log(JSON.stringify({ architecture: identity.architecture, extracted: true, searched: true, embedded, detached: true, targetAlive: true }))
  } finally { await host.stop(); target.kill() }
}
