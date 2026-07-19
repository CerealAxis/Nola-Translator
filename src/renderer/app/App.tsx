import { useState } from 'react'

import { Navigation, type PageId } from './Navigation'
import { AppearancePage } from '../pages/AppearancePage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { HistoryPage } from '../pages/HistoryPage'
import { LiveCaptionsPage } from '../pages/LiveCaptionsPage'
import { RecognitionPage } from '../pages/RecognitionPage'
import { TranslationPage } from '../pages/TranslationPage'

const pages: Record<PageId, React.JSX.Element> = {
  captions: <LiveCaptionsPage />,
  recognition: <RecognitionPage />,
  translation: <TranslationPage />,
  appearance: <AppearancePage />,
  history: <HistoryPage />,
  diagnostics: <DiagnosticsPage />
}

export function App(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('captions')

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span className="app-mark" aria-hidden="true">F</span>
        <span className="app-name">FluentCaptions</span>
        <span className="local-mode"><span className="status-dot" aria-hidden="true" />本地模式</span>
      </header>
      <Navigation activePage={activePage} onNavigate={setActivePage} />
      <main className="content"><div className="content-inner">{pages[activePage]}</div></main>
    </div>
  )
}
