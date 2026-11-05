import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd" className={cn('pointer-events-none inline-flex h-5 min-w-5 items-center justify-center select-none rounded-nola-ui-sm bg-surface-tertiary px-1 text-xs font-medium text-foreground', className)} {...props} />
}

function KbdGroup({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd-group" className={cn('inline-flex flex-wrap items-center gap-1', className)} {...props} />
}

export { Kbd, KbdGroup }
