/**
 * Opens the user's default browser through the app bridge.
 *
 * This used to fake the capability with a local type assertion and a `TODO(bridge)`, which meant
 * the button always rejected and toasted. `bridge.app.openDefaultBrowser()` is a real channel now,
 * so the page calls it and a failure is a genuine failure rather than a missing feature.
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