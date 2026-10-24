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
export function NavigationItem({ id, icon: Icon, label, active = false, onPress }: NavigationItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger delay={400} render={<Button
        variant={active ? 'default' : 'secondary'}
        size="icon"
        onClick={onPress}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-active={active}
        data-onboarding={id ? `nav-${id}` : undefined}
        className="nola-nav-button p-0"
      >
        <Icon aria-hidden="true" />
        <span className="nola-nav-label sr-only">{label}</span>
      </Button>} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
