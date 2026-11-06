import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { GameProfile } from '../shared/game-translation'
import { z } from 'zod'

const targetSchema = z.object({ type: z.literal('target'), pid: z.number().int().positive(), started: z.string().regex(/^\d+$/), architecture: z.enum(['x64', 'x86']), executable: z.string().min(1).max(32768) })
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thread'), id: z.string().max(160), name: z.string().max(1024), code: z.string().max(1024), embed: z.boolean() }),
  z.object({ type: z.literal('text'), id: z.string().max(160), text: z.string().max(16000) }),
  z.object({ type: z.literal('embedRequest'), id: z.string().max(160), token: z.string().regex(/^\d{1,20}$/), text: z.string().min(1).max(16000) }),
  z.object({ type: z.literal('candidate'), code: z.string().max(100) }),
  z.object({ type: z.literal('insertFailed'), code: z.string().max(1024) }),
  z.object({ type: z.literal('inserted'), address: z.string().regex(/^[0-9a-fA-F]{1,16}$/), code: z.string().max(1024) }),
  z.object({ type: z.literal('searchDone') }),
  z.object({ type: z.literal('remove'), id: z.string().max(160) }),
  z.object({ type: z.literal('error'), code: z.string().max(100) }),
  ...(['ready', 'connected', 'disconnected'] as const).map(type => z.object({ type: z.literal(type) })),
])
export type GameHookEvent = z.infer<typeof eventSchema>

export class GameHook {
  private child?: ChildProcessWithoutNullStreams
  private pendingInsert?: { code: string; finish(code?: string, failure?: string): void }
  private generation = 0
  private commandReady = false
  constructor(private readonly root: string) {}

  async available(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    try {
      const manifest = z.object({ protocolVersion: z.literal(3), revision: z.literal('31b502ebf34c35d27276a3d5aaf58ca7b45f0f3b'), files: z.array(z.object({ name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })) }).parse(JSON.parse((await readFile(join(this.root, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, '')))
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
      const timer = setTimeout(() => { reject(new Error('hookTimeout')); if (generation === this.generation) void this.stop() }, 8000)
      child.stdout.setEncoding('utf8').on('data', (data: string) => {
        if (generation !== this.generation) return
        buffer += data
        if (buffer.length > 256 * 1024) { clearTimeout(timer); reject(new Error('hookProtocolError')); changed({ type: 'error', code: 'hookProtocolError' }); void this.stop(); return }
        let index: number
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
          let event: GameHookEvent
          try { event = eventSchema.parse(JSON.parse(line)) } catch { continue }
          if (event.type === 'ready') { this.commandReady = true; ready = true; clearTimeout(timer); resolveStart() }
          if (event.type === 'disconnected') {
            this.commandReady = false; this.pendingInsert?.finish(undefined, 'hookExited')
            if (!ready) { clearTimeout(timer); reject(new Error('hookExited')) }
          }
          if (event.type === 'error' && !ready) { clearTimeout(timer); reject(new Error(event.code)) }
          if (event.type === 'insertFailed') {
            if (this.pendingInsert?.code.toUpperCase() === event.code.toUpperCase()) this.pendingInsert.finish()
            continue
          }
          if (event.type === 'error' && event.code === 'invalidHook') this.pendingInsert?.finish()
          if (event.type === 'inserted' && this.pendingInsert) {
            const [operation, address] = this.pendingInsert.code.toUpperCase().split('@')
            const [reported] = event.code.toUpperCase().split('@')
            if (this.pendingInsert.code.toUpperCase() === event.code.toUpperCase() ||
                operation === reported && /^[0-9A-F]+$/.test(address) && BigInt(`0x${address}`) === BigInt(`0x${event.address}`)) this.pendingInsert.finish(event.code)
          }
          changed(event)
        }
      })
      child.stderr.on('data', () => {})
      child.once('error', () => { clearTimeout(timer); reject(new Error('hookUnavailable')); if (generation === this.generation) changed({ type: 'error', code: 'hookUnavailable' }) })
      child.once('exit', () => {
        clearTimeout(timer)
        if (!ready) reject(new Error('hookExited'))
        if (generation === this.generation) { this.pendingInsert?.finish(undefined, 'hookExited'); this.child = undefined; this.commandReady = false; changed({ type: 'disconnected' }) }
      })
    })
  }

  async insert(input: string): Promise<string> {
    if (!this.commandReady) throw new Error('hookUnavailable')
    const code = input.trim().replace(/^\//, '')
    const [operation, address = ''] = code.split('@')
    // Luna parses numeric offsets inside the game process with throwing integer conversions.
    if (operation.match(/[0-9a-f]{8,}/i) || address.split(':').some(part => Buffer.byteLength(part) >= 120) ||
        (!address.endsWith(':JIT:UNITY') && !/^[0-9a-f]{1,16}(?::|$)/i.test(address))) throw new Error('invalidHook')
    if (!this.child || this.pendingInsert || code.length > 400 || !/^(?:[RHEBL])[^\r\n\t\0]*@[^\r\n\t\0]+$/.test(code)) throw new Error('invalidHook')
    return new Promise((resolve, reject) => {
      const finish = (verified?: string, failure = 'invalidHook') => {
        clearTimeout(timer)
        this.pendingInsert = undefined
        if (verified) resolve(verified)
        else reject(new Error(failure))
      }
      const timer = setTimeout(() => finish(undefined, 'hookTimeout'), 4000)
      this.pendingInsert = { code, finish }
      this.child!.stdin.write(`hook\t${code}\n`)
    })
  }

  search(text: string, seconds: number): void {
    if (!this.commandReady) throw new Error('hookUnavailable')
    if (!this.child || !text.trim() || [...text].length > 128 || !Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new Error('invalidHook')
    this.child.stdin.write(`search\t${seconds}\t${Buffer.from(text).toString('hex')}\n`)
  }

  cancelSearch(): void { this.child?.stdin.write('cancelSearch\n') }

  enableEmbed(id: string, wait: number, style: GameProfile['embedStyle'] = {}): void {
    if (!this.commandReady) throw new Error('hookUnavailable')
    if (!this.child || /[^a-fA-F0-9:]/.test(id) || !Number.isInteger(wait) || wait < 0 || wait > 3000) throw new Error('threadUnavailable')
    const mode = { translation: 0, bilingual: 1, original: 3 }[style.mode ?? 'translation']
    const charset = { game: 0, shiftJis: 128, gbk: 134, big5: 136, hangul: 129 }[style.charset ?? 'game']
    this.child.stdin.write(`style\t${mode}\t${style.scale ?? 100}\t${charset}\t${style.clear ? 1 : 0}\t${Buffer.from(style.family ?? '').toString('hex')}\n`)
    this.child.stdin.write(`enable\t${wait}\t${id}\n`)
  }

  reply(token: string, translation: string): void {
    if (/^\d{1,20}$/.test(token) && translation.length < 1000 && !translation.includes('\0')) this.child?.stdin.write(`reply\t${token}\t${Buffer.from(translation).toString('hex')}\n`)
  }

  async stop(): Promise<void> {
    this.commandReady = false; this.pendingInsert?.finish(undefined, 'hookExited')
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
