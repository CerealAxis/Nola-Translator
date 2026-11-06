import { Captions } from 'lucide-react'
import type { MeetingModeSnapshot } from '../../../shared/meeting-mode'
import { DEFAULT_MEETING_MODE } from '../../../shared/meeting-mode'
import { CaptionStage } from '@/components/caption'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { actions, getBridge, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { WorkspaceViewControls } from '../workspace/WorkspaceViewControls'
import { notifyError } from '@/components/primitives/notify'
import { SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from '../../../shared/error-catalog'
import { meetingZh } from '@/i18n/meeting-ui'
import type { TranslationKey } from '@/i18n'

export function MeetingReader({ snapshot }: { snapshot: MeetingModeSnapshot }) {
  const { t } = useI18n()
  const mode = useStore(stores.settings, state => state.settings?.meetingMode) ?? DEFAULT_MEETING_MODE
  const segments = snapshot.segments ?? []
  const labels = Object.fromEntries(segments.map(segment => {
    const speakers = [...new Set(segments.filter(item => item.direction === segment.direction).map(item => item.speakerId).filter(Boolean))]
    return [segment.segmentId, `${t(segment.direction === 'uplink' ? 'meeting.me' : 'meeting.remote')}${mode.showSpeaker && segment.speakerId ? ` · ${t('meeting.speaker', { number: segment.speakerNumber ?? speakers.indexOf(segment.speakerId) + 1 })}` : ''}`]
  }))
  const active = ['running', 'starting', 'stopping', 'unknown'].includes(snapshot.state)
  const code = supportErrorCodeForCause(snapshot.error?.code)
  const errorKey = snapshot.error?.key?.startsWith('meeting.') && Object.hasOwn(meetingZh, snapshot.error.key.slice(8))
    ? snapshot.error.key as TranslationKey : code !== 'ERR-999' ? SUPPORT_ERROR_CATALOG[code].messageKey : 'meeting.pipelineFailed'
  return <section className="nola-workspace" aria-label={t('meeting.conversation')}>
    <Card><CardHeader><CardTitle>{t('meeting.conversation')}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
      <WorkspaceViewControls />
      <Button disabled={snapshot.state !== 'running'} variant="secondary" onClick={() => void getBridge()?.meetingMode?.setPaused(!snapshot.paused).catch(error => notifyError(t('meeting.pauseFailed'), { cause: error }))}>{t(snapshot.paused ? 'workspace.resume' : 'workspace.pause')}</Button>
      <Button variant="outline" onClick={() => void actions.settings.showOverlay('workspace').then(opened => { if(opened === false) notifyError(t('workspaceUi.overlayFailed')) }).catch(error => notifyError(t('workspaceUi.overlayFailed'), { cause: error }))}><Captions data-icon="inline-start" />{t('workspaceUi.openOverlay')}</Button>
      <Button disabled={!active || snapshot.state === 'starting' || snapshot.state === 'stopping'} onClick={() => void getBridge()?.meetingMode?.stop().catch(error => notifyError(t('meeting.stopFailed'), { cause: error }))}>{t('meeting.stop')}</Button>
    </CardContent></Card>
    {snapshot.error ? <Alert variant="danger"><AlertDescription>{t(errorKey)}</AlertDescription></Alert> : null}
    <Card className="nola-workspace-transcript"><CardHeader><CardTitle>{t('meeting.title')}</CardTitle></CardHeader>
      <CaptionStage segments={segments} interim={null} layout="sentence" paused={snapshot.paused} showTimestamps speakerLabels={labels}
        emptyState={<Empty><EmptyHeader><EmptyTitle>{t('meeting.waitingSpeech')}</EmptyTitle></EmptyHeader></Empty>} />
    </Card>
  </section>
}
