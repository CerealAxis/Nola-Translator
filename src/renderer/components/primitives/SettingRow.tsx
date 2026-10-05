import type { ReactNode } from 'react'
import { Description, Label, Tooltip } from '@heroui/react'
export interface SettingRowProps {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Move `desc` into a tooltip on the label: a dialog row fits only the label and
   * the control, and a description underneath would stretch it into three bands.
   *
   * The trigger must be `Tooltip.Trigger` — HeroUI's `Tooltip` delegates handlers
   * and anchor to an internal `FocusableProvider` that `Label` does not consume,
   * so a bare label never opens. Width is a utility class: `settings-row__tooltip`
   * is not loaded outside the settings feature.
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
