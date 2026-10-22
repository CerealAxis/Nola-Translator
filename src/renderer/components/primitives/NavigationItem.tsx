import type { LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '../ui/button'
export interface NavigationItemProps {
  id?: string
  icon: LucideIcon
  label: string
  active?: boolean
  onPress?: () => void
}
/**
 * The sidebar collapses to icons under 1024px, where `.nola-nav-label` is hidden
 * and the tooltip carries the name; the popup keeps `nola-nav-tooltip` so it
 * stays out of the way at full width.
 */
export function NavigationItem({ id, icon: Icon, label, active = false, onPress }: NavigationItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger delay={800} render={<Button
        variant={active ? 'default' : 'secondary'}
        onClick={onPress}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-active={active}
        data-onboarding={id ? `nav-${id}` : undefined}
        className="nola-nav-button h-14 justify-start gap-4 px-4 max-[1024px]:justify-center max-[1024px]:px-0"
      >
        <Icon aria-hidden="true" />
        <span className="nola-nav-label">{label}</span>
      </Button>} />
      <TooltipContent sideOffset={3} className="nola-nav-tooltip z-popup max-w-xs whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay">
            {label}
          </TooltipContent>
    </Tooltip>
  )
}
