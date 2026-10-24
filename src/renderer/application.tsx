import { ModelGatewayPage } from './features/model-gateway/ModelGatewayPage'
import { requestFeatureStart } from './components/primitives/FeatureActivityNotice'
import { Home, Mic, Clock, SlidersHorizontal, Settings, Video, MessagesSquare, Network } from 'lucide-react'
import { getBridge } from './store'
import { notifyError } from './components/primitives/notify'
import { useI18n } from './i18n'
import { useRoute } from './routes'
import { HomePage } from './features/home'
import { OverlayPage } from './features/overlay/OverlayPage'
import { VideoCaptionsPage } from './features/video-captions/VideoCaptionsPage'
import { RecordsPage, RecordDetailPage } from './features/records'
import { ModelsPage } from './features/models'
import { SettingsPage } from './features/settings'
import type { RoutesProps } from './routes'
import type { AppShellNavigationItem } from './components/primitives/AppShell'

/** Desktop, documentation and Toy share page registration so UI changes ship together. */
export const APPLICATION_PAGES = {
  home: () => <HomePage />,
  workspace: () => <OverlayPage />,
  overlay: () => <OverlayPage />,
  'video-captions': () => <VideoCaptionsPage />,
  'model-gateway': () => <ModelGatewayPage />,
  records: () => <RecordsPage />,
  record: () => <RecordDetailPage />,
  models: () => <ModelsPage />,
  settings: () => <SettingsPage />,
} satisfies RoutesProps['pages']

export function useApplicationNavigation(): AppShellNavigationItem[] {
  const { t } = useI18n()
  const { route, navigate } = useRoute()
  const entries = [
    ['home', 'nav.home', Home, '#/'],
    ['workspace', 'nav.workspace', Mic, '#/workspace'],
    ['video-captions', 'videoCaptions.title', Video, '#/video-captions'],
    ['model-gateway', 'nav.modelGateway', Network, '#/model-gateway'],
    ['records', 'nav.records', Clock, '#/records'],
    ['models', 'nav.models', SlidersHorizontal, '#/models'],
    ['settings', 'nav.settings', Settings, '#/settings/appearance'],
  ] as const
  const navigation: AppShellNavigationItem[] = entries.map(([id, key, icon, path]) => ({
    id, label: t(key), icon, path,
    active: route === id || id === 'workspace' && route === 'overlay' || id === 'records' && route === 'record',
    onPress: () => navigate(path),
  }))
  navigation.splice(1, 0, {
      id: 'workbench', label: t('workbench.title'), icon: MessagesSquare, path: '#workbench',
      onPress: () => { void requestFeatureStart(async () => getBridge()?.app.openWorkbench?.('chat'), 'workbench').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) },
  })
  return navigation
}
