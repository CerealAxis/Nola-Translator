import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useApplicationNavigation } from './application'
import { parseRoute, pathOf } from './routes'

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
vi.mock('./features/game/GameTranslationPage', () => ({ GameTranslationPage: () => null }))
vi.mock('./features/comic/ComicTranslationPage', () => ({ ComicTranslationPage: () => null }))
vi.mock('./features/records', () => ({ RecordsPage: () => null, RecordDetailPage: () => null }))
vi.mock('./features/models', () => ({ ModelsPage: () => null }))
vi.mock('./features/settings', () => ({ SettingsPage: () => null }))

it('keeps screen, game and comic as independent entries and preserves editor deep links', () => {
  const { result } = renderHook(useApplicationNavigation)
  expect(result.current.filter(item => ['screen-translation', 'game-translation', 'comic-translation'].includes(item.id)).map(item => item.path))
    .toEqual(['#/screen-translation', '#/game-translation', '#/comic-translation'])
  expect(result.current.some(item => item.id === 'glossary')).toBe(false)
  expect(parseRoute('#/settings/glossary/library-1')).toMatchObject({ tab: 'glossary', glossaryLibraryId: 'library-1' })
  expect(parseRoute('#/comic-translation/book-1/reader')).toMatchObject({ projectId: 'book-1', reader: true })
  expect(parseRoute('#/comic-translation/book-1/page-2')).toMatchObject({ projectId: 'book-1', pageId: 'page-2' })
  expect(parseRoute('#/game-translation/game-1')).toMatchObject({ gameId: 'game-1' })
  expect(pathOf('settings', { tab: 'glossary' })).toBe('#/settings/glossary')
})
