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
  initializeSessionLog(path, { version: 'test' })
  const first = sessionLogPath()
  registerLogSecret('opaque-credential-example')
  logDiagnostic('probe.failed', processFailure(Object.assign(new Error('opaque-credential-example sk-example123'), {
    code: -1073741515, stderr: 'missing.dll', stdout: 'Authorization: Bearer another-secret',
  })))
  const contents = await readFile(first, 'utf8')
  expect(contents).toContain('0xC0000135')
  expect(contents).toContain('missing.dll')
  for (const secret of ['opaque-credential-example', 'sk-example123', 'another-secret']) expect(contents).not.toContain(secret)
  initializeSessionLog(path, { version: 'next' })
  expect(sessionLogPath()).not.toBe(first)
  expect(await readdir(path)).toHaveLength(2)
})

it('retains only twenty launch logs and preserves unrelated files', async () => {
  const path = await directory()
  await writeFile(join(path, 'keep.txt'), 'unrelated')
  for (let index = 0; index < 25; index++) initializeSessionLog(path, { index })
  const names = await readdir(path)
  expect(names.filter(name => name.endsWith('.jsonl'))).toHaveLength(20)
  expect(names).toContain('keep.txt')
})

it('rolls over full logs without dropping subsequent activity and survives an unavailable directory', async () => {
  const path = await directory()
  initializeSessionLog(path, {})
  for (let index = 0; index < 400; index++) logDiagnostic('output', 'x'.repeat(16000))
  expect((await stat(sessionLogPath())).size).toBeLessThanOrEqual(4 * 1024 * 1024)
  logDiagnostic('operation.after-rollover', { finished: true })
  expect(await readFile(sessionLogPath(), 'utf8')).toContain('operation.after-rollover')
  expect((await readdir(path)).some(name => name.includes('-part-'))).toBe(true)
  const blocked = join(path, 'file')
  await writeFile(blocked, '')
  expect(() => initializeSessionLog(blocked, {})).not.toThrow()
  expect(() => logDiagnostic('failure')).not.toThrow()
})

it('writes structured English diagnostics and omits captured content', async () => {
  const path = await directory()
  initializeSessionLog(path, {})
  logDiagnostic('engine.event.caption', { sourceText: 'private speech', pcmBase64: 'private audio', message: '运行失败', revision: 3 })
  const contents = await readFile(sessionLogPath(), 'utf8')
  expect(contents).not.toMatch(/[^\x00-\x7F]/)
  expect(contents).not.toContain('private speech')
  expect(contents).not.toContain('private audio')
  expect(contents).toContain('originalBase64')
  expect(JSON.parse(contents.trim().split('\n').at(-1)!).data.revision).toBe(3)
})
