import '@/index.css'
import '@/theme/cjk-fonts.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Toast } from '@heroui/react'
import { Home, Mic, Captions, Clock, SlidersHorizontal, Settings, Video, X } from 'lucide-react'
import { I18nProvider, useI18n } from '@/i18n'
import type { UiLanguage } from '@/i18n'
import { AppShell } from '@/components/primitives'
import { HomePage } from '@/features/home'
import { WorkspacePage } from '@/features/workspace'
import { ModelsPage } from '@/features/models'
import { SettingsPage } from '@/features/settings'
import { RecordsPage, RecordDetailPage } from '@/features/records'
import { OverlayPage } from '@/features/overlay/OverlayPage'
import { OverlayRoot } from '@/features/overlay'
import { VideoCaptionsPage } from '@/features/video-captions/VideoCaptionsPage'
import { Routes, useRoute } from '@/routes'
import { stores } from '@/store'
import { demoCopy, prepareDemo } from './demo'
import { connectDemo } from './demoBridge'
import { Scene } from './Scene'
import './media.css'

const params = new URLSearchParams(location.search)
const requestedLocale = params.get('locale') ?? 'zh-CN'
const locale: UiLanguage = requestedLocale in demoCopy ? requestedLocale as UiLanguage : 'zh-CN'
const page = params.get('page') ?? 'home'
const snapshot = params.get('snapshot') === '1'
const settings = prepareDemo(locale, page)
if (page.endsWith('-scene')) stores.session.setState({ status: 'running', segments: stores.session.getState().segments.slice(0, 1) })
const sampleSegments = stores.session.getState().segments
let showOverlay: (open: boolean) => void = () => undefined
const { publish, closeOverlay } = connectDemo(settings, open => showOverlay(open))

function DemoApp() {
  const { t, language } = useI18n()
  const { route, navigate } = useRoute()
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
  const entries = [
    ['home', 'nav.home', Home, '#/'],
    ['workspace', 'nav.workspace', Mic, '#/workspace'],
    ['overlay', 'shellUi.overlay', Captions, '#/overlay'],
    ['video-captions', 'videoCaptions.title', Video, '#/video-captions'],
    ['records', 'nav.records', Clock, '#/records'],
    ['models', 'nav.models', SlidersHorizontal, '#/models'],
    ['settings', 'nav.settings', Settings, '#/settings/appearance'],
  ] as const
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
    const timer = setInterval(() => {
      if (document.hidden || stores.session.getState().status !== 'running') return
      tick++
      if (stores.session.getState().startedAtMs === null) stores.session.setState(state => ({ elapsedMs: state.elapsedMs + 1000 }))
      if (tick % 8 === 0) {
        const segment = sampleSegments[(tick / 8 - 1) % sampleSegments.length]
        publish({ type: 'caption', protocolVersion: 1, requestId: 'demo', sessionId: 'docs-demo', segment: { ...segment, revision: tick } })
      }
      if (!stores.session.getState().segments.length) stores.session.setState({ segments: sampleSegments })
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'nola-demo-navigate') return
      const paths: Record<string, string> = { home: '#/', workspace: '#/workspace', overlay: '#/overlay', video: '#/video-captions', models: '#/models', appearance: '#/settings/appearance' }
      if (paths[event.data.page]) navigate(paths[event.data.page])
    }
    window.addEventListener('message', receive)
    parent.postMessage({ type: 'nola-demo-ready' }, location.origin)
    return () => window.removeEventListener('message', receive)
  }, [navigate])
  return <>
    <div className="docs-desktop-surface z-base" inert={overlayOpen}>
    {page.endsWith('-scene') ? <Scene browser={page === 'browser-scene'} /> : <AppShell navigation={entries.map(([id, key, icon, path]) => ({ id, label: t(key), icon, path, active: route === id || id === 'records' && route === 'record', onPress: () => navigate(path) }))}>
      <Routes pages={{ home: () => <HomePage />, workspace: () => <WorkspacePage />, models: () => <ModelsPage />, settings: () => <SettingsPage />, overlay: () => <OverlayPage />, 'video-captions': () => <VideoCaptionsPage />, records: () => <RecordsPage />, record: () => <RecordDetailPage /> }} />
    </AppShell>}
    </div>
    {overlayOpen ? <div className="docs-overlay-backdrop z-overlay">
      <div className="docs-overlay-panel" role="dialog" aria-modal="true" aria-label={t('shellUi.overlay')}>
        <div className="docs-overlay-heading">
          <span>{t('shellUi.overlay')}</span>
          <Button className="docs-overlay-dismiss" autoFocus variant="secondary" onPress={closeOverlay}><X aria-hidden="true" />{t('common.close')}</Button>
        </div>
        <div className="docs-live-overlay"><OverlayRoot /></div>
      </div>
    </div> : null}
    <Toast.Provider />
  </>
}

createRoot(document.getElementById('root')!).render(<I18nProvider><DemoApp /></I18nProvider>)
