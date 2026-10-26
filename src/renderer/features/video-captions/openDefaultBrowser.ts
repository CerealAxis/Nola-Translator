/**
 * Opens the user's default browser through the app bridge.
 *
 * The bridge is reached through `getBridge()` rather than `window.nolaTranslator`: components may
 * only talk to stores and the bridge, and `getBridge()` is the one accessor that hands it out.
 */
import { getBridge } from '@/store'

export function openDefaultBrowser(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return Promise.reject(new Error('no app bridge'))
  return bridge.app.openDefaultBrowser()
}