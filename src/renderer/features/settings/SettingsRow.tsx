import { useId } from 'react'
import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Row layout for the settings tabs — not the `SettingRow` in `@/components/primitives`.
 *
 * Near-identical names, not interchangeable: this one is `.settings-row` (wider label column,
 * `var(--separator)` rule between rows, `settings.css`); the primitive is `.nola-setting-row`.
 */
export interface SettingsRowProps {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
  descriptionTooltip?: boolean
  onboardingTarget?: string
}

const LABEL_CLASS = 'text-sm font-medium text-foreground'
/** `.settings-row__help` boxes the button to 24px; the button's own min-height would stretch it. */
const HELP_BUTTON_CLASS = 'settings-row__help min-h-6'
const TOOLTIP_CLASS = 'z-overlay max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay'

export function SettingsRow({ label, desc, children, className = '', descriptionTooltip = false, onboardingTarget }: SettingsRowProps) {
  const labelId = useId()
  const infoId = useId()
  const { t } = useI18n()
  return (
    <div className={['settings-row', className].filter(Boolean).join(' ')} data-onboarding={onboardingTarget}>
      <div className="settings-row__label">
        <div className="settings-row__title">
          <Label id={labelId} className={LABEL_CLASS}>{label}</Label>
          {desc && descriptionTooltip ? <Tooltip>
            {/*
             * The help button is the trigger, not the label: a label is not focusable, so the
             * description would stay out of reach of keyboard users. Its accessible name is the
             * row label, which also covers labels that are not plain strings.
             */}
            <TooltipTrigger delay={300} render={<Button variant="secondary" size="icon" className={HELP_BUTTON_CLASS} aria-labelledby={`${labelId} ${infoId}`}><CircleHelp aria-hidden="true" /></Button>} />
            <span id={infoId} className="sr-only">{t('common.info')}</span>
            <TooltipContent className={[TOOLTIP_CLASS, 'settings-row__tooltip'].join(' ')} sideOffset={3}>{desc}</TooltipContent>
          </Tooltip> : null}
        </div>
        {desc && !descriptionTooltip ? <p className="text-xs text-muted wrap-break-word">{desc}</p> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}
