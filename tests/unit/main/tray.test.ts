import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { NolaTray } from '../../../src/main/tray'
const mocks = vi.hoisted(() => ({ menus: [] as any[][], destroy: vi.fn(), show: vi.fn(), callbacks: new Map<string, () => void>() }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'C:/Nola', getLocale: () => 'en-US' },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: () => ({}) }) },
  Menu: { buildFromTemplate: (items: any[]) => { mocks.menus.push(items); return items } },
  Tray: class { setToolTip() {} setContextMenu() {} on(name: string, callback: () => void) { mocks.callbacks.set(name, callback) } destroy = mocks.destroy },
}))
beforeEach(() => { mocks.menus.length = 0; mocks.callbacks.clear(); vi.clearAllMocks() })

it('shows a localized menu without stopping the feature', async () => {
  let settings = { ...DEFAULT_SETTINGS, uiLanguage: 'en' as const }
  const show = vi.fn()
  const stop = vi.fn(async () => {})
  const quit = vi.fn()
  const tray = new NolaTray({ getSettings: () => settings,
    getActivity: () => ({ owner: 'model-gateway', phase: 'running' }), show, stop, quit,
  })
  await tray.initialize()
  const menu = mocks.menus.at(-1)!
  expect(menu[0].label).toBe('Open Nola')
  expect(menu[2].label).toContain('Model gateway')
  expect(stop).not.toHaveBeenCalled()
  mocks.callbacks.get('double-click')!()
  expect(show).toHaveBeenCalledOnce()
  menu.at(-1).click()
  expect(quit).toHaveBeenCalledOnce()
  settings = { ...settings, uiLanguage: 'en' }
  tray.dispose()
  expect(mocks.destroy).toHaveBeenCalledOnce()
})

it('refreshes the tray menu when activity changes', () => {
  const tray = new NolaTray({ getSettings: () => ({ ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' }),
    getActivity: () => ({ owner: null, phase: 'idle' }), show: () => {}, stop: async () => {}, quit: () => {},
  })
  tray.activityChanged()
  expect(mocks.menus).toHaveLength(1)
})
