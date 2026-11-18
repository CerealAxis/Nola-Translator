import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AppShell } from './components/primitives/AppShell'
import { ErrorBoundary } from './components/primitives/ErrorBoundary'
import { Spinner } from './components/ui/spinner'
import { ArrowLeft, AudioLines, LayoutDashboard, SlidersHorizontal, Settings, MessagesSquare, Network, Headphones, ScanText, BookOpen, Gamepad2 } from 'lucide-react'
import { useI18n } from './i18n'
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, ROUTE_TITLES, Routes, settingsPath, useRoute } from './routes'
import { HomePage } from './features/home'
import { ComicBooksLoading, ComicProjectLoading } from './features/comic/ComicLoading'
import { SETTINGS_NAVIGATION } from './features/settings/settingsNavigation'
import type { RoutesProps } from './routes'
import type { AppShellNavigationItem } from './components/primitives/AppShell'

const WorkbenchPage = lazy(() => import('./features/workbench/WorkbenchPage').then(module => ({ default: module.WorkbenchPage })))
const ModelGatewayPage = lazy(() => import('./features/model-gateway/ModelGatewayPage').then(module => ({ default: module.ModelGatewayPage })))
const OverlayPage = lazy(() => import('./features/overlay/OverlayPage').then(module => ({ default: module.OverlayPage })))
const MeetingModePage = lazy(() => import('./features/meeting/MeetingModePage').then(module => ({ default: module.MeetingModePage })))
const ScreenTranslationPage = lazy(() => import('./features/screen/ScreenTranslationPage').then(module => ({ default: module.ScreenTranslationPage })))
const ComicTranslationPage = lazy(() => import('./features/comic/ComicFrontendPage').then(module => ({ default: module.ComicFrontendPage })))
const GameTranslationPage = lazy(() => import('./features/game/GameTranslationPage').then(module => ({ default: module.GameTranslationPage })))
const RecordsPage = lazy(() => import('./features/records').then(module => ({ default: module.RecordsPage })))
const RecordDetailPage = lazy(() => import('./features/records').then(module => ({ default: module.RecordDetailPage })))
const ModelsPage = lazy(() => import('./features/models').then(module => ({ default: module.ModelsPage })))
const SettingsPage = lazy(() => import('./features/settings').then(module => ({ default: module.SettingsPage })))

/** Keep the Assistant-ui runtime outside the route element that is keyed by path. */
export function ApplicationShell({ children }: { children?: ReactNode }) {
  const navigation = useApplicationNavigation()
  const { route } = useRoute()
  const { t } = useI18n()
  const active = route === 'workbench'
  const [opened, setOpened] = useState(active)
  const [sidebar, setSidebar] = useState<HTMLDivElement | null>(null)
  const [heading, setHeading] = useState<HTMLDivElement | null>(null)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  useEffect(() => { if (active) setOpened(true) }, [active])
  const title = route === 'settings' ? t(ROUTE_TITLES.settings) : navigation.find(item => item.active)?.label ?? t(ROUTE_TITLES[route])
  return <AppShell navigation={navigation} title={title} className={active ? 'nola-app-shell--workbench' : ''}
    sidebarContent={active ? <div ref={setSidebar} className="nola-workbench-sidebar-slot" /> : undefined}
    heading={active ? <div ref={setHeading} /> : undefined}
    actions={active ? <div ref={setActions} className="nola-no-drag" /> : undefined}>
    {children}
    {!active && <Routes pages={APPLICATION_PAGES} />}
    {(active || opened) && <div className="nola-workbench-page" hidden={!active} data-page="workbench">
      <ErrorBoundary><Suspense fallback={<div className="flex h-full items-center justify-center" role="status" aria-label={t('common.loading')}><Spinner /></div>}>
        <WorkbenchPage active={active} sidebar={sidebar} heading={heading} actions={actions}
          onBack={() => navigation.find(item => item.id === 'workbench-back')?.onPress?.()} />
      </Suspense></ErrorBoundary>
    </div>}
  </AppShell>
}

