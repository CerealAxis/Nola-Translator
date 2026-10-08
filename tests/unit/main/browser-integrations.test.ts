import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserIntegrations } from '../../../src/main/browser-integrations'
import { BROWSER_EXTENSION_ID } from '../../../src/shared/browser'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nola-integrations-')); directories.push(root)
  const chrome = join(root, 'chrome.exe'); const edge = join(root, 'edge.exe')
  await writeFile(chrome, ''); await writeFile(edge, '')
  const launch = vi.fn(async () => {})
  const options = { localAppData: root, userData: join(root, 'nola'), executablePaths: { chrome: [chrome], edge: [edge] }, launch }
  return { root, options, integrations: new BrowserIntegrations(options), launch, chrome }
}
async function preferences(root: string, browser: 'Chrome' | 'Edge', filename: string, value: unknown) {
  const directory = join(root, browser === 'Chrome' ? 'Google' : 'Microsoft', browser, 'User Data', 'Default')
  await mkdir(directory, { recursive: true }); await writeFile(join(directory, filename), JSON.stringify(value))
}
it('reports actual extension state independently for each browser', async () => {
  const f = await fixture()
  await preferences(f.root, 'Chrome', 'Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { state: 1 } } } })
  await f.integrations.inspect()
  expect(f.integrations.snapshot).toMatchObject([{ browser: 'chrome', available: true, extensionStatus: 'installed' }, { browser: 'edge', extensionStatus: 'notInstalled' }])
})
it('uses secure state ahead of stale preferences and treats corrupt data as unknown', async () => {
  const f = await fixture()
  await preferences(f.root, 'Chrome', 'Secure Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { state: 0 } } } })
  await preferences(f.root, 'Chrome', 'Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { state: 1 } } } })
  await preferences(f.root, 'Edge', 'Preferences', {})
  await writeFile(join(f.root, 'Microsoft/Edge/User Data/Default/Preferences'), '{')
  await f.integrations.inspect()
  expect(f.integrations.snapshot.map(row => row.extensionStatus)).toEqual(['disabled', 'unknown'])
})
it('supports current Chromium disable reasons without a state field and legacy uninstall markers', async () => {
  const f = await fixture()
  await preferences(f.root, 'Chrome', 'Secure Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { path: 'nola', location: 4, disable_reasons: [] } } } })
  await preferences(f.root, 'Edge', 'Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { path: 'nola', location: 4, disable_reasons: [1] } } } })
  await f.integrations.inspect()
  expect(f.integrations.snapshot.map(row => row.extensionStatus)).toEqual(['installed', 'disabled'])
  await preferences(f.root, 'Chrome', 'Secure Preferences', { extensions: { settings: { [BROWSER_EXTENSION_ID]: { state: 2 } } } })
  await f.integrations.inspect()
  expect(f.integrations.snapshot[0].extensionStatus).toBe('notInstalled')
})
it('opens the requested browser management page without changing browser preferences', async () => {
  const f = await fixture()
  await f.integrations.manage('chrome')
  expect(f.launch).toHaveBeenCalledWith(f.chrome, `chrome://extensions/?id=${BROWSER_EXTENSION_ID}`)
  await rm(f.chrome); await expect(f.integrations.manage('chrome')).rejects.toThrow('browserNotFound')
})
it('serializes preference changes and restores both independent switches', async () => {
  const f = await fixture()
  await Promise.all([f.integrations.setEnabled('chrome', false), f.integrations.setEnabled('edge', false)])
  expect(JSON.parse(await readFile(join(f.options.userData, 'browser-integrations.json'), 'utf8'))).toEqual({ chrome: false, edge: false })
  const restored = new BrowserIntegrations(f.options); await restored.inspect()
  expect(restored.snapshot.map(row => row.enabled)).toEqual([false, false])
})
