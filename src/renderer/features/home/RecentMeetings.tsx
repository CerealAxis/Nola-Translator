import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { MeetingMeta } from '@/bridge'
import { RecordsTable } from '@/features/records/RecordsTable'
import { sortByEndTime } from '@/features/records/recordLogic'

export interface RecentMeetingsProps {
  meetings: readonly MeetingMeta[]
  loading?: boolean
  /** The list could not be read, so the empty state would claim the opposite. */
  failed?: boolean
  onRetry?: () => void
  onOpen: (id: string) => void
  onStart: () => void
  onOpenAll: () => void
  className?: string
}
export function RecentMeetings({ meetings, loading = false, failed = false, onRetry, onOpen, onStart, onOpenAll, className = '' }: RecentMeetingsProps): ReactNode {
  const { t } = useI18n()
  const recent = sortByEndTime(meetings, false).slice(0, 3)
  return (
    <Card className={['nola-record-card nola-home__recent flex flex-col', className].filter(Boolean).join(' ')}>
      <CardHeader className="nola-home__recent-header"><CardTitle className="card__title">{t('home.recentMeetings')}</CardTitle><CardAction><Button variant="tertiary" size="sm" onClick={onOpenAll}>{t('homeRecordsUi.allRecords')}<ArrowRight size={16} aria-hidden="true" /></Button></CardAction></CardHeader>
      <CardContent className="card__content flex flex-col">
        {loading && recent.length === 0 ? <div className="nola-record-loading" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-surface-tertiary/70" />)}</div> : failed ? <div className="nola-record-empty"><Button variant="default" onClick={onRetry}>{t('common.retry')}</Button></div> : recent.length === 0 ? <div className="nola-record-empty"><p>{t('home.noMeetings')}</p><Button variant="default" onClick={onStart}>{t('home.noMeetingsAction')}</Button></div> : <RecordsTable meetings={recent} onOpen={onOpen} />}
      </CardContent>
    </Card>
  )
}

