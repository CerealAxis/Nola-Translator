import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ isPackaged: true, getPath: vi.fn(), getAppPath: vi.fn() }))
vi.mock('electron', () => ({ app: electron }))
import { clearDataRootPointer, defaultDataRoot, legacyDefaultDataRoot, readPendingDataMigration, resolveDataRoot, setSessionDataRoot, writeDataRootPointer, writePendingDataMigration } from '../../../src/main/data-root'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nola-data-root-'))
  vi.stubEnv('LOCALAPPDATA', join(root, 'Local'))
  electron.isPackaged = true
  electron.getAppPath.mockReturnValue(root)
  electron.getPath.mockImplementation((name: string) => name === 'exe'
    ? join(root, 'custom', 'App', 'Nola Translator.exe') : join(root, name))
})
afterEach(() => { setSessionDataRoot(null); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })

it('keeps Data beside App at the actual custom installation location', () => {
  expect(defaultDataRoot()).toBe(join(root, 'custom', 'Data'))
  expect(legacyDefaultDataRoot()).toBe(join(root, 'Local', 'Programs', 'Nola Translator'))
})
it('uses Data inside a flat installation instead of its parent', () => {
  electron.getPath.mockReturnValue(join(root, 'custom', 'Nola Translator.exe'))
  expect(defaultDataRoot()).toBe(join(root, 'custom', 'Data'))
})
it('honors an explicit data location saved by the affected release', () => {
  const legacy = join(root, 'Local', 'Programs', 'Nola Translator')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'data-location.json'), JSON.stringify({ dataRoot: join(root, 'chosen') }))
  expect(resolveDataRoot()).toBe(join(root, 'chosen'))
})
it('keeps development data in the repository', () => {
  electron.isPackaged = false
  expect(defaultDataRoot()).toBe(root)
})
it('keeps all consumers on the source after a failed restoration while allowing a new user choice', () => {
  const source = join(root, 'old')
  setSessionDataRoot(source)
  expect(resolveDataRoot()).toBe(source)
  writeDataRootPointer(join(root, 'chosen'))
  expect(resolveDataRoot()).toBe(join(root, 'chosen'))
})
it('clears both pointer locations so an old location cannot reappear', () => {
  const legacy = join(root, 'Local', 'Programs', 'Nola Translator')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'data-location.json'), JSON.stringify({ dataRoot: join(root, 'old') }))
  writeDataRootPointer(join(root, 'new'))
  clearDataRootPointer()
  expect(resolveDataRoot()).toBe(join(root, 'custom', 'Data'))
})
it('reads older migration markers and persists the completed-copy phase', () => {
  const legacy = join(root, 'Local', 'Programs', 'Nola Translator')
  mkdirSync(legacy, { recursive: true })
  const from = join(root, 'old')
  writeFileSync(join(legacy, 'data-migration-pending.json'), JSON.stringify({ from }))
  expect(readPendingDataMigration()).toEqual({ from, extra: [], copied: false })
  writePendingDataMigration(from, [], true)
  expect(readPendingDataMigration()).toEqual({ from, extra: [], copied: true })
})
