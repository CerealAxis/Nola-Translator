import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { afterEach, expect, it } from 'vitest'
import { backendFailure, readBackendFailure } from '../../../src/main/backend-error'
import { initializeSessionLog, logDiagnostic, logPythonStderr, processFailure, registerLogSecret, sessionLogPath } from '../../../src/main/session-log'

const directories: string[] = []
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'nola-session-log-'))
  directories.push(path)
  return path
}
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })

it('preserves oversized original errors in reconstructable bounded records', async () => {
  await initializeSessionLog(await directory(), {})
  const message = 'HEAD-' + '原始报错'.repeat(40000) + '-TAIL api_key=private-value'
  logDiagnostic('native.failed', new Error(message))
  const lines = (await readFile(sessionLogPath(), 'utf8')).trim().split('\n').filter(line => JSON.parse(line).event === 'native.failed')
  expect(lines.length).toBeGreaterThan(1)
  expect(lines.every(line => Buffer.byteLength(line) < 256 * 1024)).toBe(true)
  const parts = lines.map(line => JSON.parse(line).data)
  expect(new Set(parts.map(part => part.entryId)).size).toBe(1)
  expect(parts.map(part => part.part)).toEqual(parts.map((_, index) => index))
  const data = JSON.parse(parts.map(part => part.serializedData).join(''))
  expect(data.message).toBe(message.replace('private-value', '[redacted]'))
  expect(lines.join('')).not.toContain('private-value')
})

it('preserves aggregate and deep original causes without looping on circular errors', async () => {
  await initializeSessionLog(await directory(), {})
  let cause = new Error('native root')
  for (let index = 0; index < 10; index++) cause = new Error(`wrapper-${index}`, { cause })
  const circular = new Error('circular failure')
  circular.cause = circular
  logDiagnostic('aggregate.failed', new AggregateError([cause, circular], 'multiple failures'))
  let pythonCause: Record<string, unknown> = { message: 'original Python root' }
  for (let index = 0; index < 10; index++) pythonCause = { cause: pythonCause }
  logDiagnostic('python.failed', pythonCause)
  const contents = await readFile(sessionLogPath(), 'utf8')
  expect(contents).toContain('native root')
  expect(contents).toContain('[circular]')
  expect(contents).toContain('original Python root')
})

it('records the classified v2 failure and its safe Python metadata in the same log entry', async () => {
  await initializeSessionLog(await directory(), {})
  const error = await readBackendFailure(Response.json({ error: {
    code: 'MODEL_NOT_READY', message_key: 'gateway.LOAD_FAILED', stage: 'vad',
    scope: 'session', correlation_id: 'request-id', retryable: false, fatal: false,
    safe_details: { exception: 'GatewayError', cause_exception: 'Fail', errno: -9999, transcript: 'private speech' },
  } }))
  expect(error).toBeDefined()
  logDiagnostic('session.start.failed', { error: backendFailure(error!) })
  const contents = await readFile(sessionLogPath(), 'utf8')
  expect(JSON.parse(contents.trim().split('\n').at(-1)!).data.error).toMatchObject({
    engineCode: 'vadUnavailable', supportCode: 'ASR-009', backendCode: 'MODEL_NOT_READY', stage: 'vad',
    messageKey: 'gateway.LOAD_FAILED', correlationId: 'request-id',
    safeDetails: { exception: 'GatewayError', cause_exception: 'Fail', errno: -9999 },
  })
  expect(contents).not.toContain('private speech')
})

