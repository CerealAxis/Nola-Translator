import type { LucideIcon } from 'lucide-react'
import { Button, Tooltip } from '@heroui/react'
export interface NavigationItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  onPress?: () => void
}
export function NavigationItem({ icon: Icon, label, active = false, onPress }: NavigationItemProps) {
  return (
    <Tooltip delay={800}>
      <Button
        variant="ghost"
        onPress={onPress}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-active={active}
        className="nola-nav-button"
      >
        <Icon aria-hidden="true" />
        <span className="nola-nav-label">{label}</span>
      </Button>
      <Tooltip.Content className="nola-nav-tooltip">{label}</Tooltip.Content>
    </Tooltip>
  )
}
