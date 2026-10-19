import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { initializeSessionLog, logDiagnostic, processFailure, registerLogSecret, sessionLogPath } from '../../../src/main/session-log'

const directories: string[] = []
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'nola-session-log-'))
  directories.push(path)
  return path
}
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })

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
