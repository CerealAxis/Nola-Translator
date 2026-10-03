import type { ReactNode } from 'react'
import { Mic, Captions, Clock, SlidersHorizontal } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { HeroSection, FeatureCard } from '@/components/home'
import { useI18n } from '@/i18n'
import { pathOf, recordPath, useRoute } from '@/routes'
import { stores, useStore } from '@/store'
import { RecentMeetings } from './RecentMeetings'
import './home-records.css'

export function HomePage(): ReactNode {
  const { t } = useI18n()
  const { navigate, path } = useRoute()
  const meetings = useStore(stores.meetings, (state) => state.meetings)
  const loading = useStore(stores.meetings, (state) => state.loading)
  const goWorkspace = () => navigate(pathOf('workspace'))
  const goRecords = () => navigate(pathOf('records'))
  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-home">
        <HeroSection />
        <div className="nola-home__entries">
          <FeatureCard variant="primary" icon={<Mic aria-hidden="true" />} title={t('home.quickStart')} description={t('homeRecordsUi.quickDescription')} buttonText={t('workspace.start')} onButtonClick={goWorkspace} />
          <FeatureCard variant="secondary" icon={<Captions aria-hidden="true" />} title={t('home.overlayCaptions')} description={t('homeRecordsUi.overlayDescription')} buttonText={t('homeRecordsUi.openOverlay')} onButtonClick={() => navigate('#/overlay')} />
          <FeatureCard variant="tertiary" icon={<Clock aria-hidden="true" />} title={t('home.records')} description={t('homeRecordsUi.recordsDescription')} buttonText={t('homeRecordsUi.openRecords')} onButtonClick={goRecords} />
          <FeatureCard variant="quaternary" icon={<SlidersHorizontal aria-hidden="true" />} title={t('home.models')} description={t('homeRecordsUi.modelsDescription')} buttonText={t('homeRecordsUi.openModels')} onButtonClick={() => navigate(pathOf('models'))} />
        </div>
        <RecentMeetings meetings={meetings} loading={loading} onOpen={(id) => navigate(recordPath(id))} onStart={goWorkspace} onOpenAll={goRecords} />
      </div>
    </ErrorBoundary>
  )
}

