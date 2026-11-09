import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useApplicationNavigation } from './application'
import { parseRoute, pathOf } from './routes'

const route = vi.hoisted(() => ({ route: 'home', path: '#/', tab: '', navigate: vi.fn() }))
vi.mock('./routes', async importOriginal => ({ ...await importOriginal<typeof import('./routes')>(), useRoute: () => route }))

it('shows the application sidebar outside settings', () => {
  const { result } = renderHook(useApplicationNavigation)
  expect(result.current.map(item => item.id)).toEqual([
    'home', 'models', 'model-gateway', 'workspace', 'meeting', 'screen-translation',
    'game-translation', 'comic-translation', 'workbench', 'settings',
  ])
  expect(result.current.filter(item => item.section === 'features').map(item => item.id)).toEqual([
    'workspace', 'meeting', 'screen-translation', 'game-translation', 'comic-translation', 'workbench',
  ])
  const settings = result.current.find(item => item.id === 'settings')
  settings?.onPress?.()
  expect(route.navigate).toHaveBeenCalledWith('#/settings/general')
  expect(parseRoute('#/video-captions')).toMatchObject({ route: 'settings', tab: 'browser' })
})

it('replaces the sidebar in settings and returns to the originating subpage after switching categories', () => {
  Object.assign(route, { route: 'comic-translation', path: '#/comic-translation/book-1/page-2' })
  const { result, rerender, unmount } = renderHook(useApplicationNavigation)

  Object.assign(route, { route: 'settings', path: '#/settings/general', tab: 'general' })
  rerender()
  expect(result.current.map(item => item.id)).toEqual([
    'settings-back', 'general', 'audio', 'appearance', 'browser', 'shortcuts', 'engine',
    'storage', 'glossary', 'help', 'developer',
  ])

  Object.assign(route, { path: '#/settings/browser', tab: 'browser' })
  rerender()
  expect(result.current.find(item => item.active)?.id).toBe('browser')
  result.current[0].onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/comic-translation/book-1/page-2')
  unmount()

  const direct = renderHook(useApplicationNavigation)
  direct.result.current[0].onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/')
  direct.unmount()
  Object.assign(route, { route: 'home', path: '#/', tab: '' })
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
