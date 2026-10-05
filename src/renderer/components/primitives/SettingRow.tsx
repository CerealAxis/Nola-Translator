import type { ReactNode } from 'react'
import { Description, Label, Tooltip } from '@heroui/react'
export interface SettingRowProps {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
  /**
   * 把 `desc` 从行内挪进标签的 Tooltip。弹窗里一行只放得下标签与控件，
   * 说明文字再挂在下面就会把这一行撑成三段。
   *
   * **触发器必须自己吃下 tooltip 的 focusable context**：HeroUI 的 `Tooltip` 只是
   * react-aria-components `TooltipTrigger` 的一层壳，悬停/聚焦处理器与定位用的 ref 都由它内部的
   * `FocusableProvider` 提供，只有消费 `FocusableContext` 的子元素拿得到。`Label` 是对
   * react-aria-components `Label` 的透传，**不消费**这个 context —— 把标签光秃秃丢进 `Tooltip`
   * 就没有处理器也没有锚点，说明文字在任何输入方式下都弹不出来。所以这里套一层
   * `Tooltip.Trigger`：标签本身仍然是可悬停、可 Tab 的目标，窄弹窗里也就不必再塞一个图标。
   * `features/settings/SettingsRow.tsx` 用一个 `isIconOnly` 的 `Button` 加 `CircleHelp` 图标，
   * 那是能用的参考写法，区别只在触发器换成 `Tooltip.Trigger`。
   *
   * 宽度用工具类而不是设置页那个 `settings-row__tooltip`：后者定义在
   * `features/settings/settings.css` 里，工作台没引那份样式，写了等于没写。
   */
  descriptionTooltip?: boolean
}
export function SettingRow({ label, desc, children, className = '', descriptionTooltip = false }: SettingRowProps) {
  const labelNode = <Label className="text-sm font-medium text-foreground">{label}</Label>
  return (
    <div className={`nola-setting-row ${className}`}>
      <div className="min-w-0">
        {desc && descriptionTooltip ? <Tooltip delay={300}>
          <Tooltip.Trigger>{labelNode}</Tooltip.Trigger>
          <Tooltip.Content className="max-w-96 whitespace-normal">{desc}</Tooltip.Content>
        </Tooltip> : labelNode}
        {desc && !descriptionTooltip ? <Description className="mt-1 text-xs text-muted">{desc}</Description> : null}
      </div>
      <div className="nola-setting-control">{children}</div>
    </div>
  )
}
