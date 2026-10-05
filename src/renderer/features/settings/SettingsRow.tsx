import type { ReactNode } from 'react'
import { Button, Description, Label, Tooltip } from '@heroui/react'
import { CircleHelp } from 'lucide-react'

/**
 * Row layout for the settings tabs — not the `SettingRow` in `@/components/primitives`.
 *
 * Near-identical names, not interchangeable: this one is `.settings-row` (wider label column,
 * `var(--separator)` rule between rows, `settings.css`); the primitive is `.nola-setting-row`.
 */
export function SettingsRow({ label, desc, children, className = '', descriptionTooltip = false }: {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
  descriptionTooltip?: boolean
}) {
  return (
    <div className={`settings-row ${className}`}>
      <div className="settings-row__label">
        <div className="settings-row__title">
          <Label>{label}</Label>
          {desc && descriptionTooltip ? <Tooltip delay={300}>
            <Button variant="ghost" size="sm" isIconOnly aria-label={typeof label === 'string' ? `${label} — Info` : 'Info'} className="settings-row__help">
              <CircleHelp size={15} aria-hidden="true" />
            </Button>
            <Tooltip.Content className="settings-row__tooltip">{desc}</Tooltip.Content>
          </Tooltip> : null}
        </div>
        {desc && !descriptionTooltip ? <Description>{desc}</Description> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}