it('parses split UTF-8 Python stderr records and omits private payloads from broken records', async () => {
  await initializeSessionLog(await directory(), {})
  const stream = new PassThrough()
  logPythonStderr(stream, 'backend')
  const prefix = 'NOLA_DIAGNOSTIC '
  const line = Buffer.from(prefix + JSON.stringify({
    layer: 'engine', event: 'audio.capture.failed', data: { message: '设备不可用', transcript: 'private speech' },
  }) + '\n')
  const split = line.indexOf(Buffer.from('设')) + 1
  stream.write(line.subarray(0, split))
  const ended = once(stream, 'end')
  stream.end(Buffer.concat([line.subarray(split), Buffer.from(prefix + '{ "text":"broken private input"')]))
  await ended
  const contents = await readFile(sessionLogPath(), 'utf8')
  expect(contents).toContain('pipeline.engine.audio.capture.failed')
  expect(contents).toContain('设备不可用')
  expect(contents).toContain('backend.stderr.diagnostic-invalid')
  expect(contents).not.toMatch(/private speech|broken private input/)
})
it('creates independent launch logs and preserves Windows crash details without credentials', async () => {
  const path = await directory()
  await initializeSessionLog(path, { version: 'test' })
  const first = sessionLogPath()
  registerLogSecret('opaque-credential-example')
  logDiagnostic('probe.failed', processFailure(Object.assign(new Error('opaque-credential-example sk-example123'), {
    code: -1073741515, stderr: 'missing.dll', stdout: 'Authorization: Bearer another-secret',
  })))
  const contents = await readFile(first, 'utf8')
  expect(contents).toContain('0xC0000135')
  expect(contents).toContain('stderrBytes')
  expect(contents).toContain('missing.dll')
  for (const privateValue of ['opaque-credential-example', 'sk-example123', 'another-secret']) expect(contents).not.toContain(privateValue)
  await initializeSessionLog(path, { version: 'next' })
  expect(sessionLogPath()).not.toBe(first)
  expect(await readdir(path)).toHaveLength(2)
})

it('retains only five launch logs and preserves unrelated files', async () => {
  const path = await directory()
  await writeFile(join(path, 'keep.txt'), 'unrelated')
  for (let index = 0; index < 25; index++) await initializeSessionLog(path, { index })
  const names = await readdir(path)
  expect(names.filter(name => name.endsWith('.jsonl') || name.endsWith('.jsonl.gz'))).toHaveLength(5)
  expect(names).toContain('keep.txt')
})

it('keeps one unsplit launch log regardless of size and survives an unavailable directory', async () => {
  const path = await directory()
  await initializeSessionLog(path, {})
  for (let index = 0; index < 400; index++) logDiagnostic('output', 'x'.repeat(16000))
  expect((await stat(sessionLogPath())).size).toBeGreaterThan(4 * 1024 * 1024)
  logDiagnostic('operation.after-rollover', { finished: true })
  expect(await readFile(sessionLogPath(), 'utf8')).toContain('operation.after-rollover')
  expect((await readdir(path)).filter(name => name.endsWith('.jsonl'))).toHaveLength(1)
  const blocked = join(path, 'file')
  await writeFile(blocked, '')
  expect(() => initializeSessionLog(blocked, {})).not.toThrow()
  expect(() => logDiagnostic('failure')).not.toThrow()
})

it('preserves readable diagnostics and device identifiers while omitting speech and translation content', async () => {
  const path = await directory()
  await initializeSessionLog(path, {})
  logDiagnostic('engine.event.caption', { sourceText: 'private speech', translatedText: 'private translation',
    pcmBase64: 'private audio', prompt: 'private translation prompt', message: '运行失败', revision: 3,
    deviceId: 'wasapi:systemOutput:example', reason: '原始设备异常', errorDetail: 'native host error',
    notes: 'private meeting notes', title: 'private meeting title' })
  const contents = await readFile(sessionLogPath(), 'utf8')
  expect(contents).toContain('运行失败')
  expect(contents).toContain('原始设备异常')
  expect(contents).toContain('wasapi:systemOutput:example')
  expect(contents).toContain('native host error')
  expect(contents).not.toContain('private meeting notes')
  expect(contents).not.toContain('private meeting title')
  expect(contents).not.toContain('private speech')
  expect(contents).not.toContain('private audio')
  expect(contents).not.toContain('private translation')
  expect(JSON.parse(contents.trim().split('\n').at(-1)!).data.revision).toBe(3)
})

it('preserves original exceptions, nested causes and process output while redacting credentials', async () => {
  const path = await directory()
  await initializeSessionLog(path, {})
  const cause = new Error('原始 WASAPI 错误')
  const error = Object.assign(new Error('采集启动失败', { cause }), {
    stderr: 'PortAudio initialization failed; api_key=private-key', stdout: 'probe output', code: -9999,
  })
  logDiagnostic('audio.capture.failed', error)
  const contents = await readFile(sessionLogPath(), 'utf8')
  const data = JSON.parse(contents.trim().split('\n').at(-1)!).data
  expect(data.message).toBe('采集启动失败')
  expect(data.cause.message).toBe('原始 WASAPI 错误')
  expect(data.stackFrames).toContain('session-log.test.ts')
  expect(data.stderr).toContain('PortAudio initialization failed')
  expect(data.stdout).toBe('probe output')
  expect(data.code).toBe(-9999)
  expect(contents).not.toContain('private-key')
})
