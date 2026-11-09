import type { LucideIcon } from 'lucide-react'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Button } from '../ui/button'
export interface NavigationItemProps {
  id?: string
  icon: LucideIcon
  label: string
  active?: boolean
  onPress?: () => void
  hint?: string
  onboardingTarget?: string
}
export function NavigationItem({ id, icon: Icon, label, active = false, onPress, hint, onboardingTarget }: NavigationItemProps) {
  return (
    <SidebarMenuButton
      render={<Button variant="nav" size="icon" />}
      tooltip={hint ?? label}
      isActive={active}
      onClick={onPress}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-onboarding={onboardingTarget ?? (id ? `nav-${id}` : undefined)}
      className="nola-nav-button"
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      <span className="nola-nav-label" aria-hidden="true">{label}</span>
    </SidebarMenuButton>
  )
}
