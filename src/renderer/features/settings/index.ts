/**
 * Public entry point of the settings centre.
 *
 * HeroUI's `Select` is re-exported as `SelectField` so no import here spells a name that
 * differs from a native `<select>` only by case. Tabs must read it during render rather than
 * at module scope: `tabs/*` imports this module, so the cycle resolves through the live
 * binding only once this module has finished evaluating.
 */

export { SettingsPage, SettingGroup } from './SettingsPage'
export type { SettingsPanelProps, SettingGroupProps } from './SettingsPage'
export { Select as SelectField } from '@heroui/react'
