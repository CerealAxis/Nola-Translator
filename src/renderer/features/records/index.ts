/**
 * 同传记录 feature 层：列表、详情、两个弹窗。
 *
 * 记录屏没有自创组件（DESIGN 第 11.2 节的台账里记录屏只用到 `DualColumnView` 与
 * `AudioPlayerBar`，那两个在 `@/components/reading`），所以这里全是编排。
 */

export { RecordsPage } from './RecordsPage'
export { RecordDetailPage } from './RecordDetailPage'
export { ExportDialog } from './ExportDialog'
export type { ExportDialogProps } from './ExportDialog'
export { RenameDialog, TITLE_MAX_LENGTH } from './RenameDialog'
export type { RenameDialogProps } from './RenameDialog'

// 纯逻辑单独导出：搜索 / 排序 / 分页 / 时间格式化不依赖 JSX 与 store，可以直接测。
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
