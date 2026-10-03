/**
 * 模型配置 feature 的公开出口。
 *
 * 编排者（main.tsx）只需要 `ModelsPage` 这一个页面组件；`ModelCard` 是台账第 7 项，
 * 台账归属在 feature 层，所以从这里一并导出，方便别的 feature 复用。
 */

export { ModelsPage } from './ModelsPage'
export type { ModelsTab } from './ModelsPage'
export { ModelCard, ModelCardSkeleton } from './ModelCard'
export type { ModelCardProps } from './ModelCard'
export { ModelMark, brandOf, brandOfRepo } from './modelBrand'
export type { ModelBrand, ModelMarkProps } from './modelBrand'
