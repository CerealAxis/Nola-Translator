import { useEffect, useState } from 'react'
import { GlobeRegular } from '@fluentui/react-icons'
import { appNameForLanguage, I18nProvider, useI18n, type UiLanguage } from '../i18n'
import nolaLogo from '../../../assets/brand/nola-logo.svg'

import { Navigation, type PageId } from './Navigation'
import { AppearancePage } from '../pages/AppearancePage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { MeetingsPage } from '../pages/MeetingsPage'
import { MeetingDetailPage } from '../pages/MeetingDetailPage'
import { LiveCaptionsPage } from '../pages/LiveCaptionsPage'
import { RecognitionPage } from '../pages/RecognitionPage'
import { ResourcesPage } from '../pages/ResourcesPage'
import { TranslationPage } from '../pages/TranslationPage'

export function App(): React.JSX.Element {
  return <I18nProvider><StartupGate /></I18nProvider>
}

function StartupGate(): React.JSX.Element {
  const { language, t } = useI18n()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    let active = true
    setState('loading')
    const api = window.nolaTranslator
    if (!api) {
      setState('error')
      return
    }
    void api.listResources().then(() => {
      if (active) setState('ready')
    }).catch(() => {
      if (active) setState('error')
    })
    return () => { active = false }
  }, [attempt])
  if (state === 'ready') return <AppContent />
  return (
    <div className="startup-screen" role="status" aria-live="polite">
      <div className="startup-card">
        <img className="app-mark startup-mark" src={nolaLogo} alt="" />
        <strong>{appNameForLanguage(language)}</strong>
        {state === 'loading' ? <>
          <span className="loading-spinner" aria-hidden="true" />
          <p>{t('正在加载本地引擎与资源…')}</p>
        </> : <>
          <p>{t('本地引擎启动失败，请重试。')}</p>
          <button className="button primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>{t('重试')}</button>
        </>}
      </div>
    </div>
  )
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
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)

  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    // The main window follows the Windows theme; the subtitle palette only applies to the standalone overlay.
    document.documentElement.dataset.theme = 'system'
    document.documentElement.style.colorScheme = 'light dark'
    return undefined
  }, [])

  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    return api.onEngineEvent((event) => {
      if (event.type === 'sessionStarted') setActiveSessionId(event.sessionId)
      else if (event.type === 'sessionStopped') {
        setActiveSessionId(null)
        setSessionStopping(false)
      }
    })
  }, [])

  useEffect(() => window.nolaTranslator?.onOpenAppearance((page) => setActivePage(page)), [])

  const stopActiveSession = async (): Promise<void> => {
    const api = window.nolaTranslator
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
      case 'history': return openMeetingId
        ? <MeetingDetailPage meetingId={openMeetingId} onBack={() => setOpenMeetingId(null)} />
        : <MeetingsPage onOpenMeeting={setOpenMeetingId} />
      case 'diagnostics': return <DiagnosticsPage />
    }
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <img className="app-mark" src={nolaLogo} alt="" />
        <span className="app-name">{appNameForLanguage(language)}</span>
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
