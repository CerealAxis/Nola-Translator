export type ActiveFeature = 'workbench' | 'interpretation' | 'browser-captions' | 'model-gateway'
export function featureConflictOwner(error: unknown): ActiveFeature | undefined {
  const message = error instanceof Error ? error.message : String(error)
  return /FEATURE_CONFLICT:(workbench|interpretation|browser-captions|model-gateway)/.exec(message)?.[1] as ActiveFeature | undefined
}
export interface FeatureActivitySnapshot {
  owner: ActiveFeature | null
  phase: 'idle' | 'starting' | 'running' | 'stopping'
}
export interface FeatureActivityApi {
  snapshot(): Promise<FeatureActivitySnapshot>
  stop(): Promise<void>
  onChanged(callback: (snapshot: FeatureActivitySnapshot) => void): () => void
}
