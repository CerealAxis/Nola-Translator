import type { ReactNode } from 'react'
import { Button, Checkbox, Dropdown, Table } from '@heroui/react'
import type { Selection, SortDescriptor } from '@react-types/shared'
import { Eye, FileText, Mic, MoreHorizontal, Pencil, Download, Trash2 } from 'lucide-react'
import { LANGUAGE_LABELS } from '@/bridge'
import type { MeetingMeta } from '@/bridge'
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
  /** `Table.Row` ids double as the selection keys, so this is a set of meeting ids. */
  selectedKeys?: Selection
  /** Omitted leaves the table without checkboxes, the way the home page's short list reads. */
  onSelectionChange?: (keys: Selection) => void
}
export function RecordsTable({ meetings, onOpen, onRename, onExport, onDelete, pendingIds = [], sortAscending = false, onSortChange, selectedKeys, onSelectionChange }: RecordsTableProps): ReactNode {
  const { t, language } = useI18n()
  const selectable = !!onSelectionChange
  const languageLabel = (code: string) => {
    const label = LANGUAGE_LABELS[code]
    return label ? (language === 'zh-CN' ? label.zh : label.en) : code
  }
  return (
    <Table variant="secondary" className="nola-records-table">
      <Table.ScrollContainer className="nola-records-table__container">
        <Table.Content
          aria-label={t('records.title')}
          sortDescriptor={onSortChange ? { column: 'time', direction: sortAscending ? 'ascending' : 'descending' } : undefined}
          onSortChange={onSortChange ? (descriptor: SortDescriptor | null) => onSortChange(descriptor?.direction === 'ascending') : undefined}
          selectionMode={selectable ? 'multiple' : undefined}
          selectedKeys={selectable ? selectedKeys : undefined}
          onSelectionChange={selectable ? onSelectionChange : undefined}
        >
          <Table.Header>
            {/*
             * `slot="selection"` is what binds the box to react-aria's row
             * selection: without it the box is an isolated control and the header
             * one toggles nothing.
             */}
            {selectable ? <Table.Column className="nola-records-table__select">
              <Checkbox aria-label={t('records.selectAllPage')} slot="selection">
                <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox.Content>
              </Checkbox>
            </Table.Column> : null}
            <Table.Column isRowHeader id="name" className="nola-records-table__name">{t('records.columnName')}</Table.Column>
            <Table.Column id="time" allowsSorting={!!onSortChange} className="nola-records-table__time">{({ sortDirection }) => onSortChange ? <Table.SortableColumnHeader sortDirection={sortDirection}>{t('homeRecordsUi.time')}</Table.SortableColumnHeader> : t('homeRecordsUi.time')}</Table.Column>
            <Table.Column id="duration" className="nola-records-table__duration">{t('records.columnDuration')}</Table.Column>
            <Table.Column id="language" className="nola-records-table__language">{t('homeRecordsUi.language')}</Table.Column>
            <Table.Column id="status" className="nola-records-table__status">{t('homeRecordsUi.status')}</Table.Column>
            <Table.Column id="actions" className="nola-records-table__actions">{t('records.columnActions')}</Table.Column>
          </Table.Header>
          <Table.Body>
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
              return (
                <Table.Row key={meeting.meetingId} id={meeting.meetingId} textValue={title} data-testid={'recent-' + meeting.meetingId}>
                  {selectable ? <Table.Cell className="nola-records-table__select">
                    <Checkbox aria-label={t('records.selectRecord', { name: title })} slot="selection" variant="secondary" isDisabled={pending}>
                      <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox.Content>
                    </Checkbox>
                  </Table.Cell> : null}
                  <Table.Cell className="nola-records-table__name"><div className="nola-records-table__title">{live ? <Mic aria-hidden="true" className="text-accent" /> : <FileText aria-hidden="true" />}<Button variant="ghost" onPress={() => onOpen(meeting.meetingId)} className="nola-records-table__open">{title}</Button></div></Table.Cell>
                  <Table.Cell className="nola-records-table__time">{formatDateTime(meeting.endedAtMs ?? meeting.startedAtMs)}</Table.Cell>
                  <Table.Cell className="nola-records-table__duration">{formatClock(meeting.durationMs)}</Table.Cell>
                  <Table.Cell className="nola-records-table__language">{languageLabel(meeting.sourceLanguage)} → {languageLabel(meeting.targetLanguage)}</Table.Cell>
                  <Table.Cell className="nola-records-table__status"><span className={statusClass}><i aria-hidden="true" />{statusLabel}</span></Table.Cell>
                  <Table.Cell className="nola-records-table__actions"><div className="nola-records-table__action-group">
                    {onRename ? <Button variant="ghost" size="sm" className="nola-records-table__view" onPress={() => onOpen(meeting.meetingId)}>{t('records.view')}</Button> : null}
                    <Dropdown>
                      <Button isIconOnly size="sm" variant="ghost" aria-label={t('homeRecordsUi.moreActions', { name: title })}><MoreHorizontal aria-hidden="true" size={18} /></Button>
                      <Dropdown.Popover>
                        <Dropdown.Menu>
                          <Dropdown.Item id="view" textValue={t('homeRecordsUi.detail')} onAction={() => onOpen(meeting.meetingId)}><Eye aria-hidden="true" size={18} />{t('homeRecordsUi.detail')}</Dropdown.Item>
                          {onRename ? <Dropdown.Item id="rename" textValue={t('records.rename')} isDisabled={pending} onAction={() => onRename(meeting)}><Pencil aria-hidden="true" size={18} />{t('records.rename')}</Dropdown.Item> : null}
                          {onExport ? <Dropdown.Item id="export" textValue={t('records.export')} onAction={() => onExport(meeting)}><Download aria-hidden="true" size={18} />{t('records.export')}</Dropdown.Item> : null}
                          {onDelete ? <Dropdown.Item id="delete" variant="danger" textValue={t('records.delete')} isDisabled={pending} onAction={() => onDelete(meeting)}><Trash2 aria-hidden="true" size={18} />{t('records.delete')}</Dropdown.Item> : null}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </div></Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  )
}

