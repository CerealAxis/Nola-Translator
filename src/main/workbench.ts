import type { BrowserWindow } from 'electron'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { registerLanguageModelIpc, type LanguageModelServices } from './language-model'
import { isTrustedRendererUrl } from './window-options'

/** The embedded workbench shares the main renderer and keeps its jobs alive across routes. */
export function registerWorkbench(
  getMainWindow: () => BrowserWindow | null,
  mainDirectory: string,
  services: LanguageModelServices,
  activity?: FeatureActivity,
): { stop(): Promise<void> } {
  let lease: FeatureLease | null = null
  let closing: Promise<void> | null = null
  const languageModels = registerLanguageModelIpc(services, sender => {
    const main = getMainWindow()
    if (!main || main.isDestroyed() || sender !== main.webContents ||
      !isTrustedRendererUrl(sender.getURL(), mainDirectory) || closing || activity?.isStopping('workbench')) return false
    const entry = new URL(sender.getURL()).pathname.split('/').at(-1)
    if (entry && entry !== 'index.html') return false
    return true
  }, running => {
    if (running && activity && !lease) {
      lease = activity.acquire('workbench', stop)
      lease.running()
    } else if (!running) {
      lease?.release()
      lease = null
    }
  })
  const stop = (): Promise<void> => {
    if (closing) return closing
    lease?.stopping()
    const task = languageModels.cancelAll().then(() => {
      lease?.release()
      lease = null
    }).finally(() => { if (closing === task) closing = null })
    closing = task
    return task
  }
  return { stop }
}
