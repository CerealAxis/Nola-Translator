import { useEffect, useState } from 'react'
import { GlobeRegular } from '@fluentui/react-icons'
import { I18nProvider, useI18n, type UiLanguage } from '../i18n'

import { Navigation, type PageId } from './Navigation'
import { AppearancePage } from '../pages/AppearancePage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { HistoryPage } from '../pages/HistoryPage'
import { LiveCaptionsPage } from '../pages/LiveCaptionsPage'
import { RecognitionPage } from '../pages/RecognitionPage'
import { ResourcesPage } from '../pages/ResourcesPage'
import { TranslationPage } from '../pages/TranslationPage'

export function App(): React.JSX.Element {
  return <I18nProvider><AppContent /></I18nProvider>
}

function AppContent(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [languageError, setLanguageError] = useState(false)
  const chooseLanguage = async (next: UiLanguage): Promise<void> => {
    setLanguageMenuOpen(false)
    setLanguageError(false)
    try { await setLanguage(next) } catch { setLanguageError(true) }
  }
  const [activePage, setActivePage] = useState<PageId>('captions')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionStopping, setSessionStopping] = useState(false)

  useEffect(() => {
    const api = window.fluentCaptions
    if (!api) return
    // 主程序外观跟随 Windows；字幕配色仅作用于独立浮层。
    document.documentElement.dataset.theme = 'system'
    document.documentElement.style.colorScheme = 'light dark'
    return undefined
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

  useEffect(() => window.fluentCaptions?.onOpenAppearance(() => setActivePage('appearance')), [])

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
        <div className="language-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setLanguageMenuOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') { setLanguageMenuOpen(false); event.currentTarget.querySelector('button')?.focus() } }}>
          <button className="button secondary-button language-button" type="button" aria-label={t('界面语言')} title={t('界面语言')} aria-haspopup="menu" aria-expanded={languageMenuOpen} onClick={() => setLanguageMenuOpen(!languageMenuOpen)}><GlobeRegular aria-hidden /></button>
          {languageMenuOpen && <div className="language-menu surface" role="menu" aria-label={t('界面语言')}>
            <button type="button" role="menuitemradio" aria-checked={language === 'zh-CN'} onClick={() => void chooseLanguage('zh-CN')}>中文</button>
            <button type="button" role="menuitemradio" aria-checked={language === 'en'} onClick={() => void chooseLanguage('en')}>English</button>
          </div>}
        </div>
        <span className="local-mode"><span className="status-dot" aria-hidden="true" />{t('本地模式')}</span>
      </header>
      {languageError && <p className="language-error" role="alert">{t('语言设置保存失败，请重试。')}</p>}
      <Navigation activePage={activePage} activeSessionId={activeSessionId} sessionStopping={sessionStopping} onStopSession={stopActiveSession} onNavigate={setActivePage} />
      <main className="content"><div className="content-inner">{page()}</div></main>
    </div>
  )
}
