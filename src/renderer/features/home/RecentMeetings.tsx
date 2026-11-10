import { Fragment, useMemo, type ReactNode } from 'react'
import { AudioLines, BookOpen, ChevronRight, Gamepad2, Headphones, ScanText, type LucideIcon } from 'lucide-react'
import { languageName, type MeetingMeta } from '@/bridge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { endedAt, formatDateTime, formatDuration, sortByEndTime } from '@/features/records/recordLogic'
import { useI18n, type TranslationKey, type UiLanguage } from '@/i18n'
import { pathOf, recordPath, useRoute } from '@/routes'
import { actions, stores, useStore } from '@/store'
import { HomeListRow } from './HomeListRow'

const recentLimit = 3
const features = {
  workspace: { icon: AudioLines, name: 'home.quickStart' },
  meeting: { icon: Headphones, name: 'meeting.navTitle' },
  'screen-translation': { icon: ScanText, name: 'screen.navTitle' },
  'game-translation': { icon: Gamepad2, name: 'suite.gameTitle' },
  'comic-translation': { icon: BookOpen, name: 'suite.comicTitle' },
} satisfies Record<string, { icon: LucideIcon; name: TranslationKey }>

type RecentFeature = keyof typeof features
type RecordFeature = Extract<RecentFeature, 'workspace' | 'meeting' | 'game-translation'>

const filters = ['all', ...Object.keys(features) as RecentFeature[]] as const

interface RecentCopy {
  title: string
  filters: string
  all: string
  empty: string
  openRecord: string
  openFeature: string
}

const copy: Record<UiLanguage, RecentCopy> = {
  'zh-CN': { title: '最近记录', filters: '筛选记录', all: '全部', empty: '暂无最近记录', openRecord: '打开记录', openFeature: '打开功能' },
  'zh-TW': { title: '最近記錄', filters: '篩選記錄', all: '全部', empty: '暫無最近記錄', openRecord: '開啟記錄', openFeature: '開啟功能' },
  'zh-HK': { title: '最近紀錄', filters: '篩選紀錄', all: '全部', empty: '暫無最近紀錄', openRecord: '開啟紀錄', openFeature: '開啟功能' },
  en: { title: 'Recent records', filters: 'Filter records', all: 'All', empty: 'No recent records', openRecord: 'Open record', openFeature: 'Open feature' },
  ja: { title: '最近の記録', filters: '記録を絞り込む', all: 'すべて', empty: '最近の記録はありません', openRecord: '記録を開く', openFeature: '機能を開く' },
  ko: { title: '최근 기록', filters: '기록 필터', all: '전체', empty: '최근 기록이 없습니다', openRecord: '기록 열기', openFeature: '기능 열기' },
}

function featureOf(record: MeetingMeta): RecordFeature {
  switch (record.sourceKind) {
    case 'game': return 'game-translation'
    case 'meeting': return 'meeting'
    default: return 'workspace'
  }
}

function hasRecordContent(record: MeetingMeta): boolean {
  return record.segmentCount > 0 || Boolean(record.audioFile || record.notes?.trim())
}

function recordDetail(record: MeetingMeta, locale: UiLanguage): string {
  const source = languageName(record.sourceLanguage, locale)
  const languages = record.targetLanguage && record.targetLanguage !== 'none'
    ? source + ' → ' + languageName(record.targetLanguage, locale)
    : source
  return [languages, formatDateTime(endedAt(record)), formatDuration(record.durationMs)].join(' · ')
}

export function RecentMeetings(): ReactNode {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const meetings = useStore(stores.meetings, state => state.meetings)
  const loading = useStore(stores.meetings, state => state.loading)
  const loaded = useStore(stores.meetings, state => state.loaded)
  const error = useStore(stores.meetings, state => state.error)
  const recentCopy = copy[language]
  const ordered = useMemo(() => sortByEndTime(meetings, false), [meetings])
  // Store 初始化会读取列表，首次加载失败时沿用原操作重试。
  const failed = !loaded && !loading && error !== null
  const retryLoad = () => { void actions.meetings.loadMeetings().catch(() => undefined) }

  const action = (feature: RecentFeature, record?: MeetingMeta) => {
    const hasRecord = record !== undefined && hasRecordContent(record)
    const label = hasRecord ? recentCopy.openRecord : recentCopy.openFeature
    const title = t(features[feature].name)
    const destination = hasRecord ? recordPath(record.meetingId) : pathOf(feature)
    return (
      <Button variant="outline" size="sm" aria-label={label + ' · ' + title} onClick={() => navigate(destination)}>
        {label}<ChevronRight data-icon="inline-end" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <section className="nola-home-section" aria-labelledby="home-recent-heading">
      <h2 id="home-recent-heading" className="nola-home-section__heading">{recentCopy.title}</h2>
      <Card className="nola-home__recent">
        <Tabs defaultValue="all">
          <CardHeader>
            <TabsList aria-label={recentCopy.filters} className="nola-home-recent-filters">
              {filters.map(filter => (
                <TabsTrigger key={filter} value={filter}>
                  {filter === 'all' ? recentCopy.all : t(features[filter].name)}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardHeader>
          <CardContent>
            {filters.map(filter => {
              const records = (filter === 'all' ? ordered : ordered.filter(record => featureOf(record) === filter))
                .slice(0, recentLimit)
              const emptyFeature = filter === 'all' ? 'workspace' : filter
              const canHaveRecords = filter !== 'screen-translation' && filter !== 'comic-translation'
              return (
                <TabsContent key={filter} value={filter}>
                  {records.length > 0 ? records.map((record, index) => {
                    const feature = featureOf(record)
                    return (
                      <Fragment key={record.meetingId}>
                        {index > 0 && <Separator />}
                        <HomeListRow
                          icon={features[feature].icon}
                          title={t(features[feature].name)}
                          detail={recordDetail(record, language)}
                          action={action(feature, record)}
                        />
                      </Fragment>
                    )
                  }) : canHaveRecords && loading ? (
                    <div className="grid gap-3 py-3" aria-busy="true">
                      {Array.from({ length: recentLimit }, (_, index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : canHaveRecords && failed ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <p role="status" className="nola-caption text-nola-ui-muted-foreground">{t('errors.meetingsLoadFailed')}</p>
                      <Button variant="outline" size="sm" onClick={retryLoad}>{t('common.retry')}</Button>
                    </div>
                  ) : (
                    <HomeListRow
                      icon={features[emptyFeature].icon}
                      title={t(features[emptyFeature].name)}
                      detail={recentCopy.empty}
                      action={action(emptyFeature)}
                    />
                  )}
                </TabsContent>
              )
            })}
          </CardContent>
        </Tabs>
      </Card>
    </section>
  )
}
