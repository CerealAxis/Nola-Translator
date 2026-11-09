/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import { EllipsisVertical, UserRound, type LucideIcon } from 'lucide-react'
import nolaAvatarUrl from '@/assets/nola-avatar.png'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader,
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
  section: 'overview' | 'features' | 'settings'
  active?: boolean
  onPress?: () => void
}
export interface AppShellProps {
  children: ReactNode
  navigation?: AppShellNavigationItem[]
  title?: string
  className?: string
}

const LOCAL_ACCOUNT_EMAIL = 'local@xaviermc.top'

export function AppShell({ children, navigation, title, className = '' }: AppShellProps) {
  const { t } = useI18n()
  const compact = useIsMobile(1025)
  const name = 'Nola Translator'
  const account = t('shellUi.localAccount')
  const pageTitle = title ?? navigation?.find(item => item.active)?.label ?? name
  const home = navigation?.find(item => item.id === 'home')

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
            {navigation && (['overview', 'features', 'settings'] as const).map(section => (
              <SidebarGroup key={section}>
                {section === 'features' && <SidebarGroupLabel>{t('shellUi.toolsGroup')}</SidebarGroupLabel>}
                <SidebarMenu>
                  {navigation.filter(item => item.section === section).map(item => (
                    <SidebarMenuItem key={item.id}><NavigationItem {...item} /></SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="nola-sidebar-footer">
            <SidebarMenu>
              <SidebarMenuItem className="nola-sidebar-account" title={LOCAL_ACCOUNT_EMAIL}>
                <Avatar aria-hidden="true">
                  <AvatarImage src={nolaAvatarUrl} alt="" />
                  <AvatarFallback><UserRound className="size-4" /></AvatarFallback>
                </Avatar>
                <div className="nola-sidebar-copy nola-sidebar-account__copy">
                  <span className="truncate">{account}</span>
                  <span className="nola-sidebar-account__email">{LOCAL_ACCOUNT_EMAIL}</span>
                </div>
                <Button type="button" variant="bare" size="icon-xs" className="nola-sidebar-account__action"
                  aria-label={t('homeRecordsUi.moreActions', { name: account })}>
                  <EllipsisVertical aria-hidden="true" />
                </Button>
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
