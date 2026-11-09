import { settingsStore } from '@/store/settingsStore'
import { GLASS_CONTROLS, type GlassControl } from '../../shared/settings'

const materialProperties = {
  glassBlur: '--nola-glass-blur',
  glassOpacity: '--nola-glass-opacity',
  glassSaturation: '--nola-glass-saturation',
} satisfies Record<GlassControl, string>

// 各桌面窗口通过同一个设置 Store 接收外观更新，旧配置默认启用毛玻璃。
function applyMaterialPreference(): void {
  const appearance = settingsStore.getState().settings?.appearance
  const root = document.documentElement
  const mode = appearance?.liquidGlass === false ? 'off' : 'on'
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
import.meta.hot?.dispose(unsubscribe)
