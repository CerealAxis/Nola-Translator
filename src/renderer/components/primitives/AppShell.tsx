/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/i18n'
import nolaLogoUrl from '../../../../assets/brand/nola-logo.svg'
import { FeatureActivityNotice } from './FeatureActivityNotice'
import { TitleBar } from './TitleBar'
import { NavigationItem } from './NavigationItem'

export interface AppShellNavigationItem {
  id: string
  label: string
  icon: LucideIcon
  path: string
  section: 'main' | 'tools' | 'secondary'
  active?: boolean
  onPress?: () => void
}
export interface AppShellProps {
  children: ReactNode
  navigation?: AppShellNavigationItem[]
  title?: string
  className?: string
}
export function AppShell({ children, navigation, title, className = '' }: AppShellProps) {
  const { t } = useI18n()
  const compact = useIsMobile(1025)
  const account = t('shellUi.localAccount')
  const name = t('app.name')
  const pageTitle = title ?? navigation?.find(item => item.active)?.label ?? name
  const home = navigation?.find(item => item.id === 'home')
  const quickAction = navigation?.find(item => item.id === 'workspace')
  const main = navigation?.filter(item => item.section === 'main' && item !== quickAction) ?? []
  const tools = navigation?.filter(item => item.section === 'tools') ?? []
  const secondary = navigation?.filter(item => item.section === 'secondary') ?? []

  return (
    <div className={`nola-app-shell ${className}`}>
      <FeatureActivityNotice />
      <SidebarProvider className="nola-shell-layout" defaultOpen={!compact}>
        <Sidebar variant="inset" className="nola-sidebar">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Button variant="nav" />} tooltip={name} aria-label={name}
                  className="nola-sidebar-brand nola-nav-button" onClick={home?.onPress}>
                  <img src={nolaLogoUrl} alt="" />
                  <span className="nola-sidebar-copy" aria-hidden="true">{name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="nola-sidebar-nav" aria-label={t('shellUi.mainNavigation')}>
            <SidebarGroup>
              <SidebarGroupContent className="nola-sidebar-main-group">
                {quickAction ? <NavigationMenu items={[quickAction]} /> : null}
                <NavigationMenu items={main} />
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>{t('shellUi.toolsGroup')}</SidebarGroupLabel>
              <SidebarGroupContent><NavigationMenu items={tools} /></SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupContent><NavigationMenu items={secondary} /></SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="nola-sidebar-footer">
            <SidebarMenu>
              <SidebarMenuItem className="nola-sidebar-account" title={account}>
                <Avatar aria-hidden="true"><AvatarFallback>N</AvatarFallback></Avatar>
                <span className="nola-sidebar-copy">{account}</span>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="nola-shell-content">
          <TitleBar brand={false} leading={
            <div className="nola-shell-heading">
              <SidebarTrigger className="nola-no-drag nola-titlebar-icon nola-sidebar-trigger"
                expandLabel={t('shellUi.expandSidebar')} collapseLabel={t('shellUi.collapseSidebar')} />
              <Separator orientation="vertical" />
              <span className="nola-shell-heading__title" title={pageTitle}>{pageTitle}</span>
            </div>
          } />
          <div className="nola-app-body">
            <main className="nola-main">{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

function NavigationMenu({ items }: { items: AppShellNavigationItem[] }) {
  return (
    <SidebarMenu>
      {items.map(item => (
        <SidebarMenuItem key={item.id}><NavigationItem {...item} /></SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
