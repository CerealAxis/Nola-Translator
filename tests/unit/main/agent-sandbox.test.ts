import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileMock = vi.fn()
const fixtureDirs: string[] = []
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, default: { ...actual, execFile: execFileMock }, execFile: execFileMock }
})

async function createCliFixture(withHelper = true) {
  const directory = await mkdtemp(join(tmpdir(), 'nola-agent-sandbox-'))
  fixtureDirs.push(directory)
  const cliPath = join(directory, 'codex.exe')
  await writeFile(cliPath, '')
  if (withHelper) await writeFile(join(directory, 'codex-code-mode-host.exe'), '')
  return { directory, cliPath }
}

describe('agent sandbox', () => {
  afterEach(async () => {
    await Promise.all(fixtureDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('launches commands through the native workspace permission profile', async () => {
    const fixture = await createCliFixture()
    vi.stubEnv('NOLA_CODEX_SANDBOX_CLI', fixture.cliPath)
    execFileMock.mockImplementation((_file, _args, _options, callback) => callback(null, 'NOLA_CODEX_SANDBOX_READY', ''))

    const { runSandboxCommand } = await import('../../../src/main/agent-sandbox')
    const projectPath = process.cwd()
    const result = await runSandboxCommand(projectPath, 'echo hello', new AbortController().signal)

    expect(result).toEqual({ exitCode: 0, output: 'NOLA_CODEX_SANDBOX_READY' })
    const [exe, args, options] = execFileMock.mock.calls.at(-1)!
    expect(exe).toMatch(/codex\.exe$/i)
    expect(args).toContain('--include-managed-config')
    expect(args).toContain(':workspace')
    expect(args.slice(-5)).toEqual(['cmd.exe', '/d', '/s', '/c', 'echo hello'])
    expect(options).toMatchObject({ shell: false, windowsHide: true, cwd: projectPath })
  })

  it('fails closed when the native helper is missing', async () => {
    const fixture = await createCliFixture(false)
    vi.stubEnv('NOLA_CODEX_SANDBOX_CLI', fixture.cliPath)

    const { sandboxStatus, runSandboxCommand } = await import('../../../src/main/agent-sandbox')
    const status = await sandboxStatus()
    expect(status.available).toBe(false)
    expect(status.reason).toContain('host helper is missing')
    await expect(runSandboxCommand('C:\\work\\project', 'echo hello', new AbortController().signal)).rejects.toThrow('Sandbox unavailable')
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('rejects an already cancelled command before launching', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const { runSandboxCommand } = await import('../../../src/main/agent-sandbox')
    await expect(runSandboxCommand('C:\\work\\project', 'echo hello', controller.signal)).rejects.toThrow('cancelled')
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('terminates the launcher process tree when a command is cancelled', async () => {
    const fixture = await createCliFixture()
    vi.stubEnv('NOLA_CODEX_SANDBOX_CLI', fixture.cliPath)
    const child = { pid: 4321, kill: vi.fn() }
    let commandCallback: ((error: Error | null, stdout: string, stderr: string) => void) | undefined
    execFileMock.mockImplementation((file, args, _options, callback) => {
      if (file === fixture.cliPath && args.at(-1) === `echo NOLA_CODEX_SANDBOX_READY`) {
        callback(null, 'NOLA_CODEX_SANDBOX_READY', '')
        return child
      }
      if (file === fixture.cliPath) {
        commandCallback = callback
        return child
      }
      callback(null, '', '')
      commandCallback?.(Object.assign(new Error('killed'), { killed: true }), '', '')
      return undefined
    })

    const controller = new AbortController()
    const { runSandboxCommand } = await import('../../../src/main/agent-sandbox')
    const result = runSandboxCommand(process.cwd(), 'echo work', controller.signal)
    await vi.waitFor(() => expect(commandCallback).toBeTypeOf('function'))
    controller.abort(new Error('cancelled'))
    await expect(result).rejects.toThrow('cancelled')

    const taskkillCall = execFileMock.mock.calls.find(([file]) => String(file).endsWith('taskkill.exe'))
    expect(taskkillCall?.[1]).toEqual(['/PID', '4321', '/T', '/F'])
    expect(taskkillCall?.[2]).toMatchObject({ shell: false, windowsHide: true })
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('does not launch a command cancelled while the sandbox status probe is running', async () => {
    const fixture = await createCliFixture()
    vi.stubEnv('NOLA_CODEX_SANDBOX_CLI', fixture.cliPath)
    const controller = new AbortController()
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, 'NOLA_CODEX_SANDBOX_READY', '')
      controller.abort(new Error('cancelled during probe'))
    })

    const { runSandboxCommand } = await import('../../../src/main/agent-sandbox')
    await expect(runSandboxCommand(process.cwd(), 'echo must not run', controller.signal)).rejects.toThrow('cancelled during probe')
    expect(execFileMock).toHaveBeenCalledOnce()
  })
})
