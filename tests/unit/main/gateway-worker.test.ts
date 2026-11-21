import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { createGatewayWorker } from '../../../src/main/model-gateway-worker'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { initializeSessionLog, sessionLogPath } from '../../../src/main/session-log'

const state = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: state.spawn, execFile: vi.fn(), default: { spawn: state.spawn, execFile: vi.fn() } }))

it('records original worker stderr and native spawn errors without credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-worker-log-'))
  const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() })
  state.spawn.mockReturnValue(child)
  await initializeSessionLog(directory, {})
  const worker = createGatewayWorker({ command: 'unused', args: ['-m', 'nola_translator_engine.local_call'] } as never, {}, vi.fn())
  const rejected = expect(worker.ready).rejects.toThrow('native DLL failure')
  try {
    const ended = once(child.stderr, 'end')
    child.stderr.end('original CUDA diagnostic api_key=private-value\n')
    await ended
    child.emit('error', Object.assign(new Error('native DLL failure'), { code: 'ENOENT' }))
    await rejected
    const contents = await readFile(sessionLogPath(), 'utf8')
    expect(contents).toContain('original CUDA diagnostic')
    expect(contents).toContain('native DLL failure')
    expect(contents).toContain('ENOENT')
    expect(contents).not.toContain('private-value')
  } finally { await worker.close(); await rm(directory, { recursive: true, force: true }) }
})

it('rejects malformed worker result envelopes instead of treating arrays as inference objects', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() })
  state.spawn.mockReturnValue(child)
  let sent = ''
  child.stdin.on('data', chunk => { sent += String(chunk) })
  const failed = vi.fn()
  const worker = createGatewayWorker({ command: 'unused', args: ['-m', 'nola_translator_engine.local_call'] } as never, {}, failed)
  const rejected = expect(worker.ready).rejects.toThrow('invalid response')
  const { id } = JSON.parse(sent)
  child.stdout.write(JSON.stringify({ id, result: [] }) + '\n')
  await rejected
  expect(failed).toHaveBeenCalledOnce()
  child.emit('close')
  await worker.close()
})

it('keeps real translation and ASR event objects working alongside result validation', async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() })
  state.spawn.mockReturnValue(child)
  const requests: { id: string }[] = []
  child.stdin.on('data', chunk => { requests.push(JSON.parse(String(chunk))) })
  const failed = vi.fn()
  const worker = createGatewayWorker({ command: 'unused', args: ['-m', 'nola_translator_engine.local_call'] } as never, {}, failed)
  child.stdout.write(JSON.stringify({ id: requests[0].id, result: {} }) + '\n')
  await worker.ready
  const delta = vi.fn(), events = vi.fn()
  worker.subscribe(events)
  const translated = worker.request({ op: 'translate' }, undefined, delta)
  const id = requests[1].id
  const event = { type: 'translation.delta', text: 'Hello' }
  child.stdout.write(JSON.stringify({ id, event }) + '\n')
  expect(delta).toHaveBeenCalledWith(expect.objectContaining({ id, event }))
  child.stdout.write(JSON.stringify({ session: 'session-1', event: { type: 'input_audio_buffer.speech_started' } }) + '\n')
  expect(events).toHaveBeenCalledWith(expect.objectContaining({ session: 'session-1' }))
  child.stdout.write(JSON.stringify({ id, result: { text: 'Hello' } }) + '\n')
  await expect(translated).resolves.toEqual({ text: 'Hello' })
  expect(failed).not.toHaveBeenCalled()
  const closing = worker.close()
  child.emit('close')
  await closing
})
