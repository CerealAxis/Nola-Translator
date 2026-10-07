import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertDialog, Button, Card, EmptyState, ListBox, ListBoxItem, Pagination, SearchField, Select, Skeleton, toast } from '@heroui/react'
import type { Selection } from '@react-types/shared'
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
  const pendingIds = useStore(stores.meetings, (state) => state.pendingIds)
  const [filterText, setFilterText] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortAscending, setSortAscending] = useState(false)
  const [selection, setSelection] = useState<Selection>(new Set())
  const [renaming, setRenaming] = useState<MeetingMeta | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
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
      void actions.meetings.removeMeeting(pendingDelete.meeting.meetingId).catch(() => undefined).finally(() => {
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
      if (result.failed.length === 0) toast.success(t('records.deletedMany', { count: result.removed.length }))
      else toast.danger(t('records.deletePartialFailed', { removed: result.removed.length, failed: result.failed.length }))
    }).catch(() => toast.danger(t('errors.storageChangedAction'))).finally(() => {
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
          <Button variant="primary" className="nola-record-page__start" onPress={startSession}><Mic aria-hidden="true" size={22} />{t('workspace.start')}</Button>
        </header>
        <div className="nola-record-page__search">
          <SearchField value={filterText} onChange={(value) => { setFilterText(value); setPage(1); setSelection(new Set()) }} aria-label={t('records.search')}>
            <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder={t('records.searchPlaceholder')} /><SearchField.ClearButton /></SearchField.Group>
          </SearchField>
          <span>{t('records.total', { count: filtered.length })}</span>
        </div>
        <Card className="nola-record-card">
          <Card.Content>
            {loading && !loaded ? <div className="nola-record-loading">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} data-testid="skeleton-row" className="h-12 w-full rounded-lg" />)}</div> : filtered.length === 0 ? <EmptyState className="nola-record-empty"><h2>{isSearching ? t('records.noResults') : t('records.noRecords')}</h2><p>{isSearching ? t('records.noResultsHint') : t('records.noRecordsHint')}</p><Button variant="primary" onPress={isSearching ? () => setFilterText('') : startSession}>{isSearching ? t('records.clearSearch') : t('records.startFirst')}</Button></EmptyState> : <>
              {selectedCount > 0 ? <div className="nola-record-page__bulk">
                <span className="nola-record-page__bulk-count">{t('records.selectedCount', { count: selectedCount })}</span>
                <Button variant="ghost" size="sm" onPress={() => setSelection(new Set())} className="nola-record-page__bulk-dismiss">{t('records.clearSelection')}</Button>
                <Button variant="danger" size="sm" onPress={() => setPendingDelete({ kind: 'bulk' })}>{t('records.deleteSelected', { count: selectedCount })}</Button>
              </div> : null}
              <RecordsTable meetings={visible} pendingIds={pendingIds} sortAscending={sortAscending} onSortChange={setSortAscending} selectedKeys={selection} onSelectionChange={setSelection} onOpen={(id) => navigate(recordPath(id))} onRename={setRenaming} onExport={setExporting} onDelete={(meeting) => setPendingDelete({ kind: 'single', meeting })} />
            </>}
          </Card.Content>
          {filtered.length > 0 ? <Card.Footer className="nola-record-page__footer">
            <span>{t('records.total', { count: filtered.length })}</span>
            <div className="nola-record-page__paging">
              <span className="nola-record-page__per-page">{t('records.perPage')}</span>
              <Select className="nola-record-page__page-size" value={String(pageSize)} aria-label={t('records.pageSize')}
                onChange={(key) => {
                  const next = Number(key)
                  if (!Number.isInteger(next)) return
                  setPageSize(next)
                  setPage(1)
                }}>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover><ListBox>{PAGE_SIZES.map((size) => <ListBoxItem key={size} id={String(size)} textValue={String(size)}>{size}<ListBoxItem.Indicator /></ListBoxItem>)}</ListBox></Select.Popover>
              </Select>
              <Pagination size="sm" aria-label={t('records.title')}><Pagination.Content>
                <Pagination.Item><Pagination.Previous isDisabled={safePage <= 1} onPress={() => setPage(Math.max(1, safePage - 1))} aria-label={t('records.goToPage', { page: Math.max(1, safePage - 1) })}><Pagination.PreviousIcon /></Pagination.Previous></Pagination.Item>
                {pageNumbers(safePage, pageCount).map((value) => <Pagination.Item key={value}><Pagination.Link isActive={value === safePage} onPress={() => setPage(value)} aria-label={t('records.goToPage', { page: value })}>{value}</Pagination.Link></Pagination.Item>)}
                <Pagination.Item><Pagination.Next isDisabled={safePage >= pageCount} onPress={() => setPage(Math.min(pageCount, safePage + 1))} aria-label={t('records.goToPage', { page: Math.min(pageCount, safePage + 1) })}><Pagination.NextIcon /></Pagination.Next></Pagination.Item>
              </Pagination.Content></Pagination>
            </div>
          </Card.Footer> : null}
        </Card>
      </div>
      <RenameDialog meetingId={renaming?.meetingId ?? null} initialTitle={renaming?.title ?? ''} onClose={() => setRenaming(null)} />
      <ExportDialog meetingId={exporting?.meetingId ?? null} isOpen={exporting !== null} onOpenChange={(open) => { if (!open) setExporting(null) }} />
      <AlertDialog isOpen={pendingDelete !== null} onOpenChange={(open) => { if (!open && !deletePending) setPendingDelete(null) }}>
        <AlertDialog.Backdrop><AlertDialog.Container><AlertDialog.Dialog>
          <AlertDialog.Header><AlertDialog.Icon /><AlertDialog.Heading>{bulk ? t('records.deleteManyTitle', { count: selectedCount }) : t('records.deleteTitle')}</AlertDialog.Heading></AlertDialog.Header>
          <AlertDialog.Body><p>{bulk ? t('records.deleteManyBody') : t('records.deleteBody')}</p></AlertDialog.Body>
          <AlertDialog.Footer><Button variant="tertiary" isDisabled={deletePending} onPress={() => setPendingDelete(null)}>{t('common.cancel')}</Button><Button variant="danger" isPending={deletePending} onPress={confirmDelete}>{bulk ? t('records.deleteSelected', { count: selectedCount }) : t('records.delete')}</Button></AlertDialog.Footer>
        </AlertDialog.Dialog></AlertDialog.Container></AlertDialog.Backdrop>
      </AlertDialog>
    </ErrorBoundary>
  )
}

