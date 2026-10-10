import { EventEmitter } from 'node:events'
import { createConnection, type Socket } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserConnection } from '../../../src/main/browser-connection'
import { SessionController } from '../../../src/main/session-controller'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { BROWSER_EXTENSION_ID, type BrowserResponse } from '../../../src/shared/browser'
import type { EngineProcess } from '../../../src/main/engine-process'
import type { EngineCommand } from '../../../src/shared/contracts'
import { ipcMain, dialog } from 'electron'
import { BrowserIntegrations } from '../../../src/main/browser-integrations'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir(), getAppPath: () => resolve('.') }, dialog: { showSaveDialog: vi.fn() }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
const disposers: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); vi.unstubAllEnvs() })

class TestEngine extends EventEmitter {
  currentState = 'ready'
  supports = () => true
  start = vi.fn(async () => { this.currentState = 'ready' })
  stop = vi.fn(async () => { this.currentState = 'stopped' })
  delayedAudio = false
  private acknowledgements: Array<() => void> = []
  request = vi.fn(async (command: EngineCommand) => {
    if (command.type === 'startSession') return { sessionId: 'session' }
    if (command.type === 'listDevices') return { devices: [{ kind: 'microphone', name: 'mic', deviceId: 'mic', isDefault: true }, { kind: 'systemOutput', name: 'speaker', deviceId: 'speaker', isDefault: true }] }
    if (command.type === 'pushAudio' && this.delayedAudio) await new Promise<void>(resolve => this.acknowledgements.push(resolve))
    if (command.type === 'stopSession') { for (const resolve of this.acknowledgements.splice(0)) resolve() }
    return {}
  })
}

