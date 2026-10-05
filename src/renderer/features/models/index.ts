/**
 * Public entry point of the models feature.
 *
 * `ModelCard` is one of the feature-layer components DESIGN §11.2 keeps out of the primitives
 * list, so it is re-exported here for the other features to reuse.
 */

export { ModelsPage } from './ModelsPage'
export type { ModelsTab } from './ModelsPage'
export { ModelCard, ModelCardSkeleton } from './ModelCard'
export type { ModelCardProps } from './ModelCard'
export { ModelMark, brandOf, brandOfRepo } from './modelBrand'
export type { ModelBrand, ModelMarkProps } from './modelBrand'
