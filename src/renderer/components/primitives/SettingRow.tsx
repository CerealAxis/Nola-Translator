import type { ReactNode } from 'react'
import { Description, Label } from '@heroui/react'
export interface SettingRowProps {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  className?: string
}
export function SettingRow({ label, desc, children, className = '' }: SettingRowProps) {
  return (
    <div className={`nola-setting-row ${className}`}>
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {desc ? <Description className="mt-1 text-xs text-muted">{desc}</Description> : null}
      </div>
      <div className="nola-setting-control">{children}</div>
    </div>
  )
}
