import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserWindow, WebContents } from 'electron'
import type { LanguageModelServices } from '../../../src/main/language-model'
import { FeatureActivity } from '../../../src/main/feature-activity'

const ipc = vi.hoisted(() => ({ allowed: null as ((sender: WebContents) => boolean) | null,
  running: null as ((running: boolean) => void) | null, cancelAll: vi.fn(async () => {}) }))
vi.mock('electron', () => ({ app: {} }))
vi.mock('../../../src/main/language-model', () => ({ registerLanguageModelIpc: (_services: unknown, allowed: typeof ipc.allowed, running: typeof ipc.running) => {
  ipc.allowed = allowed
  ipc.running = running
  return { cancelAll: ipc.cancelAll }
} }))
import { registerWorkbench } from '../../../src/main/workbench'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

it('allows model calls only from the trusted main document, including while another route is visible', () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
  let url = 'http://localhost:5173/index.html#/workbench'
  const sender = { getURL: () => url } as WebContents
  const main = { webContents: sender, isDestroyed: () => false } as BrowserWindow
  registerWorkbench(() => main, 'C:/app/main', {} as LanguageModelServices)
  expect(ipc.allowed!(sender)).toBe(true)
  url = 'http://localhost:5173/index.html#/settings/general'
  expect(ipc.allowed!(sender)).toBe(true)
  expect(ipc.allowed!({ getURL: () => url } as WebContents)).toBe(false)
  for (const value of ['https://example.com/index.html', 'http://localhost:5173/workbench.html', 'http://localhost:5173/comic-editor.html', 'file:///C:/other/index.html']) {
    url = value
    expect(ipc.allowed!(sender)).toBe(false)
  }
})

it('counts running jobs rather than page visits and rejects requests during shutdown', async () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
  let finish!: () => void
  ipc.cancelAll.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const sender = { getURL: () => 'http://localhost:5173/#/workbench' } as WebContents
  const main = { webContents: sender, isDestroyed: () => false } as BrowserWindow
  const activity = new FeatureActivity()
  const workbench = registerWorkbench(() => main, 'C:/app/main', {} as LanguageModelServices, activity)
  expect(ipc.allowed!(sender)).toBe(true)
  expect(activity.has('workbench')).toBe(false)
  ipc.running!(true)
  expect(activity.has('workbench')).toBe(true)
  expect(ipc.allowed!(sender)).toBe(true)
  const stopping = workbench.stop()
  expect(ipc.allowed!(sender)).toBe(false)
  expect(activity.isStopping('workbench')).toBe(true)
  expect(workbench.stop()).toBe(stopping)
  finish()
  await stopping
  expect(activity.has('workbench')).toBe(false)
  expect(ipc.allowed!(sender)).toBe(true)
  ipc.running!(true)
  ipc.running!(false)
  expect(activity.has('workbench')).toBe(false)
  await workbench.stop()
})
