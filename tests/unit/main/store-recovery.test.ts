import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentWorkspace } from '../../../src/main/agent-workspace'
import { SettingsStore } from '../../../src/main/settings-store'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

const failures = vi.hoisted(() => ({ read: false, rename: false }))

vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {} }))
vi.mock('../../../src/main/agent-sandbox', () => ({ sandboxStatus: async () => ({ available: false }), runSandboxCommand: vi.fn() }))
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>()
  const mocked = { ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      if (failures.read) { failures.read = false; return Promise.reject(Object.assign(new Error('blocked'), { code: 'EACCES' })) }
      return actual.readFile(...args)
    },
    rename: (...args: Parameters<typeof actual.rename>) => {
      if (failures.rename) { failures.rename = false; return Promise.reject(new Error('busy')) }
      return actual.rename(...args)
    },
  }
  return { ...mocked, default: mocked }
})
afterEach(() => { failures.read = false; failures.rename = false })

it('keeps an existing workspace file intact when the atomic replacement fails', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'nola-workspace-'))
  try {
    const path = join(directory, 'workspace.json')
    const original = JSON.stringify({ projects: [], selected: null, disabledSkills: [], subagents: [] })
    await fs.writeFile(path, original)
    const workspace = new AgentWorkspace(directory)
    await workspace.snapshot()
    failures.rename = true
    await expect(workspace.action({ action: 'selectProject', id: null })).rejects.toThrow('busy')
    expect(await fs.readFile(path, 'utf8')).toBe(original)
    expect(await fs.readdir(directory)).toEqual(['workspace.json'])
    await workspace.action({ action: 'selectProject', id: null })
    expect(JSON.parse(await fs.readFile(path, 'utf8'))).toMatchObject({ selected: null })
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

it('retries a workspace read after a transient failure', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'nola-workspace-read-'))
  try {
    await fs.writeFile(join(directory, 'workspace.json'), JSON.stringify({ projects: [], selected: null }))
    const workspace = new AgentWorkspace(directory)
    failures.read = true
    await expect(workspace.snapshot()).rejects.toThrow('blocked')
    await expect(workspace.snapshot()).resolves.toMatchObject({ projects: [], selectedProject: null })
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

it('blocks settings writes until an unreadable settings file has loaded successfully', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'nola-settings-read-'))
  try {
    const path = join(directory, 'settings.json')
    const original = JSON.stringify({ ...DEFAULT_SETTINGS, uiLanguage: 'ja' })
    await fs.writeFile(path, original)
    const settings = new SettingsStore(path)
    failures.read = true
    await expect(settings.load()).rejects.toThrow('blocked')
    await expect(settings.update({ uiLanguage: 'en' })).rejects.toThrow('blocked')
    expect(await fs.readFile(path, 'utf8')).toBe(original)
    await expect(settings.load()).resolves.toMatchObject({ uiLanguage: 'ja' })
    await expect(settings.update({ uiLanguage: 'en' })).resolves.toMatchObject({ uiLanguage: 'en' })
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
