import { execFile, type ChildProcess } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const MAX_OUTPUT_BYTES = 1024 * 1024
const COMMAND_TIMEOUT_MS = 120_000
const PROBE_TIMEOUT_MS = 8_000
const STATUS_TTL_MS = 15_000
const PROBE_TOKEN = 'NOLA_CODEX_SANDBOX_READY'

interface CommandResult {
  exitCode: number
  output: string
}

let cachedStatus: { checkedAt: number; result: Awaited<ReturnType<typeof sandboxStatus>> } | undefined

function candidateCliPaths(): string[] {
  const candidates = [process.env.NOLA_CODEX_SANDBOX_CLI]
  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'))
  }
  return candidates.filter((value): value is string => Boolean(value))
}

async function resolveCliPath(): Promise<string> {
  if (process.platform !== 'win32') throw new Error('The native Codex Windows sandbox is only available on Windows')
  for (const candidate of candidateCliPaths()) {
    try {
      const resolved = await realpath(candidate)
      const info = await stat(resolved)
      if (info.isFile()) return resolved
    } catch {
      // Try the next fixed or administrator-configured installation path.
    }
  }
  throw new Error('OpenAI Codex CLI was not found; install it or set NOLA_CODEX_SANDBOX_CLI in the main-process environment')
}

function execute(cliPath: string, projectPath: string, command: string, signal: AbortSignal | undefined, timeout: number): Promise<CommandResult> {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Command cancelled')
  const args = [
    '-C', projectPath,
    'sandbox',
    '--include-managed-config',
    '--permission-profile', ':workspace',
    '--', 'cmd.exe', '/d', '/s', '/c', command,
  ]
  return new Promise((resolve, reject) => {
    let stopReason: Error | undefined
    let stopping = false
    let child: ChildProcess | undefined
    const killProcessTree = () => {
      if (stopping) return
      stopping = true
      const pid = child?.pid
      if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
        child?.kill()
        return
      }
      const systemRoot = process.env.SystemRoot || 'C:\\Windows'
      execFile(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        shell: false,
        timeout: 5_000,
        encoding: 'utf8',
      }, () => {
        // taskkill handles the descendant tree; this is a fallback if it cannot reach the launcher.
        child?.kill()
      })
    }
    const onAbort = () => {
      stopReason = signal?.reason instanceof Error ? signal.reason : new Error('Command cancelled')
      killProcessTree()
    }
    const timer = setTimeout(() => {
      stopReason = new Error('Sandbox command timed out')
      killProcessTree()
    }, timeout)
    signal?.addEventListener('abort', onAbort, { once: true })
    child = execFile(cliPath, args, {
      cwd: projectPath,
      windowsHide: true,
      shell: false,
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      const output = `${stdout}${stderr ? `${stdout ? '\n' : ''}${stderr}` : ''}`.slice(-MAX_OUTPUT_BYTES)
      if (stopReason) {
        reject(new Error(`${stopReason.message}${output ? `\n${output.slice(-4000)}` : ''}`))
        return
      }
      if (error) {
        const exitCode = typeof error.code === 'number' ? error.code : 1
        if (typeof error.code === 'number' && !error.killed && !error.signal) resolve({ exitCode, output })
        else reject(new Error(output.slice(-4000) || error.message))
        return
      }
      resolve({ exitCode: 0, output })
    })
    if (signal?.aborted) onAbort()
  })
}

async function resolveProjectDirectory(projectPath: string): Promise<string> {
  const resolved = await realpath(projectPath)
  if (!(await stat(resolved)).isDirectory()) throw new Error('The selected project path is not a directory')
  return resolved
}

export async function sandboxStatus(): Promise<{ available: boolean; backend: string; reason?: string }> {
  if (cachedStatus && Date.now() - cachedStatus.checkedAt < STATUS_TTL_MS) return cachedStatus.result
  let result: Awaited<ReturnType<typeof sandboxStatus>>
  try {
    const cliPath = await resolveCliPath()
    const hostPath = join(dirname(cliPath), 'codex-code-mode-host.exe')
    if (!(await stat(hostPath).then(info => info.isFile()).catch(() => false))) {
      throw new Error('The Codex Windows sandbox host helper is missing beside codex.exe')
    }
    const projectPath = await resolveProjectDirectory(process.cwd())
    const probe = await execute(cliPath, projectPath, `echo ${PROBE_TOKEN}`, undefined, PROBE_TIMEOUT_MS)
    if (probe.exitCode !== 0 || !probe.output.includes(PROBE_TOKEN)) {
      throw new Error('The Codex Windows sandbox probe did not complete successfully')
    }
    result = { available: true, backend: 'OpenAI Codex native Windows sandbox' }
  } catch (error) {
    result = {
      available: false,
      backend: 'OpenAI Codex native Windows sandbox',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  cachedStatus = { checkedAt: Date.now(), result }
  return result
}

export async function runSandboxCommand(projectPath: string, command: string, signal: AbortSignal): Promise<CommandResult> {
  if (!command.trim()) throw new Error('A command is required')
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Command cancelled')
  const status = await sandboxStatus()
  if (!status.available) throw new Error(`Sandbox unavailable: ${status.reason ?? 'unknown error'}`)
  const cliPath = await resolveCliPath()
  const root = await resolveProjectDirectory(projectPath)
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Command cancelled')
  return execute(cliPath, root, command, signal, COMMAND_TIMEOUT_MS)
}