/** The documentation demo uses the same page registry as the desktop app. */
export const APPLICATION_PAGES = {
  home: () => <HomePage />,
  workspace: () => <OverlayPage />,
  overlay: () => <OverlayPage />,
  meeting: () => <MeetingModePage />,
  'screen-translation': () => <ScreenTranslationPage />,
  'comic-translation': () => <ComicRoutePage />,
  'game-translation': () => <GameRoutePage />,
  'model-gateway': () => <ModelGatewayPage />,
  records: () => <RecordsPage />,
  record: () => <RecordDetailPage />,
  models: () => <ModelsPage />,
  settings: () => <SettingsPage />,
  workbench: () => null, // ApplicationShell owns the persistent instance.
} satisfies RoutesProps['pages']

function ComicRoutePage() {
  const { projectId, pageId, reader } = useRoute()
  return (
    <Suspense fallback={projectId ? <ComicProjectLoading comparison={!reader} /> : <ComicBooksLoading />}>
      <ComicTranslationPage projectId={projectId} pageId={pageId} reader={reader} />
    </Suspense>
  )
}

function GameRoutePage() {
  const { gameId } = useRoute()
  return <GameTranslationPage gameId={gameId} />
}

export function useApplicationNavigation(): AppShellNavigationItem[] {
  const { t, dictionary } = useI18n()
  const { route, path, tab, navigate } = useRoute()
  const returnPath = useRef('#/')
  const workbenchReturnPath = useRef('#/')
  useLayoutEffect(() => {
    if (route !== 'settings') returnPath.current = path
    if (route !== 'settings' && route !== 'workbench') workbenchReturnPath.current = path
  }, [route, path])

  if (route === 'workbench') {
    return [{ id: 'workbench-back', label: t('suite.back'), icon: ArrowLeft, section: 'features', path: workbenchReturnPath.current,
      onPress: () => navigate(workbenchReturnPath.current) }]
  }

  if (route === 'settings') {
    return [
      { id: 'settings-back', label: t('suite.back'), icon: ArrowLeft, section: 'settings', path: returnPath.current,
        onPress: () => navigate(returnPath.current) },
      ...SETTINGS_TABS.map((item): AppShellNavigationItem => {
        const { label, icon } = SETTINGS_NAVIGATION[item]
        const path = settingsPath(item)
        return {
          id: item, section: 'settings', icon, path, label: t(label), active: item === (tab ?? DEFAULT_SETTINGS_TAB),
          hint: item === 'engine' ? dictionary.compute.nextSession : undefined,
          onboardingTarget: `settings-${item}`, onPress: () => navigate(path),
        }
      }),
    ]
  }
  const entries = [
    ['overview', 'home', 'nav.home', LayoutDashboard, '#/'],
    ['overview', 'models', 'nav.models', SlidersHorizontal, '#/models'],
    ['overview', 'model-gateway', 'nav.modelGateway', Network, '#/model-gateway'],
    ['features', 'workspace', 'nav.workspace', AudioLines, '#/workspace'],
    ['features', 'meeting', 'meeting.navTitle', Headphones, '#/meeting'],
    ['features', 'screen-translation', 'screen.navTitle', ScanText, '#/screen-translation'],
    ['features', 'game-translation', 'suite.gameTitle', Gamepad2, '#/game-translation'],
    ['features', 'comic-translation', 'suite.comicTitle', BookOpen, '#/comic-translation'],
  ] as const
  return [
    ...entries.map(([section, id, key, icon, path]) => ({
      section, id, label: t(key), icon, path,
      active: route === id || id === 'workspace' && route === 'overlay',
      onPress: () => navigate(path),
    })),
    { section: 'features', id: 'workbench', label: t('workbench.title'), icon: MessagesSquare, path: '#/workbench',
      onPress: () => navigate('#/workbench'),
    },
    { section: 'features', id: 'browser', label: t(SETTINGS_NAVIGATION.browser.label), icon: SETTINGS_NAVIGATION.browser.icon, path: settingsPath('browser'),
      onPress: () => navigate(settingsPath('browser')) },
    { section: 'settings', id: 'settings', label: t('nav.settings'), icon: Settings, path: settingsPath(DEFAULT_SETTINGS_TAB),
      onPress: () => navigate(settingsPath(DEFAULT_SETTINGS_TAB)) },
  ]
}
