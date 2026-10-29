import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface ModelAvailabilityLabelProps {
  label: ReactNode
  hint: ReactNode
}

/** Explain why a model can be missing without adding unavailable models to the picker. */
export function ModelAvailabilityLabel({ label, hint }: ModelAvailabilityLabelProps) {
  return <span className="inline-flex items-center gap-1">{label}<Tooltip>
    <TooltipTrigger render={<button type="button" className="inline-flex text-muted" aria-label={typeof label === 'string' ? label : undefined} />}>
      <CircleHelp className="size-3.5" aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent>{hint}</TooltipContent>
  </Tooltip></span>
}
