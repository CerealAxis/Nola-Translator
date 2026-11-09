import './index.css'
import './theme/desktop-material'
import { createRoot } from 'react-dom/client'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { I18nProvider } from '@/i18n'
import { attachSettingsStore, loadSettings } from '@/store/settingsStore'
import { ScreenWindowRoot } from '@/features/screen/ScreenWindowRoot'

document.documentElement.dataset.screenWindow = 'true'
const bridge = createIpcBridge()
attachSettingsStore(bridge, false)
void loadSettings().catch(() => {})
if (bridge.screenTranslation) createRoot(document.getElementById('root')!).render(<I18nProvider><ScreenWindowRoot api={bridge.screenTranslation} gameApi={bridge.gameTranslation} /></I18nProvider>)
