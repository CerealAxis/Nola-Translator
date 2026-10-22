import { useMemo } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Menu } from '@base-ui/react/menu'
export type RecordSelection = 'all' | Set<string | number>
import { Check, ChevronUp, Download, Eye, FileText, Mic, Minus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { LANGUAGE_LABELS, languageName } from '@/bridge'
import type { MeetingMeta } from '@/bridge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { meetingState } from '@/meeting-format'
import { fallbackTitle, formatDateTime, formatClock } from './recordLogic'

interface RecordsTableProps {
  meetings: readonly MeetingMeta[]
  onOpen: (id: string) => void
  onRename?: (meeting: MeetingMeta) => void
  onExport?: (meeting: MeetingMeta) => void
  onDelete?: (meeting: MeetingMeta) => void
  pendingIds?: readonly string[]
  sortAscending?: boolean
  onSortChange?: (ascending: boolean) => void
  /** Row ids double as the selection keys, so this is a set of meeting ids. */
  selectedKeys?: RecordSelection
  /** Omitted leaves the table without checkboxes, the way the home page's short list reads. */
  onSelectionChange?: (keys: RecordSelection) => void
}

/* The menu surface keeps the dropdown popover skin, so the sheet that opens over
   the table looks like the one it replaces. */
const MENU_POPUP_CLASS = 'dropdown__popover p-1'
const MENU_ITEM_CLASS = 'nola-menu-item flex cursor-pointer items-center gap-3 rounded-nola-ui-md px-3 py-2 text-sm'
const CHECKBOX_CLASS = 'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-nola-ui-md border border-nola-ui-border bg-nola-ui-secondary text-nola-ui-primary-foreground transition-colors data-[checked]:border-nola-ui-primary data-[checked]:bg-nola-ui-primary data-[indeterminate]:border-nola-ui-primary data-[indeterminate]:bg-nola-ui-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'
const CHECKBOX_INDICATOR_CLASS = 'flex size-3 items-center justify-center'

export function RecordsTable({ meetings, onOpen, onRename, onExport, onDelete, pendingIds = [], sortAscending = false, onSortChange, selectedKeys, onSelectionChange }: RecordsTableProps): ReactNode {
  const { t, language } = useI18n()
  const selectable = !!onSelectionChange
  const rowIds = useMemo(() => meetings.map((meeting) => meeting.meetingId), [meetings])
  /*
   * 'all' means every row of this table, which is how the selection state it
   * replaces read it; materialising it keeps the header box and the rows in step.
   */
  const selectedIds = useMemo(() => (selectedKeys === 'all' ? new Set(rowIds) : new Set(selectedKeys)), [selectedKeys, rowIds])
  const selectionEmpty = selectedKeys !== 'all' && selectedIds.size === 0
  const allSelected = selectedKeys === 'all' || (rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id)))
  const headerIndeterminate = !selectionEmpty && !allSelected
  const languageLabel = (code: string) => {
    const label = LANGUAGE_LABELS[code]
    return label ? languageName(code, language) : code
  }
  const setRowSelected = (meetingId: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(meetingId)
    else next.delete(meetingId)
    onSelectionChange?.(next)
  }
  /*
   * A press on the row itself selects it, the way the selectable table behaved;
   * a press on a control inside the row belongs to that control.
   */
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, meetingId: string, pending: boolean) => {
    if (!selectable || pending) return
    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="button"], [role="checkbox"]')) return
    setRowSelected(meetingId, !selectedIds.has(meetingId))
  }
  return (
    <div className="nola-records-table table-root table-root--secondary">
      <div className="nola-records-table__container table__scroll-container">
        <table className="table__content" aria-label={t('records.title')}>
          <thead className="table__header">
            <tr>
              {selectable ? <th scope="col" className="nola-records-table__select table__column">
                <Checkbox.Root
                  className={CHECKBOX_CLASS}
                  checked={allSelected}
                  indeterminate={headerIndeterminate}
                  disabled={rowIds.length === 0}
                  onCheckedChange={(checked) => { if (checked) onSelectionChange?.('all'); else onSelectionChange?.(new Set<string>()) }}
                  aria-label={t('records.selectAllPage')}>
                  <Checkbox.Indicator className={CHECKBOX_INDICATOR_CLASS}>
                    {headerIndeterminate ? <Minus aria-hidden="true" size={12} strokeWidth={3} /> : <Check aria-hidden="true" size={12} strokeWidth={3} />}
                  </Checkbox.Indicator>
                </Checkbox.Root>
              </th> : null}
              <th scope="col" className="nola-records-table__name table__column">{t('records.columnName')}</th>
              <th scope="col" className="nola-records-table__time table__column" aria-sort={onSortChange ? (sortAscending ? 'ascending' : 'descending') : undefined}>
                {onSortChange ? <Button variant="tertiary" className="h-auto min-h-0 w-full justify-between border-0 bg-transparent p-0 text-xs font-medium text-inherit" onClick={() => onSortChange(!sortAscending)}>
                  {t('homeRecordsUi.time')}
                  <span className="table__sortable-column-indicator" data-direction={sortAscending ? 'ascending' : 'descending'}><ChevronUp aria-hidden="true" size={12} /></span>
                </Button> : t('homeRecordsUi.time')}
              </th>
              <th scope="col" className="nola-records-table__duration table__column">{t('records.columnDuration')}</th>
              <th scope="col" className="nola-records-table__language table__column">{t('homeRecordsUi.language')}</th>
              <th scope="col" className="nola-records-table__status table__column">{t('homeRecordsUi.status')}</th>
              <th scope="col" className="nola-records-table__actions table__column">{t('records.columnActions')}</th>
            </tr>
          </thead>
          <tbody className="table__body">
            {meetings.map((meeting) => {
              // Three states: running now, finished, or started and never finished.
              const state = meetingState(meeting)
              const live = state === 'running'
              // Green dot = done, blue = running, and interrupted takes the warning colour:
              const statusClass = 'nola-record-status'
                + (live ? ' nola-record-status--live' : state === 'interrupted' ? ' nola-record-status--interrupted' : '')
              const statusLabel = live
                ? t('status.running')
                : state === 'interrupted' ? t('homeRecordsUi.interrupted') : t('homeRecordsUi.completed')
              const title = meeting.title || fallbackTitle(meeting)
              // A row already under a rename or a delete has an unconfirmed write
              // behind it; selecting it would queue a second one against the same id.
              const pending = pendingIds.includes(meeting.meetingId)
              const selected = selectedIds.has(meeting.meetingId)
              return (
                <tr key={meeting.meetingId} className="table__row" data-selected={selected ? 'true' : undefined} data-testid={'recent-' + meeting.meetingId}
                  onClick={(event) => onRowClick(event, meeting.meetingId, pending)}>
                  {selectable ? <td className="nola-records-table__select table__cell">
                    <Checkbox.Root
                      className={CHECKBOX_CLASS}
                      checked={selected}
                      disabled={pending}
                      onCheckedChange={(checked) => setRowSelected(meeting.meetingId, checked)}
                      aria-label={t('records.selectRecord', { name: title })}>
                      <Checkbox.Indicator className={CHECKBOX_INDICATOR_CLASS}><Check aria-hidden="true" size={12} strokeWidth={3} /></Checkbox.Indicator>
                    </Checkbox.Root>
                  </td> : null}
                  <td role="rowheader" className="nola-records-table__name table__cell"><div className="nola-records-table__title">{live ? <Mic aria-hidden="true" className="text-accent" /> : <FileText aria-hidden="true" />}<Button variant="secondary" onClick={() => onOpen(meeting.meetingId)} className="nola-records-table__open">{title}</Button></div></td>
                  <td className="nola-records-table__time table__cell">{formatDateTime(meeting.endedAtMs ?? meeting.startedAtMs)}</td>
                  <td className="nola-records-table__duration table__cell">{formatClock(meeting.durationMs)}</td>
                  <td className="nola-records-table__language table__cell">{languageLabel(meeting.sourceLanguage)} → {languageLabel(meeting.targetLanguage)}</td>
                  <td className="nola-records-table__status table__cell"><span className={statusClass}><i aria-hidden="true" />{statusLabel}</span></td>
                  <td className="nola-records-table__actions table__cell"><div className="nola-records-table__action-group">
                    {onRename ? <Button variant="secondary" size="icon" aria-label={t('homeRecordsUi.detail')} className="nola-records-table__view nola-records-table__icon-action" onClick={() => onOpen(meeting.meetingId)}><Eye aria-hidden="true" size={18} /></Button> : null}
                    <Menu.Root>
                      <Menu.Trigger render={<Button size="icon" variant="secondary" className="nola-records-table__icon-action" aria-label={t('homeRecordsUi.moreActions', { name: title })}><MoreHorizontal aria-hidden="true" size={18} /></Button>} />
                      <Menu.Portal>
                        <Menu.Positioner className="z-dropdown" sideOffset={4}>
                          <Menu.Popup className={MENU_POPUP_CLASS}>
                            <Menu.List>
                              <Menu.Item id="view" label={t('homeRecordsUi.detail')} className={MENU_ITEM_CLASS} onClick={() => onOpen(meeting.meetingId)}><Eye aria-hidden="true" size={18} />{t('homeRecordsUi.detail')}</Menu.Item>
                              {onRename ? <Menu.Item id="rename" label={t('records.rename')} disabled={pending} className={MENU_ITEM_CLASS} onClick={() => onRename(meeting)}><Pencil aria-hidden="true" size={18} />{t('records.rename')}</Menu.Item> : null}
                              {onExport ? <Menu.Item id="export" label={t('records.export')} className={MENU_ITEM_CLASS} onClick={() => onExport(meeting)}><Download aria-hidden="true" size={18} />{t('records.export')}</Menu.Item> : null}
                              {onDelete ? <Menu.Item id="delete" label={t('records.delete')} disabled={pending} className={`${MENU_ITEM_CLASS} text-nola-ui-destructive`} onClick={() => onDelete(meeting)}><Trash2 aria-hidden="true" size={18} />{t('records.delete')}</Menu.Item> : null}
                            </Menu.List>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.Root>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
