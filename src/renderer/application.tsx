import { ModelGatewayPage } from './features/model-gateway/ModelGatewayPage'
import { requestFeatureStart } from './components/primitives/FeatureActivityNotice'
import { CircleHelp, CirclePlus, LayoutDashboard, PanelsTopLeft, Clock, SlidersHorizontal, Settings, MessagesSquare, Network, Headphones, ScanText, BookOpen, Gamepad2 } from 'lucide-react'
import { getBridge } from './store'
import { notifyError } from './components/primitives/notify'
import { useI18n } from './i18n'
import { useRoute } from './routes'
import { HomePage } from './features/home'
import { OverlayPage } from './features/overlay/OverlayPage'
import { MeetingModePage } from './features/meeting/MeetingModePage'
import { ScreenTranslationPage } from './features/screen/ScreenTranslationPage'
import { ComicTranslationPage } from './features/comic/ComicTranslationPage'
import { GameTranslationPage } from './features/game/GameTranslationPage'
import { RecordsPage, RecordDetailPage } from './features/records'
import { ModelsPage } from './features/models'
import { SettingsPage } from './features/settings'
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
  const { t } = useI18n()
  const { route, tab, navigate } = useRoute()
  const entries = [
    ['main', 'workspace', 'nav.workspace', CirclePlus, '#/workspace'],
    ['main', 'home', 'nav.home', LayoutDashboard, '#/'],
    ['main', 'meeting', 'meeting.navTitle', Headphones, '#/meeting'],
    ['main', 'screen-translation', 'screen.navTitle', ScanText, '#/screen-translation'],
    ['main', 'game-translation', 'suite.gameTitle', Gamepad2, '#/game-translation'],
    ['main', 'comic-translation', 'suite.comicTitle', BookOpen, '#/comic-translation'],
    ['tools', 'records', 'nav.records', Clock, '#/records'],
    ['tools', 'models', 'nav.models', SlidersHorizontal, '#/models'],
    ['tools', 'model-gateway', 'nav.modelGateway', Network, '#/model-gateway'],
  ] as const
  return [
    ...entries.map(([section, id, key, icon, path]) => ({
      section, id, label: t(key), icon, path,
      active: route === id || id === 'workspace' && route === 'overlay' || id === 'records' && route === 'record',
      onPress: () => navigate(path),
    })),
    { section: 'tools', id: 'workbench', label: t('workbench.title'), icon: MessagesSquare, path: '#workbench',
      onPress: () => { void requestFeatureStart(async () => getBridge()?.app.openWorkbench?.('chat'), 'workbench').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) },
    },
    { section: 'tools', id: 'browser', label: t('browser.title'), icon: PanelsTopLeft, path: '#/settings/browser',
      active: route === 'settings' && tab === 'browser', onPress: () => navigate('#/settings/browser') },
    { section: 'secondary', id: 'settings', label: t('nav.settings'), icon: Settings, path: '#/settings/general',
      active: route === 'settings' && tab !== 'browser' && tab !== 'help', onPress: () => navigate('#/settings/general') },
    { section: 'secondary', id: 'help', label: t('modelsSettingsUi.help'), icon: CircleHelp, path: '#/settings/help',
      active: route === 'settings' && tab === 'help', onPress: () => navigate('#/settings/help') },
  ]
}
