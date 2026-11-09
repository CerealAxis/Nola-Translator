import './index.css'
import './theme/desktop-material'
import './theme/cjk-fonts.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { I18nProvider } from '@/i18n'
import { attachSettingsStore, loadSettings } from '@/store/settingsStore'
import { LatencyWindow } from '@/features/latency/LatencyWindow'

attachSettingsStore(createIpcBridge(), false)
void loadSettings().catch(() => undefined)
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><LatencyWindow /></I18nProvider></StrictMode>)
