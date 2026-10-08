/**
 * Opens the user's default browser with **no URL**.
 *
 * `shell.openExternal()` is the obvious candidate and cannot do this: it takes a URL and validates
 * the protocol, and this app's contract is "open the browser", which carries none. Inventing a start
 * page here would turn a product decision into an implementation detail, so no URL is invented.
 *
 * The Windows route is therefore the shell association itself. `HKCU\...\UrlAssociations\http\
 * UserChoice\ProgId` names the handler the user actually chose, and that ProgId's `shell\open\
 * command` is the command line Windows runs for an `http` URL. Launching the executable it names,
 * with the arguments that are not the `%1` URL placeholder, is exactly what double-clicking a
 * shortcut does, and the browser opens on whatever start page it is configured with.
 *
 * Measured on Windows 10/11: `cmd /c start ""` opens a **console window** rather than a browser
 * — `start` with no command starts the shell itself — and `rundll32.exe url.dll,FileProtocolHandler`
 * with an empty argument launches nothing at all. Both were rejected on that evidence, so this
 * module spawns the browser executable directly, which is also the pattern `browser-integrations.ts`
 * already uses to launch a browser.
 *
 * Non-Windows has no equivalent file association to read here; the caller surfaces a refusal
 * instead of a wrong window opening.
 */
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const PROG_ID_KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice'
const OPEN_COMMAND_KEY = 'HKCR'

/**
 * Reads the current user's `http` handler. `UserChoice` is the authoritative key: Windows maintains
 * the `Hash` alongside it so it cannot be written directly, which is why this reads rather than sets.
 */
async function defaultBrowserProgId(): Promise<string> {
  const { stdout } = await run('reg.exe', ['query', PROG_ID_KEY, '/v', 'ProgId'], { windowsHide: true })
  const line = stdout.split(/\r?\n/).find((row) => row.includes('ProgId'))
  const progId = line?.trim().split(/\s+/).pop()
  if (!progId || progId === 'ProgId') throw new Error('no default http handler is registered')
  return progId
}

/**
 * The `%1` in an open command is the URL Windows is about to hand over. This call has none, so the
 * placeholder and the flag carrying it are dropped; the browser then starts on its own start page.
 * Quoted paths are split off first so a browser installed under `Program Files` survives intact.
 */
function parseOpenCommand(command: string): { executable: string; args: string[] } {
  const trimmed = command.trim()
  const quoted = trimmed.match(/^"([^"]+)"/)
  const executable = quoted ? quoted[1] : trimmed.split(/\s+/)[0]
  const rest = (quoted ? trimmed.slice(quoted[0].length) : trimmed.slice(executable.length)).trim()
  // Only URL-taking flags go; every other switch belongs to how this browser wants to be started.
  const args = rest.split(/\s+/).filter((token) => token && token !== '%1' && !/^--?(single-argument|url)$/i.test(token))
  if (!executable) throw new Error('default browser open command is empty')
  return { executable, args }
}

/**
 * Starts the browser and resolves once it is running. `detached` plus `stdio: 'ignore'` matches
 * `browser-integrations.ts`: the browser outlives the app, and inheriting a pipe it never drains
 * would keep this process alive behind it.
 */
export async function openDefaultBrowser(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('opening the default browser without a URL is implemented for Windows only')
  const progId = await defaultBrowserProgId()
  const { stdout } = await run('reg.exe', ['query', `${OPEN_COMMAND_KEY}\\${progId}\\shell\\open\\command`, '/ve'], { windowsHide: true })
  const line = stdout.split(/\r?\n/).find((row) => row.includes('REG_SZ'))
  const command = line?.trim().slice(line.indexOf('REG_SZ') + 'REG_SZ'.length).trim()
  if (!command) throw new Error('default browser open command is missing')
  const { executable, args } = parseOpenCommand(command)
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}