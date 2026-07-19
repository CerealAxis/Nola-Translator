import { useEffect, useState } from 'react'

import { Navigation, type PageId } from './Navigation'
import { AppearancePage } from '../pages/AppearancePage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { HistoryPage } from '../pages/HistoryPage'
import { LiveCaptionsPage } from '../pages/LiveCaptionsPage'
import { RecognitionPage } from '../pages/RecognitionPage'
import { ResourcesPage } from '../pages/ResourcesPage'
import { TranslationPage } from '../pages/TranslationPage'

export function App(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('captions')

  useEffect(() => {
    const api = window.fluentCaptions
    if (!api) return
    const apply = (theme: 'system' | 'light' | 'dark'): void => {
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
    }
    void api.getSettings().then((settings) => apply(settings.theme))
    return api.onSettingsChanged((settings) => apply(settings.theme))
  }, [])

  const page = (): React.JSX.Element => {
    switch (activePage) {
      case 'captions': return <LiveCaptionsPage onOpenResources={() => setActivePage('resources')} />
      case 'recognition': return <RecognitionPage />
      case 'resources': return <ResourcesPage />
      case 'translation': return <TranslationPage onOpenResources={() => setActivePage('resources')} />
      case 'appearance': return <AppearancePage />
      case 'history': return <HistoryPage />
      case 'diagnostics': return <DiagnosticsPage />
    }
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span className="app-mark" aria-hidden="true">F</span>
        <span className="app-name">FluentCaptions</span>
        <span className="local-mode"><span className="status-dot" aria-hidden="true" />本地模式</span>
      </header>
      <Navigation activePage={activePage} onNavigate={setActivePage} />
      <main className="content"><div className="content-inner">{page()}</div></main>
    </div>
  )
}
