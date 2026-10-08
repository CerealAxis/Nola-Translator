import { access, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { BROWSER_EXTENSION_ID, type BrowserIntegrationInfo, type BrowserKind } from '../shared/browser'

export interface BrowserIntegrationsOptions {
  localAppData: string
  userData: string
  executablePaths?: Record<BrowserKind, string[]>
  launch?: (executable: string, url: string) => Promise<void>
}
const browsers: BrowserKind[] = ['chrome', 'edge']
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
async function json(path: string): Promise<Record<string, unknown> | null> {
  try { return object(JSON.parse(await readFile(path, 'utf8'))) } catch { return null }
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
async function launch(executable: string, url: string): Promise<void> {
  const child = spawn(executable, ['--new-window', url], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}
/** Read extension state only; Chrome protects preference writes with integrity checks. */
export class BrowserIntegrations {
  private enabled: Record<BrowserKind, boolean> = { chrome: true, edge: true }
  private executables: Partial<Record<BrowserKind, string>> = {}
  private writes: Promise<void> = Promise.resolve()
  private rows: BrowserIntegrationInfo[] = []
  private initialized = false
  private refresh: Promise<void> | null = null
  constructor(private readonly options: BrowserIntegrationsOptions) {}
  get snapshot(): BrowserIntegrationInfo[] { return this.rows.map(row => ({ ...row, enabled: this.enabled[row.browser] })) }
  allows(browser: BrowserKind): boolean { return this.enabled[browser] }
  async inspect(): Promise<void> {
    if (this.refresh) return this.refresh
    const task = this.readState()
    this.refresh = task
    try { await task } finally { if (this.refresh === task) this.refresh = null }
  }
  private async readState(): Promise<void> {
    if (!this.initialized) {
      const saved = await json(join(this.options.userData, 'browser-integrations.json'))
      for (const browser of browsers) if (typeof saved?.[browser] === 'boolean') this.enabled[browser] = saved[browser]
      this.initialized = true
    }
    const executablePaths = this.options.executablePaths ?? {
      chrome: [join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'), join(this.options.localAppData, 'Google/Chrome/Application/chrome.exe')],
      edge: [join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'), join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'), join(this.options.localAppData, 'Microsoft/Edge/Application/msedge.exe')],
    }
    this.rows = await Promise.all(browsers.map(async browser => {
      const paths = await Promise.all(executablePaths[browser].map(async path => await exists(path) ? path : null))
      const executable = paths.find(path => path !== null)
      if (executable) this.executables[browser] = executable
      else delete this.executables[browser]
      const root = join(this.options.localAppData, browser === 'chrome' ? 'Google/Chrome/User Data' : 'Microsoft/Edge/User Data')
      return { browser, available: !!executable, extensionStatus: await this.extensionState(root, BROWSER_EXTENSION_ID), connected: false, enabled: this.enabled[browser] }
    }))
  }
  private async extensionState(root: string, id: string): Promise<BrowserIntegrationInfo['extensionStatus']> {
    let profiles: string[]
    try { profiles = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^(Default|Profile \d+)$/.test(entry.name)).map(entry => entry.name) } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'notInstalled' : 'unknown' }
    let disabled = false; let unknown = false
    for (const profile of profiles) {
      for (const filename of ['Secure Preferences', 'Preferences']) {
        const path = join(root, profile, filename)
        if (!await exists(path)) continue
        const preferences = await json(path)
        if (!preferences) { unknown = true; continue }
        const entry = object(object(object(preferences.extensions)?.settings)?.[id])
        if (!entry) continue
        // Chromium extension_prefs.cc uses disable_reasons; legacy Extension::State is 0/1/2 (disabled/enabled/uninstalled).
        if (entry.state === 2) break
        const reasons = entry.disable_reasons
        const validReasons = reasons === undefined || (typeof reasons === 'number' && Number.isInteger(reasons) && reasons >= 0) || (Array.isArray(reasons) && reasons.every(reason => typeof reason === 'number' && Number.isInteger(reason) && reason >= 0))
        const hasReasons = typeof reasons === 'number' ? reasons > 0 : Array.isArray(reasons) && reasons.some(reason => reason > 0)
        const installRecord = typeof entry.path === 'string' && entry.path.length > 0 && typeof entry.location === 'number'
        if (!validReasons) unknown = true
        else if (entry.state === 0 || hasReasons) disabled = true
        else if (entry.state === 1 || (entry.state === undefined && installRecord)) return 'installed'
        else unknown = true
        // Secure Preferences is authoritative when it contains this extension.
        break
      }
    }
    return disabled ? 'disabled' : unknown ? 'unknown' : 'notInstalled'
  }
  async setEnabled(browser: BrowserKind, enabled: boolean): Promise<void> {
    await this.inspect()
    const task = this.writes.catch(() => undefined).then(async () => {
      const next = { ...this.enabled, [browser]: enabled }
      await mkdir(this.options.userData, { recursive: true })
      await writeFile(join(this.options.userData, 'browser-integrations.json'), JSON.stringify(next))
      this.enabled = next
    })
    this.writes = task
    await task
  }
  async manage(browser: BrowserKind): Promise<void> {
    await this.inspect()
    const executable = this.executables[browser]
    if (!executable) throw new Error('browserNotFound')
    const url = `${browser === 'chrome' ? 'chrome' : 'edge'}://extensions/?id=${BROWSER_EXTENSION_ID}`
    await (this.options.launch ?? launch)(executable, url)
  }
}
