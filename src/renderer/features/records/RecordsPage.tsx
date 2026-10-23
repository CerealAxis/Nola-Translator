import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecordSelection } from './RecordsTable'
import { Mic, Search } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { pathOf, recordPath, useRoute } from '@/routes'
import { actions, stores, useStore } from '@/store'
import { LANGUAGE_LABELS, languageName } from '@/bridge'
import type { MeetingMeta } from '@/bridge'
import { RenameDialog } from './RenameDialog'
import { ExportDialog } from './ExportDialog'
import { RecordDeleteDialog } from './RecordDeleteDialog'
import { RecordsTable } from './RecordsTable'
import { clampPage, matches, pageNumbers, sortByEndTime } from './recordLogic'
import '../home/home-records.css'

const PAGE_SIZES = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

/** Which confirmation dialog is open; both share one, because they share one consequence. */
type PendingDelete = { kind: 'single'; meeting: MeetingMeta } | { kind: 'bulk' } | null

export function RecordsPage(): ReactNode {
  const { t, language } = useI18n()
  const { navigate, path } = useRoute()
  const meetings = useStore(stores.meetings, (state) => state.meetings)
  const loaded = useStore(stores.meetings, (state) => state.loaded)
  const loading = useStore(stores.meetings, (state) => state.loading)
  const loadError = useStore(stores.meetings, (state) => state.error)
  const pendingIds = useStore(stores.meetings, (state) => state.pendingIds)
  const [filterText, setFilterText] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortAscending, setSortAscending] = useState(false)
  const [selection, setSelection] = useState<RecordSelection>(new Set())
  const [renaming, setRenaming] = useState<MeetingMeta | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [exporting, setExporting] = useState<MeetingMeta | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    // The store keeps the failure and the effect below reports it; this call only asks again.
    if (!loaded) void actions.meetings.loadMeetings().catch(() => undefined)
  }, [loaded])

  /*
   * A list that never arrived and a list that is empty are different states, and the
   * empty state claims the user has no records. The store keeps the reason; the notice
   * tells the user, and the retry button lets them ask again.
   */
  const loadFailed = !loaded && !loading && loadError !== null
  const reportedFailure = useRef<string | null>(null)
  useEffect(() => {
    /*
     * The state is read again here instead of taken from the render: the effect above starts
     * another attempt, and that attempt clears the error before it succeeds or fails. The
     * snapshot this effect was scheduled with still holds the failure of the previous attempt,
     * and reporting it would announce a failure the user never had.
     */
    const state = stores.meetings.getState()
    if (state.loaded || state.loading || state.error === null) {
      reportedFailure.current = null
      return
    }
    if (reportedFailure.current === state.error) return
    reportedFailure.current = state.error
    notifyError(t('errors.meetingsLoadFailed'), { cause: state.error })
  }, [loadFailed, loadError, t])
  const retryLoad = useCallback(() => {
    // The failure is the one the effect above reports: it watches the store's error field.
    // A load that is already running resolves without reading anything, so the notice
    // would announce a list that was never fetched.
    if (stores.meetings.getState().loading) return
    void actions.meetings.loadMeetings().then(() => {
      notifySuccess(t('common.refreshed'))
    }).catch(() => undefined)
  }, [t])
  const filtered = useMemo(() => {
    const text = filterText.trim().toLowerCase()
    const languageLabel = (code: string) => {
      const label = LANGUAGE_LABELS[code]
      return label ? languageName(code, language) : code
    }
    return sortByEndTime(meetings.filter((meeting) => matches(meeting, text) ||
      languageLabel(meeting.sourceLanguage).toLowerCase().includes(text) ||
      languageLabel(meeting.targetLanguage).toLowerCase().includes(text)), sortAscending)
  }, [meetings, filterText, sortAscending, language])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = clampPage(page, filtered.length, pageSize)
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  /**
   * A selection is only ever acted on through `filtered`, so ids that have
   * since left the list — deleted elsewhere, or dropped by the current search —
   * are counted out here rather than carried as ghosts that inflate the count and
   * target a record the user cannot see.
   */
  const selectedIds = useMemo(() => {
    const available = new Set(filtered.map((meeting) => meeting.meetingId))
    const keys = selection === 'all' ? visible.map((meeting) => meeting.meetingId) : [...selection]
    return keys.filter((id): id is string => typeof id === 'string' && available.has(id))
  }, [selection, filtered, visible])
  const selectedCount = selectedIds.length

  const startSession = () => navigate(pathOf('workspace'))
  const bulk = pendingDelete?.kind === 'bulk'
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    setDeletePending(true)
    if (pendingDelete.kind === 'single') {
      void actions.meetings.removeMeeting(pendingDelete.meeting.meetingId).then((removed) => {
        if (!removed) notifyError(t('records.deleteFailed'))
        else notifySuccess(t('records.deletedMany', { count: 1 }))
      }).catch((cause: unknown) => {
        notifyError(t('records.deleteFailed'), { cause })
      }).finally(() => {
        setDeletePending(false)
        setPendingDelete(null)
      })
      return
    }
    const targets = selectedIds
    void actions.meetings.removeMeetings(targets).then((result) => {
      // Whatever failed stays selected, so the retry is the same gesture the
      // user already has half-made rather than a hunt for which rows survived.
      const removed = new Set(result.removed)
      setSelection(new Set(targets.filter((id) => !removed.has(id))))
      if (result.failed.length === 0) notifySuccess(t('records.deletedMany', { count: result.removed.length }))
      else notifyError(t('records.deletePartialFailed', { removed: result.removed.length, failed: result.failed.length }))
    }).catch((cause: unknown) => {
      notifyError(t('records.deleteFailed'), { cause })
    }).finally(() => {
      setDeletePending(false)
      setPendingDelete(null)
    })
  }, [pendingDelete, selectedIds, t])
  const isSearching = filterText.trim().length > 0

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-record-page">
        <header className="nola-record-page__header">
          <div><h1>{t('records.title')}</h1><p>{t('records.subtitle')}</p></div>
          <Button variant="default" className="nola-record-page__start" onClick={startSession}><Mic aria-hidden="true" size={22} />{t('workspace.start')}</Button>
        </header>
        <div className="nola-record-page__search">
          <InputGroup className="nola-record-page__search-field">
            <InputGroupInput type="search" value={filterText} onChange={(event) => { setFilterText(event.target.value); setPage(1); setSelection(new Set()) }} aria-label={t('records.search')} placeholder={t('records.searchPlaceholder')} />
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          </InputGroup>
          <span>{t('records.total', { count: filtered.length })}</span>
        </div>
        <Card className="nola-record-card">
          <CardContent className="flex flex-1 flex-col">
            {loading && !loaded ? <div className="nola-record-loading">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} data-testid="skeleton-row" className="h-12 w-full rounded-lg" />)}</div> : loadFailed ? <div className="nola-record-empty"><Button variant="default" onClick={retryLoad}>{t('common.retry')}</Button></div> : filtered.length === 0 ? <Empty className="nola-record-empty"><EmptyHeader><EmptyTitle>{isSearching ? t('records.noResults') : t('records.noRecords')}</EmptyTitle><EmptyDescription>{isSearching ? t('records.noResultsHint') : t('records.noRecordsHint')}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="default" onClick={isSearching ? () => setFilterText('') : startSession}>{isSearching ? t('records.clearSearch') : t('records.startFirst')}</Button></EmptyContent></Empty> : <>
              {selectedCount > 0 ? <div className="nola-record-page__bulk">
                <span className="nola-record-page__bulk-count">{t('records.selectedCount', { count: selectedCount })}</span>
                <Button variant="secondary" size="sm" onClick={() => setSelection(new Set())} className="nola-record-page__bulk-dismiss">{t('records.clearSelection')}</Button>
                <Button variant="danger" size="sm" onClick={() => setPendingDelete({ kind: 'bulk' })}>{t('records.deleteSelected', { count: selectedCount })}</Button>
              </div> : null}
              <RecordsTable meetings={visible} pendingIds={pendingIds} sortAscending={sortAscending} onSortChange={setSortAscending} selectedKeys={selection} onSelectionChange={setSelection} onOpen={(id) => navigate(recordPath(id))} onRename={setRenaming} onExport={setExporting} onDelete={(meeting) => setPendingDelete({ kind: 'single', meeting })} />
            </>}
          </CardContent>
          {filtered.length > 0 ? <CardFooter className="nola-record-page__footer">
            <span>{t('records.total', { count: filtered.length })}</span>
            <div className="nola-record-page__paging">
              <span className="nola-record-page__per-page">{t('records.perPage')}</span>
              <Select value={String(pageSize)}
                onValueChange={(key) => {
                  const next = Number(key)
                  if (!Number.isInteger(next)) return
                  setPageSize(next)
                  setPage(1)
                }}>
                <SelectTrigger className="nola-record-page__page-size" aria-label={t('records.pageSize')}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <Pagination aria-label={t('records.title')}><PaginationContent>
                <PaginationItem><PaginationLink disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))} aria-label={t('records.goToPage', { page: Math.max(1, safePage - 1) })}>‹</PaginationLink></PaginationItem>
                {pageNumbers(safePage, pageCount).map((value) => <PaginationItem key={value}><PaginationLink isActive={value === safePage} onClick={() => setPage(value)} aria-label={t('records.goToPage', { page: value })}>{value}</PaginationLink></PaginationItem>)}
                <PaginationItem><PaginationLink disabled={safePage >= pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} aria-label={t('records.goToPage', { page: Math.min(pageCount, safePage + 1) })}>›</PaginationLink></PaginationItem>
              </PaginationContent></Pagination>
            </div>
          </CardFooter> : null}
        </Card>
      </div>
      <RenameDialog meetingId={renaming?.meetingId ?? null} initialTitle={renaming?.title ?? ''} onClose={() => setRenaming(null)} />
      <ExportDialog meetingId={exporting?.meetingId ?? null} isOpen={exporting !== null} onOpenChange={(open) => { if (!open) setExporting(null) }} />
      <RecordDeleteDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => { if (!open && !deletePending) setPendingDelete(null) }}
        bulk={bulk}
        selectedCount={selectedCount}
        isPending={deletePending}
        onConfirm={confirmDelete}
      />
    </ErrorBoundary>
  )
}

