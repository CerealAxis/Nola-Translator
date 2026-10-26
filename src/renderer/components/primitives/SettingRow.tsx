import { useId, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface SettingRowProps {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Move `desc` into a tooltip on the label: a dialog row fits only the label and
   * the control, and a description underneath would stretch it into three bands.
   *
   * The label itself is the trigger and carries `tabIndex`, so the description
   * also reaches keyboard users, who cannot hover. Width is a utility class:
   * `settings-row__tooltip` is not loaded outside the settings feature.
   */
  descriptionTooltip?: boolean
}
const LABEL_CLASS = 'text-sm font-medium text-foreground'
const TOOLTIP_CLASS = 'z-popup max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay'
export function SettingRow({ label, desc, children, className = '', descriptionTooltip = false }: SettingRowProps) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className={['nola-setting-row', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        {desc && descriptionTooltip ? <Tooltip>
          <TooltipTrigger delay={300} render={<span id={labelId} className={LABEL_CLASS} tabIndex={0}>{label}</span>} />
          <TooltipContent sideOffset={3} className={TOOLTIP_CLASS}>{desc}</TooltipContent>
        </Tooltip> : <span id={labelId} className={LABEL_CLASS}>{label}</span>}
        {desc && !descriptionTooltip ? <p className="mt-1 text-xs text-muted">{desc}</p> : null}
      </div>
      <div className="nola-setting-control">{children}</div>
    </div>
  )
}
