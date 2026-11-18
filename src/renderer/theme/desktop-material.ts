import { settingsStore } from '@/store/settingsStore'
import type { UiFont } from '../../shared/settings'
import { loadInterfaceFont } from './interface-font'

let requestedFont: UiFont | undefined
let fontRequest = 0

function applyAppearancePreferences(): void {
  const appearance = settingsStore.getState().settings?.appearance
  const root = document.documentElement
  root.dataset.density = appearance?.density ?? 'compact'
  const font = appearance?.interfaceFont ?? 'system'
  if (font !== requestedFont) {
    requestedFont = font
    const request = ++fontRequest
    root.style.removeProperty('--nola-font-family')
    root.dataset.fontState = font === 'system' ? 'ready' : 'loading'
    void loadInterfaceFont(font).then(() => {
      if (request !== fontRequest) return
      if (font !== 'system') root.style.setProperty('--nola-font-family', `"${font}", var(--font-system)`)
      root.dataset.fontState = 'ready'
      window.dispatchEvent(new Event('nola-font-state'))
    }).catch(() => {
      if (request !== fontRequest) return
      root.dataset.fontState = 'error'
      window.dispatchEvent(new Event('nola-font-state'))
    })
  }
}

applyAppearancePreferences()
const unsubscribe = settingsStore.subscribe(applyAppearancePreferences)
import.meta.hot?.dispose(unsubscribe)