async function fixture(integrations?: BrowserIntegrations) {
  const directory = await mkdtemp(join(tmpdir(), 'nola-browser-test-'))
  vi.stubEnv('LOCALAPPDATA', directory)
  const engine = new TestEngine()
  const typed = engine as unknown as EngineProcess
  const sessions = new SessionController({ engine: typed, meetings: null, getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', prepare: async () => {}, whenReady: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {} })
  engine.on('state', () => sessions.releaseOnLoss())
  const connection = new BrowserConnection({ engine: typed, sessions, integrations, getSettings: () => DEFAULT_SETTINGS, setEnabled: async () => {} })
  disposers.push(async () => { await connection.dispose(); await rm(directory, { recursive: true, force: true }) })
  await connection.setEnabled(true)
  connection.setCaptionServiceActive(true)
  const descriptor = JSON.parse(await readFile(join(directory, 'Nola/Browser/connection.json'), 'utf8')) as { pipe: string; token: string; extensionId: string; protocolVersion: number }
  return { connection, descriptor, engine, sessions, directory }
}
async function connect(pipe: string): Promise<Socket> {
  const socket = createConnection(pipe)
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  return socket
}
function responses(socket: Socket) {
  const values: BrowserResponse[] = []
  let buffered = ''
  socket.on('data', chunk => {
    buffered += chunk.toString()
    let end: number
    while ((end = buffered.indexOf('\n')) >= 0) { values.push(JSON.parse(buffered.slice(0, end)) as BrowserResponse); buffered = buffered.slice(end + 1) }
  })
  return values
}
function send(socket: Socket, value: unknown) { socket.write(`${JSON.stringify(value)}\n`) }
const start = { id: 'start', type: 'start', source: 'tab', streamId: 'stream', sourceLanguage: 'auto', targetLanguage: 'en', epoch: 0, videoTimeMs: 0, playbackRate: 1 }

describe('native pipe boundary', () => {
  it('answers repeated browser summaries without enumerating hardware devices', async () => {
    const f = await fixture()
    f.engine.emit('event', { protocolVersion: 1, type: 'devices', requestId: 'desktop-devices', devices: [{ kind: 'microphone', name: 'mic', deviceId: 'mic', isDefault: true }, { kind: 'systemOutput', name: 'speaker', deviceId: 'speaker', isDefault: true }] })
    const socket = await connect(f.descriptor.pipe); const values = responses(socket)
    send(socket, f.descriptor)
    for (let index = 0; index < 3; index++) send(socket, { id: `hello-${index}`, type: 'hello' })
    await expect.poll(() => values.length).toBe(3)
    expect(values).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'result', value: expect.objectContaining({ devices: [expect.objectContaining({ deviceId: 'speaker' })] }) })]))
    expect(f.engine.request).not.toHaveBeenCalled()
    socket.destroy()
  })
  it('does not re-enable after disable wins during browser detection', async () => {
    const integrations = new BrowserIntegrations({ localAppData: tmpdir(), userData: tmpdir() })
    const f = await fixture(integrations)
    await f.connection.setEnabled(false)
    let release = () => {}
    const inspect = vi.spyOn(integrations, 'inspect').mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const register = vi.spyOn(f.connection, 'register').mockResolvedValue()
    const initialization = f.connection.initialize(true)
    await expect.poll(() => inspect.mock.calls.length).toBe(1)
    await f.connection.setEnabled(false); release(); await initialization
    expect(f.connection.status().enabled).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })
  it('rejects a disabled browser and does not report it as connected', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-per-browser-'))
    disposers.push(() => rm(directory, { recursive: true, force: true }))
    const integrations = new BrowserIntegrations({ localAppData: directory, userData: directory })
    await integrations.setEnabled('edge', false)
    const f = await fixture(integrations)
    const socket = await connect(f.descriptor.pipe); const values = responses(socket)
    send(socket, f.descriptor); send(socket, { id: 'hello', type: 'hello', browser: 'edge' })
    await expect.poll(() => values.length).toBe(1)
    expect(values[0]).toMatchObject({ type: 'error', code: 'browserConnectionDisabled' })
    expect(f.connection.status().connections).toBe(0)
    expect(f.connection.status().browsers?.find(row => row.browser === 'edge')?.connected).toBe(false)
    expect(f.engine.request).not.toHaveBeenCalled()
    socket.destroy()
  })
  it.runIf(existsSync(resolve('release/Nola-Browser-Extension.zip')))('saves the bundled extension using a browser-specific filename and respects cancellation', async () => {
    await fixture()
    const handler = vi.mocked(ipcMain.handle).mock.calls.at(-1)![1]
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: true, filePath: '' })
    await handler({} as Electron.IpcMainInvokeEvent, 'download', undefined, 'edge')
    expect(dialog.showSaveDialog).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: join(tmpdir(), 'Nola-Edge-Extension.zip') }))
    const directory = await mkdtemp(join(tmpdir(), 'nola-download-'))
    disposers.push(() => rm(directory, { recursive: true, force: true }))
    const target = join(directory, 'download.zip')
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: false, filePath: target })
    await handler({} as Electron.IpcMainInvokeEvent, 'download', undefined, 'chrome')
    expect(await readFile(target)).toEqual(await readFile(resolve('release/Nola-Browser-Extension.zip')))
    await expect(handler({} as Electron.IpcMainInvokeEvent, 'download', undefined, 'firefox')).rejects.toThrow('invalidConfiguration')
  })
  it('rejects null before authentication without crashing the server', async () => {
    const f = await fixture()
    const socket = await connect(f.descriptor.pipe)
    const closed = new Promise<void>(resolve => socket.once('close', resolve))
    send(socket, null)
    await closed
    expect(f.connection.status().connections).toBe(0)
    const valid = await connect(f.descriptor.pipe)
    send(valid, { ...f.descriptor, extensionId: BROWSER_EXTENSION_ID })
    await expect.poll(() => f.connection.status().connections).toBe(1)
    valid.destroy()
  })
  it('filters microphones and rejects a different client session owner', async () => {
    const f = await fixture()
    f.engine.emit('event', { protocolVersion: 1, type: 'devices', requestId: 'desktop-devices', devices: [{ kind: 'microphone', name: 'mic', deviceId: 'mic', isDefault: true }, { kind: 'systemOutput', name: 'speaker', deviceId: 'speaker', isDefault: true }] })
    const socket = await connect(f.descriptor.pipe)
    const values = responses(socket)
    send(socket, f.descriptor)
    send(socket, { id: 'hello', type: 'hello' })
    await expect.poll(() => values.length).toBe(1)
    expect(values[0]).toMatchObject({ value: { devices: [{ kind: 'systemOutput', deviceId: 'speaker' }] } })
    send(socket, { id: 'wrong', type: 'stop', sessionId: 'other' })
    await expect.poll(() => values.length).toBe(2)
    expect(values[1]).toMatchObject({ type: 'error', code: 'sessionNotRunning' })
    socket.destroy()
  })
  it('bounds unacknowledged PCM to two seconds without starving stop', async () => {
    const f = await fixture()
    f.engine.delayedAudio = true
    const socket = await connect(f.descriptor.pipe)
    const values = responses(socket)
    send(socket, f.descriptor)
    send(socket, start)
    await expect.poll(() => values.some(value => value.type === 'result' && value.id === 'start')).toBe(true)
    const pcmBase64 = Buffer.alloc(3200).toString('base64')
    for (let sequence = 0; sequence < 11; sequence++) send(socket, { id: `audio-${sequence}`, type: 'audio', sessionId: 'session', streamId: 'stream', epoch: 0, sequence, sampleRate: 8000, capturedAtMs: sequence * 200, pcmBase64 })
    send(socket, { id: 'stop', type: 'stop', sessionId: 'session' })
    await expect.poll(() => values.some(value => value.type === 'error' && value.code === 'audioBufferOverflow')).toBe(true)
    await expect.poll(() => values.some(value => value.type === 'result' && value.id === 'stop')).toBe(true)
    expect(f.engine.request.mock.calls.filter(([command]) => command.type === 'pushAudio')).toHaveLength(10)
    socket.destroy()
  })
  it('does not restart a dead engine to stop a stale session', async () => {
    const f = await fixture()
    const socket = await connect(f.descriptor.pipe)
    const values = responses(socket)
    send(socket, f.descriptor); send(socket, start)
    await expect.poll(() => values.length).toBe(1)
    f.engine.currentState = 'recovering'
    f.engine.emit('state', 'recovering')
    await expect.poll(() => f.connection.status().connections).toBe(0)
    expect(f.engine.start).not.toHaveBeenCalled()
    expect(f.engine.stop).not.toHaveBeenCalled()
    socket.destroy()
  })
  it('fences initialization when disable wins during host registration', async () => {
    const f = await fixture()
    await f.connection.setEnabled(false)
    let release = () => {}
    const registration = vi.spyOn(f.connection, 'register').mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const initialization = f.connection.initialize(true)
    await expect.poll(() => registration.mock.calls.length).toBe(1)
    await f.connection.setEnabled(false)
    release()
    await initialization
    expect(f.connection.status().enabled).toBe(false)
    await expect(readFile(join(f.directory, 'Nola/Browser/connection.json'))).rejects.toThrow()
  })
  it('publishes a descriptor after overlapping enable requests', async () => {
    const f = await fixture()
    await f.connection.setEnabled(false)
    await Promise.all([f.connection.setEnabled(true), f.connection.setEnabled(true)])
    const descriptor = JSON.parse(await readFile(join(f.directory, 'Nola/Browser/connection.json'), 'utf8')) as { pipe: string }
    const socket = await connect(descriptor.pipe)
    socket.destroy()
    expect(f.connection.status().enabled).toBe(true)
  })
  it.runIf(process.platform === 'win32' && existsSync(resolve('artifacts/browser-host/NolaBrowserHost.exe')))('connects through the packaged native EXE and native length framing', async () => {
    const f = await fixture()
    const host = spawn(resolve('artifacts/browser-host/NolaBrowserHost.exe'), [`chrome-extension://${BROWSER_EXTENSION_ID}/`], { windowsHide: true, stdio: 'pipe' })
    disposers.push(async () => { host.stdin.end(); if (host.exitCode === null) host.kill() })
    let received = Buffer.alloc(0)
    let stderr = ''
    host.stderr.on('data', chunk => { stderr += chunk.toString() })
    host.stdout.on('data', chunk => { received = Buffer.concat([received, chunk]) })
    const body = Buffer.from(JSON.stringify({ id: 'native-hello', type: 'hello' }))
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length)
    host.stdin.write(Buffer.concat([header, body]))
    try {
      await expect.poll(() => received.length >= 4 ? received.length >= received.readUInt32LE(0) + 4 : false, { timeout: 10_000 }).toBe(true)
    } catch { throw new Error(`Native host failed: exit=${host.exitCode}, stderr=${stderr}, connections=${f.connection.status().connections}`) }
    const response = JSON.parse(received.subarray(4, 4 + received.readUInt32LE(0)).toString()) as BrowserResponse
    expect(response).toMatchObject({ type: 'result', id: 'native-hello', value: { browserAudio: true } })
    expect(stderr).toBe('')
    host.stdin.end()
    await expect.poll(() => f.connection.status().connections).toBe(0)
  }, 15_000)
})
