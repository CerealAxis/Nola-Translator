import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface HomeListRowProps {
  icon: LucideIcon
  title: string
  detail: ReactNode
  action: ReactNode
}

export function HomeListRow({ icon: Icon, title, detail, action }: HomeListRowProps) {
  return (
    <div className="nola-home-list-row">
      <span className="nola-home-list-row__icon">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="nola-home-list-row__text">
        <span className="nola-body-strong">{title}</span>
        <span className="nola-caption text-nola-ui-muted-foreground">{detail}</span>
      </div>
      {action}
    </div>
  )
}
