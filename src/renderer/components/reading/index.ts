/**
 * 阅读台账组件。DESIGN 第 11.2 节里归 feature 层的 5 个组件中的 2 个。
 *
 * 另外 3 个（`ModelCard` / `CaptionLine` / `NotesPanel`）不属于本次两屏：
 * `ModelCard` 归模型配置屏，`CaptionLine` 与 `NotesPanel` 归工作台。
 * `CaptionStage`（工作台那侧的双栏）也不在这里，它是另一个 Agent 的交付物，
 * 与这里的 `DualColumnView` 行为不同，不要合并。
 *
 * 组件内不出现中文字面量，全部走 `useI18n().t()`。
 */

export { DualColumnView, lineOpacity } from './DualColumnView'
export type { DualColumnViewProps, DualColumnSegment } from './DualColumnView'

export { AudioPlayerBar, formatClock } from './AudioPlayerBar'
export type { AudioPlayerBarProps } from './AudioPlayerBar'
