/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import { EllipsisVertical, UserRound } from 'lucide-react'
import nolaAvatarUrl from '@/assets/nola-avatar.png'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ResizableHandle } from '@/components/ui/resizable'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import nolaLogoUrl from '../../../../assets/brand/nola-logo.svg'
import { FeatureActivityNotice } from './FeatureActivityNotice'
import { TitleBar } from './TitleBar'
import { NavigationItem } from './NavigationItem'
import type { NavigationItemProps } from './NavigationItem'

export interface AppShellNavigationItem extends NavigationItemProps {
  id: string
  path: string
  section: 'overview' | 'features' | 'settings'
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
  const { navigate } = useRoute()
  const compact = useIsMobile(1025)
  const name = 'Nola Translator'
  const account = t('shellUi.localAccount')
  const settings = navigation?.some(item => item.id === 'settings-back')
  const pageTitle = title ?? (settings ? t('nav.settings') : navigation?.find(item => item.active)?.label) ?? name
  const home = navigation?.find(item => item.id === 'home')

  return (
    <div className={`nola-app-shell ${className}`}>
      <FeatureActivityNotice />
      <SidebarProvider className="nola-shell-layout" defaultOpen={!compact} storageKey="nola-sidebar-width">
        <Sidebar variant="inset" className="nola-sidebar">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <Button type="button" variant="bare" aria-label={name}
                  className="nola-sidebar-brand" onClick={settings ? () => navigate('#/') : home?.onPress}>
                  <img src={nolaLogoUrl} alt="" />
                  <span className="nola-sidebar-copy" aria-hidden="true">{name}</span>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent key={settings ? 'settings' : 'main'} className="nola-sidebar-nav"
            data-settings-navigation={settings || undefined} aria-label={t(settings ? 'modelsSettingsUi.settingsTabs' : 'shellUi.mainNavigation')}>
            {navigation && (settings ? ['settings'] as const : ['overview', 'features', 'settings'] as const).map(section => (
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
        <ResizableHandle className="nola-sidebar-resizer nola-no-drag" aria-label={t('shellUi.resizeSidebar')} />
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
