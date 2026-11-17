import '../../../src/renderer/index.css'
import '../../../src/renderer/theme/desktop-material'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationShell } from '../../../src/renderer/application'
import { I18nProvider } from '../../../src/renderer/i18n'
import { ToastProvider } from '../../../src/renderer/components/ui/toast'
import { createIpcBridge } from '../../../src/renderer/bridge/ipc/ipcBridge'
import { actions, initStores } from '../../../src/renderer/store'

initStores(createIpcBridge(), { backgroundChecks: false, overlayMenu: true, offline: false })
await Promise.all([actions.settings.loadSettings(), actions.models.loadModels({ includeDevices: false })])
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><ToastProvider /><ApplicationShell /></I18nProvider></StrictMode>)
