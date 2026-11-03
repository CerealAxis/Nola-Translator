/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
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
  active?: boolean
  onPress?: () => void
}
export interface AppShellProps {
  children: ReactNode
  navigation?: AppShellNavigationItem[]
  className?: string
}
export function AppShell({ children, navigation, className = '' }: AppShellProps) {
  const { t } = useI18n()
  const compact = useIsMobile(1025)
  const account = t('shellUi.localAccount')
  const accountEmail = 'local@nola.invalid'

  return (
    <div className={`nola-app-shell ${className}`}>
      <FeatureActivityNotice />
      <SidebarProvider className="nola-shell-layout" defaultOpen={!compact}>
        <Sidebar className="nola-sidebar">
          <SidebarHeader className="nola-sidebar-brand">
            <img src={nolaLogoUrl} alt={t('app.name')} />
            <span className="nola-sidebar-copy" aria-hidden="true">{t('app.name')}</span>
          </SidebarHeader>
          <SidebarContent className="nola-sidebar-nav" aria-label={t('shellUi.mainNavigation')}>
            <SidebarMenu>
              {navigation?.map(item => (
                <SidebarMenuItem key={item.id}>
                  <NavigationItem {...item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="nola-sidebar-footer">
            <Separator />
            <div className="nola-sidebar-account" title={`${account} · ${accountEmail}`}>
              <Avatar aria-hidden="true"><AvatarFallback>N</AvatarFallback></Avatar>
              <div className="nola-sidebar-copy">
                <span>{account}</span>
                <small dir="ltr">{accountEmail}</small>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="nola-shell-content">
          <TitleBar brand={false} leading={<SidebarTrigger
            className="nola-no-drag nola-titlebar-icon nola-sidebar-trigger"
            expandLabel={t('shellUi.expandSidebar')}
            collapseLabel={t('shellUi.collapseSidebar')}
          />} />
          <div className="nola-app-body">
            <main className="nola-main">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}
