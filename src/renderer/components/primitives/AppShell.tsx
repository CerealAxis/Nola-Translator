/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { CircleHelp, EllipsisVertical, LogIn, Settings, UserRound } from 'lucide-react'
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
import { notifyInfo } from './notify'
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
  sidebarContent?: ReactNode
  heading?: ReactNode
  actions?: ReactNode
  className?: string
}

const LOCAL_ACCOUNT_EMAIL = 'local@xaviermc.top'
const accountCopy = {
  'zh-CN': { login: '登录', unavailable: '登录功能未启用' },
  'zh-TW': { login: '登入', unavailable: '登入功能尚未啟用' },
  'zh-HK': { login: '登入', unavailable: '登入功能尚未啟用' },
  ja: { login: 'ログイン', unavailable: 'ログイン機能はまだ有効になっていません' },
  ko: { login: '로그인', unavailable: '로그인 기능이 아직 활성화되지 않았습니다' },
  en: { login: 'Log in', unavailable: 'Login is not enabled yet' },
} as const
const ACCOUNT_MENU_ITEM = 'nola-menu-item flex cursor-pointer items-center gap-3 rounded-[var(--radius-xl)] px-3 py-2 type-body'

export function AppShell({ children, navigation, title, sidebarContent, heading, actions, className = '' }: AppShellProps) {
  const { t, language } = useI18n()
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
                  className="nola-sidebar-brand" onClick={settings || sidebarContent ? () => navigate('#/') : home?.onPress}>
                  <img src={nolaLogoUrl} alt="" />
                  <span className="nola-sidebar-copy" aria-hidden="true">{name}</span>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent key={settings ? 'settings' : 'main'} className="nola-sidebar-nav"
            data-settings-navigation={settings || undefined} aria-label={t(settings ? 'modelsSettingsUi.settingsTabs' : 'shellUi.mainNavigation')}>
            {sidebarContent ?? (navigation && (settings ? ['settings'] as const : ['overview', 'features', 'settings'] as const).map(section => (
              <SidebarGroup key={section}>
                {section === 'features' && <SidebarGroupLabel>{t('shellUi.toolsGroup')}</SidebarGroupLabel>}
                <SidebarMenu>
                  {navigation.filter(item => item.section === section).map(item => (
                    <SidebarMenuItem key={item.id}><NavigationItem {...item} /></SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )))}
          </SidebarContent>
          <SidebarFooter className="nola-sidebar-footer">
            <SidebarMenu>
              <SidebarMenuItem>
                <Menu.Root>
                  <Menu.Trigger render={<Button type="button" variant="bare" className="nola-sidebar-account px-1" aria-label={t('homeRecordsUi.moreActions', { name: account })} />}>
                    <Avatar aria-hidden="true">
                      <AvatarImage src={nolaAvatarUrl} alt="" />
                      <AvatarFallback><UserRound className="size-4" /></AvatarFallback>
                    </Avatar>
                    <span className="nola-sidebar-copy nola-sidebar-account__copy">
                      <span className="truncate">{account}</span>
                      <span className="nola-sidebar-account__email">{LOCAL_ACCOUNT_EMAIL}</span>
                    </span>
                    <EllipsisVertical className="nola-sidebar-account__action" aria-hidden="true" />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner className="z-dropdown" side="top" align="start" sideOffset={4}>
                      <Menu.Popup data-slot="dropdown-menu-content" className="z-dropdown min-w-56 rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <Avatar aria-hidden="true"><AvatarImage src={nolaAvatarUrl} alt="" /><AvatarFallback><UserRound /></AvatarFallback></Avatar>
                          <div className="min-w-0"><div className="truncate">{account}</div><div className="nola-sidebar-account__email">{LOCAL_ACCOUNT_EMAIL}</div></div>
                        </div>
                        <Separator />
                        <Menu.List>
                          <Menu.Item className={ACCOUNT_MENU_ITEM} onClick={() => navigate('#/settings/general')}><Settings aria-hidden="true" />{t('nav.settings')}</Menu.Item>
                          <Menu.Item className={ACCOUNT_MENU_ITEM} render={<a href="https://nola.xaviermc.top" target="_blank" rel="noreferrer" />}><CircleHelp aria-hidden="true" />{t('modelsSettingsUi.help')}</Menu.Item>
                          <Menu.Item className={ACCOUNT_MENU_ITEM} onClick={() => notifyInfo(accountCopy[language].unavailable)}><LogIn aria-hidden="true" />{accountCopy[language].login}</Menu.Item>
                        </Menu.List>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <ResizableHandle className="nola-sidebar-resizer nola-no-drag" aria-label={t('shellUi.resizeSidebar')} />
        <SidebarInset className="nola-shell-content">
          <TitleBar brand={false} actions={actions} leading={
            <div className="nola-shell-heading">
              <SidebarTrigger className="nola-no-drag nola-titlebar-icon nola-sidebar-trigger"
                expandLabel={t('shellUi.expandSidebar')} collapseLabel={t('shellUi.collapseSidebar')} />
              <Separator orientation="vertical" />
              <div className="nola-shell-heading__title" title={pageTitle}>{heading ?? pageTitle}</div>
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
