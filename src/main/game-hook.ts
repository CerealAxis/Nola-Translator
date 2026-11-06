import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

const targetSchema = z.object({ type: z.literal('target'), pid: z.number().int().positive(), started: z.string().regex(/^\d+$/), architecture: z.enum(['x64', 'x86']), executable: z.string().min(1).max(32768) })
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thread'), id: z.string().max(160), name: z.string().max(1024), code: z.string().max(1024), embed: z.boolean() }),
  z.object({ type: z.literal('text'), id: z.string().max(160), text: z.string().max(16000) }),
  z.object({ type: z.literal('remove'), id: z.string().max(160) }),
  z.object({ type: z.literal('error'), code: z.string().max(100) }),
  ...(['ready', 'connected', 'disconnected'] as const).map(type => z.object({ type: z.literal(type) })),
])
export type GameHookEvent = z.infer<typeof eventSchema>

export class GameHook {
  private child?: ChildProcessWithoutNullStreams
  private generation = 0
  constructor(private readonly root: string) {}

  async available(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    try {
      const manifest = z.object({ revision: z.literal('31b502ebf34c35d27276a3d5aaf58ca7b45f0f3b'), files: z.array(z.object({ name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })) }).parse(JSON.parse((await readFile(join(this.root, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, '')))
      const checked = await Promise.all(['nola-game-hook64.exe', 'nola-game-hook32.exe', 'LunaHost64.dll', 'LunaHost32.dll', 'LunaHook64.dll', 'LunaHook32.dll'].map(async name => {
        const expected = manifest.files.find(file => file.name === name)?.sha256
        return expected === createHash('sha256').update(await readFile(join(this.root, name))).digest('hex')
      }))
      if (checked.some(valid => !valid)) return false
      return true
    } catch { return false }
  }

  async start(sourceId: string, executable: string | undefined, changed: (event: GameHookEvent) => void): Promise<void> {
    const requested = ++this.generation
    const handle = /^window:(\d+):\d+$/.exec(sourceId)?.[1]
    if (!handle || !await this.available()) throw new Error('hookUnavailable')
    if (requested !== this.generation) return
    const stopping = this.stop(), generation = this.generation
    await stopping
    if (generation !== this.generation) return
    const probe = await promisify(execFile)(join(this.root, 'nola-game-hook64.exe'), ['--probe', handle], { windowsHide: true, timeout: 5000, maxBuffer: 65536 })
    if (generation !== this.generation) return
    const target = targetSchema.parse(JSON.parse(probe.stdout.trim()))
    if (executable && resolve(target.executable).toLowerCase() !== resolve(executable).toLowerCase()) throw new Error('targetMismatch')
    const child = spawn(join(this.root, target.architecture === 'x64' ? 'nola-game-hook64.exe' : 'nola-game-hook32.exe'), ['--attach', handle, String(target.pid), target.started], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    child.stdin.on('error', () => { if (generation === this.generation) changed({ type: 'error', code: 'hookUnavailable' }) })
    await new Promise<void>((resolveStart, reject) => {
      let buffer = '', ready = false
      const timer = setTimeout(() => { reject(new Error('hookTimeout')); void this.stop() }, 8000)
      child.stdout.setEncoding('utf8').on('data', (data: string) => {
        if (generation !== this.generation) return
        buffer += data
        if (buffer.length > 256 * 1024) { clearTimeout(timer); reject(new Error('hookProtocolError')); changed({ type: 'error', code: 'hookProtocolError' }); void this.stop(); return }
        let index: number
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
          let event: GameHookEvent
          try { event = eventSchema.parse(JSON.parse(line)) } catch { continue }
          if (event.type === 'ready') { ready = true; clearTimeout(timer); resolveStart() }
          if (event.type === 'error' && !ready) { clearTimeout(timer); reject(new Error(event.code)) }
          changed(event)
        }
      })
      child.stderr.on('data', () => {})
      child.once('error', () => { clearTimeout(timer); reject(new Error('hookUnavailable')); if (generation === this.generation) changed({ type: 'error', code: 'hookUnavailable' }) })
      child.once('exit', () => {
        clearTimeout(timer)
        if (!ready) reject(new Error('hookExited'))
        if (generation === this.generation) { this.child = undefined; changed({ type: 'disconnected' }) }
      })
    })
  }

  insert(code: string): void {
    if (!this.child || !code || code.length > 1024 || /[\r\n\t\0]/.test(code)) throw new Error('invalidHook')
    this.child.stdin.write(`hook\t${code}\n`)
  }

  async stop(): Promise<void> {
    ++this.generation
    const child = this.child; this.child = undefined
    if (!child || child.exitCode !== null) return
    await new Promise<void>(resolveStop => {
      const timer = setTimeout(() => { child.kill(); resolveStop() }, 1500)
      child.once('exit', () => { clearTimeout(timer); resolveStop() })
      child.stdin.on('error', () => {})
      child.stdin.end('stop\n')
    })
  }
}
