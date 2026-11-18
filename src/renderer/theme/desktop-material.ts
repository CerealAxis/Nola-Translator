import { settingsStore } from '@/store/settingsStore'
import { GLASS_CONTROLS, type GlassControl, type UiFont } from '../../shared/settings'
import { loadInterfaceFont } from './interface-font'

const materialProperties = {
  glassBlur: '--nola-glass-blur',
  glassOpacity: '--nola-glass-opacity',
  glassSaturation: '--nola-glass-saturation',
} satisfies Record<GlassControl, string>
const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)')

let requestedFont: UiFont | undefined
let fontRequest = 0

function applyMaterialPreference(): void {
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
  const mode = appearance?.liquidGlass === false || reducedTransparency.matches ? 'off' : 'on'
  if (root.dataset.nolaGlass !== mode) root.dataset.nolaGlass = mode
  for (const key of Object.keys(materialProperties) as GlassControl[]) {
    const { initial, unit } = GLASS_CONTROLS[key]
    const property = materialProperties[key]
    const value = `${appearance?.[key] ?? initial}${unit}`
    if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value)
  }
}

applyMaterialPreference()
const unsubscribe = settingsStore.subscribe(applyMaterialPreference)
reducedTransparency.addEventListener('change', applyMaterialPreference)
import.meta.hot?.dispose(() => {
  unsubscribe()
  reducedTransparency.removeEventListener('change', applyMaterialPreference)
})
