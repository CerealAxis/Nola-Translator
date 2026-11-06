import { ModelGatewayPage } from './features/model-gateway/ModelGatewayPage'
import { requestFeatureStart } from './components/primitives/FeatureActivityNotice'
import { Home, Mic, PanelsTopLeft, Clock, SlidersHorizontal, Settings, MessagesSquare, Network, Headphones, ScanText, BookOpen, Gamepad2 } from 'lucide-react'
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
    ['home', 'nav.home', Home, '#/'],
    ['model-gateway', 'nav.modelGateway', Network, '#/model-gateway'],
    ['models', 'nav.models', SlidersHorizontal, '#/models'],
    ['workspace', 'nav.workspace', Mic, '#/workspace'],
    ['meeting', 'meeting.navTitle', Headphones, '#/meeting'],
    ['screen-translation', 'screen.navTitle', ScanText, '#/screen-translation'],
    ['game-translation', 'suite.gameTitle', Gamepad2, '#/game-translation'],
    ['comic-translation', 'suite.comicTitle', BookOpen, '#/comic-translation'],
    ['records', 'nav.records', Clock, '#/records'],
    ['settings', 'nav.settings', Settings, '#/settings/general'],
  ] as const
  const navigation: AppShellNavigationItem[] = entries.map(([id, key, icon, path]) => ({
    id, label: t(key), icon, path,
    active: route === id || id === 'workspace' && route === 'overlay' || id === 'records' && route === 'record',
    onPress: () => navigate(path),
  }))
  const settingsIndex = navigation.findIndex(item => item.id === 'settings')
  if (route === 'settings' && tab === 'browser') navigation[settingsIndex].active = false
  navigation.splice(4, 0, { id: 'browser', label: t('browser.title'), icon: PanelsTopLeft, path: '#/settings/browser', active: route === 'settings' && tab === 'browser', onPress: () => navigate('#/settings/browser') })
  navigation.splice(navigation.length - 1, 0, {
      id: 'workbench', label: t('workbench.title'), icon: MessagesSquare, path: '#workbench',
      onPress: () => { void requestFeatureStart(async () => getBridge()?.app.openWorkbench?.('chat'), 'workbench').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) },
  })
  return navigation
}
