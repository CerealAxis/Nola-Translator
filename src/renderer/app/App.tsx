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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionStopping, setSessionStopping] = useState(false)

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

  useEffect(() => {
    const api = window.fluentCaptions
    if (!api) return
    return api.onEngineEvent((event) => {
      if (event.type === 'sessionStarted') setActiveSessionId(event.sessionId)
      else if (event.type === 'sessionStopped') {
        setActiveSessionId(null)
        setSessionStopping(false)
      }
    })
  }, [])

  const stopActiveSession = async (): Promise<void> => {
    const api = window.fluentCaptions
    const sessionId = activeSessionId
    if (!api || !sessionId || sessionStopping) return
    setSessionStopping(true)
    try {
      await api.stopSession(sessionId)
      setActiveSessionId(null)
    } finally {
      setSessionStopping(false)
    }
  }

  const page = (): React.JSX.Element => {
    switch (activePage) {
      case 'captions': return <LiveCaptionsPage activeSessionId={activeSessionId} onSessionStarted={setActiveSessionId} onStopSession={stopActiveSession} onOpenResources={() => setActivePage('resources')} />
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
      <Navigation activePage={activePage} activeSessionId={activeSessionId} sessionStopping={sessionStopping} onStopSession={stopActiveSession} onNavigate={setActivePage} />
      <main className="content"><div className="content-inner">{page()}</div></main>
    </div>
  )
}
