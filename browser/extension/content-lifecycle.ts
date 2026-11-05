import { requestId } from './id'
import { restorePageTranslationArtifacts } from './page-translation'

const REPLACE_RUNTIME = 'nola:replace-content-runtime'
interface ContentRuntime { owner: string; destroy(): void; valid(): boolean }
const scope = globalThis as typeof globalThis & { __nolaContentRuntime?: ContentRuntime }
export function extensionContextValid(): boolean {
  try { return Boolean(chrome.runtime.getManifest().version) } catch { return false }
}
export function prepareContentRuntime(): string | undefined {
  if (!extensionContextValid()) return
  const existing = scope.__nolaContentRuntime
  if (existing) {
    try { if (existing.valid()) return } catch { /* The old realm may already be invalid. */ }
    try { existing.destroy() } catch { /* Inert DOM is removed below. */ }
    if (scope.__nolaContentRuntime === existing) delete scope.__nolaContentRuntime
  }
  // A fresh isolated world cannot reach the old registry after an extension reload.
  // Ask any surviving runtime to release its resources, then remove inert DOM artifacts.
  document.dispatchEvent(new Event(REPLACE_RUNTIME))
  restorePageTranslationArtifacts(document)
  document.querySelectorAll('[data-nola-extension], [data-nola-caption-styles]').forEach(node => node.remove())
  const owner = requestId()
  document.documentElement.dataset.nolaInstalled = owner
  return owner
}
export function registerContentRuntime(owner: string, destroy: () => void): () => void {
  const state = { owner, destroy, valid: extensionContextValid }
  scope.__nolaContentRuntime = state
  document.addEventListener(REPLACE_RUNTIME, destroy)
  return () => {
    document.removeEventListener(REPLACE_RUNTIME, destroy)
    if (scope.__nolaContentRuntime === state) delete scope.__nolaContentRuntime
    if (document.documentElement.dataset.nolaInstalled === owner) delete document.documentElement.dataset.nolaInstalled
  }
}
