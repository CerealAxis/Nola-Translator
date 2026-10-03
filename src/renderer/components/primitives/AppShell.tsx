/** Desktop shell geometry is owned here; route content owns its only padding. */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
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
  return (
    <div className={`nola-app-shell ${className}`}>
      <TitleBar />
      <div className="nola-app-body">
        <aside className="nola-sidebar">
          <nav className="nola-sidebar-nav">
            {navigation?.map(item => <NavigationItem key={item.id} {...item} />)}
          </nav>
        </aside>
        <main className="nola-main nola-scrollbar">{children}</main>
      </div>
    </div>
  )
}
