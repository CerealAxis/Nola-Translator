import type { ReactNode } from 'react'
import { Description, Label } from '@heroui/react'

/**
 * 设置页那一屏专用的行布局。**不是** `@/components/primitives` 里那个 `SettingRow`。
 *
 * 两者同名不同物，而且长得很像但不通用：
 *   · 本组件（`.settings-row`）—— 设置页自己的一行：标签列更宽、控件列 1.15fr、
 *     行间有一条 `var(--separator)` 分隔线、控件在窄屏换行后靠左。
 *     见 `settings.css`。
 *   · 通用件（`.nola-setting-row`）—— 工作台会话设置弹窗用的一行：无分隔线、
 *     两列比例不同。见 `theme/app.css`。
 *
 * 早期两份都叫 `SettingRow`，读代码时无从判断 import 到的是哪一个；这里把设置页这个
 * 改名成 `SettingsRow`，「通用件叫 SettingRow、专用的带前缀」这条规矩才好记。
 */
export function SettingsRow({ label, desc, children, className = '' }: {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`settings-row ${className}`}>
      <div className="settings-row__label">
        <Label>{label}</Label>
        {desc ? <Description>{desc}</Description> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}
