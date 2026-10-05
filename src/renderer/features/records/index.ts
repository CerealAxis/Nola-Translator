/** The records feature: list, detail and the two dialogs. */
export { RecordsPage } from './RecordsPage'
export { RecordDetailPage } from './RecordDetailPage'
export { ExportDialog } from './ExportDialog'
export type { ExportDialogProps } from './ExportDialog'
export { RenameDialog, TITLE_MAX_LENGTH } from './RenameDialog'
export type { RenameDialogProps } from './RenameDialog'

// The pure logic is exported on its own: search, sort, pagination and the time formats touch neither JSX nor a store, so they are directly testable.
export {
  clampPage,
  endedAt,
  fallbackTitle,
  formatClock,
  formatDateTime,
  formatDuration,
  matches,
  pageNumbers,
  sortByEndTime,
} from './recordLogic'
