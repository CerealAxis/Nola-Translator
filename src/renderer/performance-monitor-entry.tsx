import './index.css'
import './theme/desktop-material'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { I18nProvider } from '@/i18n'
import { attachSettingsStore, loadSettings } from '@/store/settingsStore'
import { PerformanceMonitor } from '@/features/model-gateway/PerformanceMonitor'

const bridge = createIpcBridge()
attachSettingsStore(bridge, false)
void loadSettings().catch(() => undefined)
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><PerformanceMonitor read={bridge.gateway?.performanceSnapshot} /></I18nProvider></StrictMode>)
