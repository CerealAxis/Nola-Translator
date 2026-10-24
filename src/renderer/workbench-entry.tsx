import './workbench-entry.css'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '@/i18n'
import { ToastProvider } from '@/components/ui/toast'
import { ErrorState } from '@/components/assistant-ui/native/error-state'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { initStores } from '@/store'
import { WorkbenchWindow } from '@/features/workbench/WorkbenchWindow'

export interface NativeBoundaryProps { children: ReactNode }
class NativeBoundary extends Component<NativeBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  override render() { return this.state.error ? <NativeFailure error={this.state.error} /> : this.props.children }
}

export interface NativeFailureProps { error: Error }
function NativeFailure({ error }: NativeFailureProps) {
  const { t } = useI18n()
  return <div className="flex h-full items-center justify-center p-6"><ErrorState title={t('workbench.actionFailed')} detail={error.message} retrying={false} onRetry={() => window.location.reload()} /></div>
}

initStores(createIpcBridge(), { backgroundChecks: false, overlayMenu: true, offline: false })
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><NativeBoundary><ToastProvider /><WorkbenchWindow /></NativeBoundary></I18nProvider></StrictMode>)
