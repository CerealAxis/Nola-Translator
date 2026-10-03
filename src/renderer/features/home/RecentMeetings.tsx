import type { ReactNode } from 'react'
import { Button, Card, EmptyState, Skeleton } from '@heroui/react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { MeetingMeta } from '@/bridge'
import { RecordsTable } from '@/features/records/RecordsTable'
import { sortByEndTime } from '@/features/records/recordLogic'

export interface RecentMeetingsProps {
  meetings: readonly MeetingMeta[]
  loading?: boolean
  onOpen: (id: string) => void
  onStart: () => void
  onOpenAll: () => void
  className?: string
}
export function RecentMeetings({ meetings, loading = false, onOpen, onStart, onOpenAll, className = '' }: RecentMeetingsProps): ReactNode {
  const { t } = useI18n()
  const recent = sortByEndTime(meetings, false).slice(0, 3)
  return (
    <Card className={'nola-record-card nola-home__recent ' + className}>
      <Card.Header className="nola-home__recent-header"><Card.Title>{t('home.recentMeetings')}</Card.Title><Button variant="tertiary" size="sm" onPress={onOpenAll}>{t('homeRecordsUi.allRecords')}<ArrowRight size={16} aria-hidden="true" /></Button></Card.Header>
      <Card.Content>
        {loading && recent.length === 0 ? <div className="nola-record-loading">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div> : recent.length === 0 ? <EmptyState className="nola-record-empty"><p>{t('home.noMeetings')}</p><Button variant="primary" onPress={onStart}>{t('home.noMeetingsAction')}</Button></EmptyState> : <RecordsTable meetings={recent} onOpen={onOpen} />}
      </Card.Content>
    </Card>
  )
}

