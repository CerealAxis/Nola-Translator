import { render, renderHook, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { APPLICATION_PAGES, useApplicationNavigation } from './application'
import { parseRoute, pathOf, Routes } from './routes'

const route = vi.hoisted(() => ({ route: 'home', path: '#/', tab: '', navigate: vi.fn(), projectId: undefined as string | undefined, pageId: undefined as string | undefined, reader: undefined as boolean | undefined }))
const deferred = vi.hoisted(() => ({ comicImports: 0 }))
vi.mock('./routes', async importOriginal => ({ ...await importOriginal<typeof import('./routes')>(), useRoute: () => route }))

it('shows the application sidebar outside settings', () => {
  const { result } = renderHook(useApplicationNavigation)
  expect(result.current.map(item => item.id)).toEqual([
    'home', 'models', 'model-gateway', 'workspace', 'meeting', 'screen-translation',
    'game-translation', 'game-translation-demo', 'comic-translation', 'voices', 'workbench', 'browser', 'settings',
  ])
  expect(result.current.filter(item => item.section === 'features').map(item => item.id)).toEqual([
    'workspace', 'meeting', 'screen-translation', 'game-translation', 'game-translation-demo', 'comic-translation', 'voices', 'workbench', 'browser',
  ])
  result.current.find(item => item.id === 'browser')?.onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/settings/browser')
  const settings = result.current.find(item => item.id === 'settings')
  settings?.onPress?.()
  expect(route.navigate).toHaveBeenCalledWith('#/settings/general')
  result.current.find(item => item.id === 'workbench')?.onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/workbench')
  expect(parseRoute('#/workbench')).toMatchObject({ route: 'workbench', path: '#/workbench' })
  expect(pathOf('workbench')).toBe('#/workbench')
  expect(parseRoute('#/video-captions')).toMatchObject({ route: 'settings', tab: 'browser' })
})

it('routes model management through one sidebar entry and resolves existing links', () => {
  const { result, rerender } = renderHook(useApplicationNavigation)
  const original = route
  const oldRoute = { ...original }
  try {
    Object.assign(route, parseRoute('#/model-management/downloads'))
    rerender()
    expect(result.current.filter(item => item.active).map(item => item.id)).toEqual(['models'])
    const entry = result.current.find(item => item.id === 'models')!
    entry.onPress?.()
    expect(route.navigate).toHaveBeenLastCalledWith('#/models')
    expect(parseRoute('#/model-management/downloads')).toEqual({ route: 'models', modelManagementView: 'downloads', path: '#/models/downloads' })
    expect(parseRoute('#/model-management/search')).toEqual(parseRoute('#/models/search'))
    expect(parseRoute('#/models/providers')).toEqual(parseRoute('#/models'))
    expect(parseRoute('#/models')).toEqual({ route: 'models', path: '#/models' })
  } finally {
    Object.assign(route, oldRoute)
  }
})

it('returns from workbench to the originating page after a round trip through settings', () => {
  Object.assign(route, { route: 'comic-translation', path: '#/comic-translation/book-1/page-2', tab: '' })
  const { result, rerender, unmount } = renderHook(useApplicationNavigation)
  Object.assign(route, { route: 'workbench', path: '#/workbench' })
  rerender()
  expect(result.current.map(item => item.id)).toEqual(['workbench-back'])
  Object.assign(route, { route: 'settings', path: '#/settings/general', tab: 'general' })
  rerender()
  result.current[0].onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/workbench')
  Object.assign(route, { route: 'workbench', path: '#/workbench', tab: '' })
  rerender()
  result.current[0].onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith('#/comic-translation/book-1/page-2')
  unmount()
  Object.assign(route, { route: 'home', path: '#/', tab: '' })
})

it('replaces the sidebar in settings and returns to the originating subpage after switching categories', () => {
  Object.assign(route, { route: 'comic-translation', path: '#/comic-translation/book-1/page-2' })
  const { result, rerender, unmount } = renderHook(useApplicationNavigation)

  Object.assign(route, { route: 'settings', path: '#/settings/general', tab: 'general' })
  rerender()
  expect(result.current.map(item => item.id)).toEqual([
    'settings-back', 'general', 'audio', 'appearance', 'browser', 'shortcuts', 'engine',
    'storage', 'text-processing', 'help', 'developer',
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
vi.mock('./features/comic/ComicFrontendPage', () => {
  deferred.comicImports++
  return { ComicFrontendPage: ({ projectId, pageId, reader }: { projectId?: string; pageId?: string; reader?: boolean }) => <div>{projectId}/{pageId}/{reader ? 'reader' : 'editor'}</div> }
})
vi.mock('./features/records', () => ({ RecordsPage: () => null, RecordDetailPage: () => null }))
vi.mock('./features/models/preview/ModelPreviewPage', () => ({ default: () => null }))
vi.mock('./features/settings', () => ({ SettingsPage: () => null }))

it('keeps screen, game and comic as independent entries and preserves editor deep links', () => {
  const { result } = renderHook(useApplicationNavigation)
  expect(result.current.filter(item => ['screen-translation', 'game-translation', 'comic-translation'].includes(item.id)).map(item => item.path))
    .toEqual(['#/screen-translation', '#/game-translation', '#/comic-translation'])
  expect(result.current.some(item => item.id === 'glossary')).toBe(false)
  expect(parseRoute('#/settings/glossary/library-1')).toMatchObject({
    tab: 'text-processing', textProcessingLibrary: 'glossary', glossaryLibraryId: 'library-1',
  })
  expect(parseRoute('#/comic-translation/book-1/reader')).toMatchObject({ projectId: 'book-1', reader: true })
  expect(parseRoute('#/comic-translation/book-1/reader/page-2')).toMatchObject({
    projectId: 'book-1', reader: true, pageId: 'page-2', path: '#/comic-translation/book-1/reader/page-2',
  })
  expect(parseRoute('#/comic-translation/book-1/page-2')).toMatchObject({ projectId: 'book-1', pageId: 'page-2' })
  expect(parseRoute('#/game-translation/game-1')).toMatchObject({ gameId: 'game-1' })
  const preview = result.current.find(item => item.id === 'game-translation-demo')!
  preview.onPress?.()
  expect(route.navigate).toHaveBeenLastCalledWith(pathOf('game-translation-demo'))
  expect(preview.label).toBe(result.current.find(item => item.id === 'game-translation')!.label)
  expect(parseRoute(preview.path!)).toEqual({ route: 'game-translation-demo', path: '#/game' })
  expect(parseRoute(preview.path + '/library')).toMatchObject({ route: 'game-translation-demo', gameLibrary: true })
  expect(pathOf('settings', { tab: 'glossary' })).toBe('#/settings/glossary')
})

it('defers comic module loading until navigation and retains reader deep-link props', async () => {
  expect(deferred.comicImports).toBe(0)
  Object.assign(route, { route: 'comic-translation', path: '#/comic-translation/book-1/reader/page-2', projectId: 'book-1', pageId: 'page-2', reader: true })
  const previousUrl = window.location.href
  window.history.replaceState(null, '', route.path)
  const view = render(<Routes pages={APPLICATION_PAGES} />)
  expect(screen.getByRole('status')).toHaveAccessibleName(/加载中/)
  expect(await screen.findByText('book-1/page-2/reader')).toBeInTheDocument()
  expect(deferred.comicImports).toBe(1)
  view.unmount()
  window.history.replaceState(null, '', previousUrl)
  Object.assign(route, { route: 'home', path: '#/', projectId: undefined, pageId: undefined, reader: undefined })
})
