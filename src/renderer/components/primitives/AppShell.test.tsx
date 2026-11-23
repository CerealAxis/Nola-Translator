import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const actions = vi.hoisted(() => ({ navigate: vi.fn(), notify: vi.fn() }))
vi.mock('@/routes', () => ({ useRoute: () => ({ navigate: actions.navigate }) }))
vi.mock('@/i18n', () => ({ useI18n: () => ({ language: 'zh-CN', t: (key: string) => ({ 'shellUi.localAccount': '本地账户', 'homeRecordsUi.moreActions': '账户菜单', 'nav.settings': '设置', 'modelsSettingsUi.help': '帮助' }[key] ?? key) }) }))
vi.mock('./notify', () => ({ notifyInfo: actions.notify }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/components/ui/resizable', () => ({ ResizableHandle: () => null }))
vi.mock('@/components/ui/sidebar', async () => {
  const React = await import('react')
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  return Object.fromEntries(['Sidebar', 'SidebarContent', 'SidebarFooter', 'SidebarGroup', 'SidebarGroupLabel', 'SidebarHeader', 'SidebarInset', 'SidebarMenu', 'SidebarMenuItem', 'SidebarProvider', 'SidebarTrigger'].map(name => [name, container]))
})
vi.mock('./TitleBar', () => ({ TitleBar: () => null }))
vi.mock('./FeatureActivityNotice', () => ({ FeatureActivityNotice: () => null }))

it('opens account actions and connects settings, help and the login notice', async () => {
  render(<AppShell>content</AppShell>)
  fireEvent.click(screen.getByRole('button', { name: '账户菜单' }))
  expect(await screen.findByRole('menuitem', { name: '帮助' })).toHaveAttribute('href', 'https://nola.xaviermc.top')
  fireEvent.click(screen.getByRole('menuitem', { name: '登录' }))
  expect(actions.notify).toHaveBeenCalledWith('登录功能未启用')
  fireEvent.click(screen.getByRole('button', { name: '账户菜单' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: '设置' }))
  expect(actions.navigate).toHaveBeenCalledWith('#/settings/general')
})
