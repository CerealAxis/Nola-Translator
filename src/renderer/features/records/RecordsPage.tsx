import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertDialog, Button, Card, EmptyState, Pagination, SearchField, Skeleton } from '@heroui/react'
import { Mic } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { useI18n } from '@/i18n'
import { pathOf, recordPath, useRoute } from '@/routes'
import { actions, stores, useStore } from '@/store'
import { LANGUAGE_LABELS } from '@/bridge'
import type { MeetingMeta } from '@/bridge'
import { RenameDialog } from './RenameDialog'
import { ExportDialog } from './ExportDialog'
import { RecordsTable } from './RecordsTable'
import { clampPage, matches, pageNumbers, sortByEndTime } from './recordLogic'
import '../home/home-records.css'

const PAGE_SIZE = 10
export function RecordsPage(): ReactNode {
  const { t, language } = useI18n()
  const { navigate, path } = useRoute()
  const meetings = useStore(stores.meetings, (state) => state.meetings)
  const loaded = useStore(stores.meetings, (state) => state.loaded)
  const loading = useStore(stores.meetings, (state) => state.loading)
  const pendingIds = useStore(stores.meetings, (state) => state.pendingIds)
  const [filterText, setFilterText] = useState('')
  const [page, setPage] = useState(1)
  const [sortAscending, setSortAscending] = useState(false)
  const [renaming, setRenaming] = useState<MeetingMeta | null>(null)
  const [deleting, setDeleting] = useState<MeetingMeta | null>(null)
  const [exporting, setExporting] = useState<MeetingMeta | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    if (!loaded) void actions.meetings.loadMeetings().catch(() => undefined)
  }, [loaded])
  const filtered = useMemo(() => {
    const text = filterText.trim().toLowerCase()
    const languageLabel = (code: string) => {
      const label = LANGUAGE_LABELS[code]
      return label ? (language === 'zh-CN' ? label.zh : label.en) : code
    }
    return sortByEndTime(meetings.filter((meeting) => matches(meeting, text) ||
      languageLabel(meeting.sourceLanguage).toLowerCase().includes(text) ||
      languageLabel(meeting.targetLanguage).toLowerCase().includes(text)), sortAscending)
  }, [meetings, filterText, sortAscending, language])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = clampPage(page, filtered.length, PAGE_SIZE)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const startSession = () => navigate(pathOf('workspace'))
  const confirmDelete = useCallback(() => {
    if (!deleting) return
    setDeletePending(true)
    void actions.meetings.removeMeeting(deleting.meetingId).catch(() => undefined).finally(() => {
      setDeletePending(false)
      setDeleting(null)
    })
  }, [deleting])
  const isSearching = filterText.trim().length > 0

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-record-page">
        <header className="nola-record-page__header">
          <div><h1>{t('records.title')}</h1><p>{t('records.subtitle')}</p></div>
          <Button variant="primary" className="nola-record-page__start" onPress={startSession}><Mic aria-hidden="true" size={22} />{t('workspace.start')}</Button>
        </header>
        <div className="nola-record-page__search">
          <SearchField value={filterText} onChange={(value) => { setFilterText(value); setPage(1) }} aria-label={t('records.search')}>
            <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder={t('records.searchPlaceholder')} /><SearchField.ClearButton /></SearchField.Group>
          </SearchField>
          <span>{t('records.total', { count: filtered.length })}</span>
        </div>
        <Card className="nola-record-card">
          <Card.Content>
            {loading && !loaded ? <div className="nola-record-loading">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} data-testid="skeleton-row" className="h-12 w-full rounded-lg" />)}</div> : filtered.length === 0 ? <EmptyState className="nola-record-empty"><h2>{isSearching ? t('records.noResults') : t('records.noRecords')}</h2><p>{isSearching ? t('records.noResultsHint') : t('records.noRecordsHint')}</p><Button variant="primary" onPress={isSearching ? () => setFilterText('') : startSession}>{isSearching ? t('records.clearSearch') : t('records.startFirst')}</Button></EmptyState> : <RecordsTable meetings={visible} pendingIds={pendingIds} sortAscending={sortAscending} onSortChange={setSortAscending} onOpen={(id) => navigate(recordPath(id))} onRename={setRenaming} onExport={setExporting} onDelete={setDeleting} />}
          </Card.Content>
          {filtered.length > 0 ? <Card.Footer className="nola-record-page__footer">
            <span>{t('records.total', { count: filtered.length })}</span>
            <Pagination size="sm" aria-label={t('records.title')}><Pagination.Content>
              <Pagination.Item><Pagination.Previous isDisabled={safePage <= 1} onPress={() => setPage(Math.max(1, safePage - 1))} aria-label={t('records.goToPage', { page: Math.max(1, safePage - 1) })}><Pagination.PreviousIcon /></Pagination.Previous></Pagination.Item>
              {pageNumbers(safePage, pageCount).map((value) => <Pagination.Item key={value}><Pagination.Link isActive={value === safePage} onPress={() => setPage(value)} aria-label={t('records.goToPage', { page: value })}>{value}</Pagination.Link></Pagination.Item>)}
              <Pagination.Item><Pagination.Next isDisabled={safePage >= pageCount} onPress={() => setPage(Math.min(pageCount, safePage + 1))} aria-label={t('records.goToPage', { page: Math.min(pageCount, safePage + 1) })}><Pagination.NextIcon /></Pagination.Next></Pagination.Item>
            </Pagination.Content></Pagination>
          </Card.Footer> : null}
        </Card>
      </div>
      <RenameDialog meetingId={renaming?.meetingId ?? null} initialTitle={renaming?.title ?? ''} onClose={() => setRenaming(null)} />
      <ExportDialog meetingId={exporting?.meetingId ?? null} isOpen={exporting !== null} onOpenChange={(open) => { if (!open) setExporting(null) }} />
      <AlertDialog isOpen={deleting !== null} onOpenChange={(open) => { if (!open && !deletePending) setDeleting(null) }}>
        <AlertDialog.Backdrop><AlertDialog.Container><AlertDialog.Dialog>
          <AlertDialog.Header><AlertDialog.Icon /><AlertDialog.Heading>{t('records.deleteTitle')}</AlertDialog.Heading></AlertDialog.Header>
          <AlertDialog.Body><p>{t('records.deleteBody')}</p></AlertDialog.Body>
          <AlertDialog.Footer><Button variant="tertiary" isDisabled={deletePending} onPress={() => setDeleting(null)}>{t('common.cancel')}</Button><Button variant="danger" isPending={deletePending} onPress={confirmDelete}>{t('records.delete')}</Button></AlertDialog.Footer>
        </AlertDialog.Dialog></AlertDialog.Container></AlertDialog.Backdrop>
      </AlertDialog>
    </ErrorBoundary>
  )
}

