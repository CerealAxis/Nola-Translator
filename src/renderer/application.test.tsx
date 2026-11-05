import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useApplicationNavigation } from './application'

const route = vi.hoisted(() => ({ route: 'settings', tab: 'browser', navigate: vi.fn() }))
vi.mock('./routes', async importOriginal => ({ ...await importOriginal<typeof import('./routes')>(), useRoute: () => route }))

it('opens browser plugin management directly from the main navigation without reviving the caption page', () => {
  const { result } = renderHook(useApplicationNavigation)
  const browser = result.current.find(item => item.id === 'browser')!
  expect(browser.label).toBe('浏览器插件')
  expect(browser.path).toBe('#/settings/browser')
  expect(browser.active).toBe(true)
  expect(result.current.find(item => item.id === 'settings')?.active).toBe(false)
  browser.onPress?.()
  expect(route.navigate).toHaveBeenCalledWith('#/settings/browser')
  expect(result.current.some(item => item.path === '#/video-captions')).toBe(false)
})

vi.mock('./features/model-gateway/ModelGatewayPage', () => ({ ModelGatewayPage: () => null }))
vi.mock('./features/home', () => ({ HomePage: () => null }))
vi.mock('./features/overlay/OverlayPage', () => ({ OverlayPage: () => null }))
vi.mock('./features/meeting/MeetingModePage', () => ({ MeetingModePage: () => null }))
vi.mock('./features/screen/ScreenTranslationPage', () => ({ ScreenTranslationPage: () => null }))
vi.mock('./features/records', () => ({ RecordsPage: () => null, RecordDetailPage: () => null }))
vi.mock('./features/models', () => ({ ModelsPage: () => null }))
vi.mock('./features/settings', () => ({ SettingsPage: () => null }))
