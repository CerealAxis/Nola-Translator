import '@/index.css'
import '@/theme/cjk-fonts.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { ToastProvider } from '@/components/ui/toast'
import { X } from 'lucide-react'
import { APPLICATION_PAGES, useApplicationNavigation } from '@/application'
import { OnboardingTour } from '@/features/onboarding'
import { ModelCapabilityNotices } from '@/features/models/ModelCapabilityNotices'
import { ModelDownloadNotice } from '@/features/models/ModelDownloadNotice'
import { I18nProvider, useI18n } from '@/i18n'
import type { UiLanguage } from '@/i18n'
import { AppShell, ErrorBoundary } from '@/components/primitives'
import { OverlayRoot } from '@/features/overlay'
import { Routes, useRoute } from '@/routes'
import { stores, updateSettings } from '@/store'
import { demoCopy, prepareDemo } from './demo'
import { connectDemo } from './demoBridge'
import { Scene } from './Scene'
import './media.css'

const params = new URLSearchParams(location.search)
const requestedLocale = params.get('locale') ?? 'zh-CN'
const locale: UiLanguage = Object.hasOwn(demoCopy, requestedLocale) ? requestedLocale as UiLanguage : 'zh-CN'
const page = params.get('page') ?? 'home'
const snapshot = params.get('snapshot') === '1'
const requestedTheme = params.get('theme')
const settings = prepareDemo(locale, page, snapshot, requestedTheme === 'dark' || requestedTheme === 'light' ? requestedTheme : undefined)
if (page.endsWith('-scene')) stores.session.setState({ status: 'running', segments: stores.session.getState().segments.slice(0, 1) })
const sampleSegments = stores.session.getState().segments
let showOverlay: (open: boolean) => void = () => undefined
const { publish, closeOverlay } = connectDemo(settings, open => showOverlay(open))

function DemoApp() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const navigation = useApplicationNavigation()
  const [overlayOpen, setOverlayOpen] = useState(false)
  showOverlay = setOverlayOpen
  useEffect(() => {
    if (!overlayOpen) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeOverlay()
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [overlayOpen])
  useEffect(() => {
    if (language !== locale) return
    let active = true
    void (async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (active) document.documentElement.dataset.captureReady = 'true'
    })()
    return () => { active = false }
  }, [language])
  useEffect(() => {
    if (snapshot) return
    // Simulated events use the same store path as the engine, so pause and stop keep their real semantics.
    let tick = 0
    let sessionStart: number | null = null
    const timer = setInterval(() => {
      if (document.hidden || stores.session.getState().status !== 'running') return
      if (sessionStart !== stores.session.getState().startedAtMs) {
        tick = 0
        sessionStart = stores.session.getState().startedAtMs
      }
      tick++
      if (stores.session.getState().startedAtMs === null) stores.session.setState(state => ({ elapsedMs: state.elapsedMs + 1000 }))
      if (tick === 1 || tick % 8 === 0) {
        const segment = sampleSegments[Math.floor(tick / 8) % sampleSegments.length]
        publish({ type: 'caption', protocolVersion: 1, requestId: 'demo', sessionId: stores.session.getState().sessionId!, segment: { ...segment, revision: tick, translations: stores.settings.getState().settings?.translation.targetLanguage === 'none' ? [] : segment.translations } })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent) return
      if (event.data?.type === 'nola-demo-theme' && (event.data.theme === 'dark' || event.data.theme === 'light')) {
        void updateSettings({ theme: event.data.theme })
        return
      }
      if (event.data?.type !== 'nola-demo-navigate') return
      const paths: Record<string, string> = { home: '#/', workspace: '#/workspace', overlay: '#/overlay', video: '#/video-captions', models: '#/models', appearance: '#/settings/appearance' }
      if (paths[event.data.page]) navigate(paths[event.data.page])
    }
    window.addEventListener('message', receive)
    parent.postMessage({ type: 'nola-demo-ready' }, location.origin)
    return () => window.removeEventListener('message', receive)
  }, [navigate])
  return <>
    {import.meta.env.MODE === 'toy' ? <div className="docs-demo-label z-toast" role="note">{demoCopy[language].label}</div> : null}
    <div className="docs-desktop-surface z-base" inert={overlayOpen}>
    {page.endsWith('-scene') ? <Scene browser={page === 'browser-scene'} /> : <AppShell navigation={navigation}>
      <Routes pages={APPLICATION_PAGES} />
      <OnboardingTour autoStart={false} />
    </AppShell>}
    </div>
    {overlayOpen ? <div className="docs-overlay-backdrop z-overlay">
      <div className="docs-overlay-panel" role="dialog" aria-modal="true" aria-label={t('shellUi.overlay')}>
        <div className="docs-overlay-heading">
          <span>{t('shellUi.overlay')}</span>
          <Button className="docs-overlay-dismiss" autoFocus variant="secondary" onClick={closeOverlay}><X aria-hidden="true" />{t('common.close')}</Button>
        </div>
        <div className="docs-live-overlay"><OverlayRoot /></div>
      </div>
    </div> : null}
    <ModelCapabilityNotices />
    <ModelDownloadNotice />
    <ToastProvider />
  </>
}

createRoot(document.getElementById('root')!).render(<I18nProvider><ErrorBoundary><DemoApp /></ErrorBoundary></I18nProvider>)
