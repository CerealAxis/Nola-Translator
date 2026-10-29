import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Mic, Captions, Clock, SlidersHorizontal, Network, MessageSquareText } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { requestFeatureStart } from '@/components/primitives/FeatureActivityNotice'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { HeroSection, FeatureCard } from '@/components/home'
import { useI18n } from '@/i18n'
import { pathOf, recordPath, useRoute } from '@/routes'
import { actions, getBridge, stores, useStore } from '@/store'
import { RecentMeetings } from './RecentMeetings'
import './home-records.css'

export function HomePage(): ReactNode {
  const { t } = useI18n()
  const { navigate, path } = useRoute()
  const meetings = useStore(stores.meetings, (state) => state.meetings)
  const loading = useStore(stores.meetings, (state) => state.loading)
  const loaded = useStore(stores.meetings, (state) => state.loaded)
  const loadError = useStore(stores.meetings, (state) => state.error)
  /*
   * No sessions yet and a list that could not be read are different states, and the
   * empty state claims the first one. The store keeps the reason; the notice tells
   * the user, and the retry button lets them ask again.
   */
  const loadFailed = !loaded && !loading && loadError !== null
  const reportedFailure = useRef<string | null>(null)
  useEffect(() => {
    if (!loadFailed) {
      reportedFailure.current = null
      return
    }
    if (reportedFailure.current === loadError) return
    reportedFailure.current = loadError
    notifyError(t('errors.meetingsLoadFailed'), { cause: loadError })
  }, [loadFailed, loadError, t])
  const retryLoad = () => {
    /*
     * The store keeps the failure and the effect above reports it, so this call
     * only asks again and announces the list it got back. A load that is already
     * running resolves without reading anything, so the notice would announce a
     * list that was never fetched.
     */
    if (stores.meetings.getState().loading) return
    void actions.meetings.loadMeetings()
      .then(() => {
        notifySuccess(t('common.refreshed'))
      })
      .catch(() => undefined)
  }
  const goWorkspace = () => navigate(pathOf('workspace'))
  const goRecords = () => navigate(pathOf('records'))
  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-home">
        <HeroSection />
        <div className="nola-home__entries">
          <FeatureCard variant="tertiary" icon={<Network aria-hidden="true" />} title={t('homeRecordsUi.gatewayTitle')} description={t('homeRecordsUi.gatewayDescription')} buttonText={t('homeRecordsUi.openGateway')} onButtonClick={() => navigate(pathOf('model-gateway'))} />
          <FeatureCard variant="quaternary" icon={<SlidersHorizontal aria-hidden="true" />} title={t('home.models')} description={t('homeRecordsUi.modelsDescription')} buttonText={t('homeRecordsUi.openModels')} onButtonClick={() => navigate(pathOf('models'))} />
          <FeatureCard onboardingTarget="home-quick" variant="primary" icon={<Mic aria-hidden="true" />} title={t('home.quickStart')} description={t('homeRecordsUi.quickDescription')} buttonText={t('workspace.start')} onButtonClick={goWorkspace} />
          <FeatureCard onboardingTarget="home-overlay" variant="secondary" className="nola-entry--browser" icon={<Captions aria-hidden="true" />} title={t('home.overlayCaptions')} description={t('homeRecordsUi.overlayDescription')} buttonText={t('homeRecordsUi.openOverlay')} onButtonClick={() => navigate('#/video-captions')} />
          <FeatureCard variant="secondary" className="nola-entry--workbench" icon={<MessageSquareText aria-hidden="true" />} title={t('workbench.title')} description={t('homeRecordsUi.workbenchDescription')} buttonText={t('homeRecordsUi.openWorkbench')} onButtonClick={() => { void requestFeatureStart(async () => getBridge()?.app.openWorkbench?.('chat'), 'workbench').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) }} />
        </div>
        <RecentMeetings meetings={meetings} loading={loading} failed={loadFailed} onRetry={retryLoad} onOpen={(id) => navigate(recordPath(id))} onStart={goWorkspace} onOpenAll={goRecords} />
      </div>
    </ErrorBoundary>
  )
}

