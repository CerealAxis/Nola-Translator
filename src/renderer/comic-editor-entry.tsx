import './index.css'
import './theme/desktop-material'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '@/i18n'
import { ErrorState } from '@/components/assistant-ui/native/error-state'
import { ToastProvider } from '@/components/ui/toast'
import { TitleBar } from '@/components/primitives/TitleBar'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { initStores } from '@/store'
import { ComicTranslationPage } from '@/features/comic/ComicTranslationPage'
import { comicEditorRequestSchema } from '../shared/comic'

export class ComicEditorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  override render() { return this.state.error ? <ComicEditorFailure error={this.state.error} /> : this.props.children }
}
function ComicEditorFailure({ error }: { error: Error }) {
  const { t } = useI18n()
  return <div className="flex h-full items-center justify-center p-6"><ErrorState title={t('suite.actionFailed')} detail={error.message} retryLabel={t('suite.retry')} retryingLabel={t('suite.retry')} retrying={false} onRetry={() => window.location.reload()} /></div>
}
export function ComicEditorDocument() {
  const params = new URLSearchParams(window.location.search)
  const request = comicEditorRequestSchema.parse({ projectId: params.get('projectId'), ...(params.get('pageId') ? { pageId: params.get('pageId') } : {}) })
  return <ComicTranslationPage editor projectId={request.projectId} pageId={request.pageId} />
}
function ComicEditorWindow() {
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground"><TitleBar variant="session" preferences={false} sessionTitle={<div id="comic-editor-menus" className="nola-no-drag" />} helpItems={[]} /><div className="min-h-0 flex-1 overflow-hidden"><ComicEditorBoundary><ComicEditorDocument /></ComicEditorBoundary></div></div>
}
initStores(createIpcBridge(), { backgroundChecks: false, overlayMenu: true, offline: false })
createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><ToastProvider /><ComicEditorWindow /></I18nProvider></StrictMode>)
