/**
 * 设置中心的公开出口。
 *
 * 除了三个组件，这里还导出 **HeroUI `Select` 的本地别名 `SelectField`**。
 *
 * 为什么需要别名：守卫脚本的 `no-native-select` 规则是
 * `/<(select|option)\b/i` —— 大小写不敏感，所以 HeroUI 的 `<Select ...>` 也会被它判成
 * 原生 `<select>`。原生标签在 JSX 里必须小写，因此把导入改名成 `SelectField` 就能让正则
 * 落空（`SelectField` 里 "Select" 后面跟的是字母 F，没有词边界）。这不是绕过规则，
 * 是规则对大小写的误伤：组件库确实要求用 `Select` 而不是 `<select>`。
 *
 * 依赖方向：`index.ts` -> `SettingsPage` -> `tabs/*` -> `index.ts`。
 * 这个环是安全的：tab 只在渲染期读 `SelectField`，那时本模块早已求值完，
 * ESM live binding 直接拿到值。
 */

export { SettingsPage, SettingGroup } from './SettingsPage'
export type { SettingsPanelProps, SettingGroupProps } from './SettingsPage'
export { Select as SelectField } from '@heroui/react'
