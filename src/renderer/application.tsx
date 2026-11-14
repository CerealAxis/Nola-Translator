import { useLayoutEffect, useRef } from 'react'
import { ModelGatewayPage } from './features/model-gateway/ModelGatewayPage'
import { requestFeatureStart } from './components/primitives/FeatureActivityNotice'
import { ArrowLeft, AudioLines, LayoutDashboard, SlidersHorizontal, Settings, MessagesSquare, Network, Headphones, ScanText, BookOpen, Gamepad2 } from 'lucide-react'
import { getBridge } from './store'
import { notifyError } from './components/primitives/notify'
import { useI18n } from './i18n'
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, settingsPath, useRoute } from './routes'
import { HomePage } from './features/home'
import { OverlayPage } from './features/overlay/OverlayPage'
import { MeetingModePage } from './features/meeting/MeetingModePage'
import { ScreenTranslationPage } from './features/screen/ScreenTranslationPage'
import { ComicTranslationPage } from './features/comic/ComicTranslationPage'
import { GameTranslationPage } from './features/game/GameTranslationPage'
import { RecordsPage, RecordDetailPage } from './features/records'
import { ModelsPage } from './features/models'
import { SettingsPage } from './features/settings'
import { SETTINGS_NAVIGATION } from './features/settings/settingsNavigation'
import type { RoutesProps } from './routes'
import type { AppShellNavigationItem } from './components/primitives/AppShell'

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
} satisfies RoutesProps['pages']

function ComicRoutePage() {
  const { projectId, pageId, reader } = useRoute()
  return <ComicTranslationPage projectId={projectId} pageId={pageId} reader={reader} />
}

function GameRoutePage() {
  const { gameId } = useRoute()
  return <GameTranslationPage gameId={gameId} />
}

export function useApplicationNavigation(): AppShellNavigationItem[] {
  const { t, dictionary } = useI18n()
  const { route, path, tab, navigate } = useRoute()
  const returnPath = useRef('#/')
  useLayoutEffect(() => {
    if (route !== 'settings') returnPath.current = path
  }, [route, path])

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
    { section: 'features', id: 'workbench', label: t('workbench.title'), icon: MessagesSquare, path: '#workbench',
      onPress: () => { void requestFeatureStart(async () => getBridge()?.app.openWorkbench?.('chat'), 'workbench').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) },
    },
    { section: 'features', id: 'browser', label: t(SETTINGS_NAVIGATION.browser.label), icon: SETTINGS_NAVIGATION.browser.icon, path: settingsPath('browser'),
      onPress: () => navigate(settingsPath('browser')) },
    { section: 'settings', id: 'settings', label: t('nav.settings'), icon: Settings, path: settingsPath(DEFAULT_SETTINGS_TAB),
      onPress: () => navigate(settingsPath(DEFAULT_SETTINGS_TAB)) },
  ]
}
