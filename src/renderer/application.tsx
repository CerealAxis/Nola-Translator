import { Home, Mic, Clock, SlidersHorizontal, Settings, Video } from 'lucide-react'
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
    ['records', 'nav.records', Clock, '#/records'],
    ['models', 'nav.models', SlidersHorizontal, '#/models'],
    ['settings', 'nav.settings', Settings, '#/settings/appearance'],
  ] as const
  return entries.map(([id, key, icon, path]) => ({
    id, label: t(key), icon, path,
    active: route === id || id === 'workspace' && route === 'overlay' || id === 'records' && route === 'record',
    onPress: () => navigate(path),
  }))
}
