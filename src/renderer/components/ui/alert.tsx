import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> { variant?: 'default' | 'accent' | 'danger' | 'warning' | 'success' }
export interface AlertTitleProps extends HTMLAttributes<HTMLHeadingElement> {}
export interface AlertDescriptionProps extends HTMLAttributes<HTMLDivElement> {}

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return <div role="alert" data-slot="alert" data-variant={variant} className={cn([
    'nola-alert group/alert relative grid w-full gap-1 rounded-nola-ui-lg border border-nola-ui-border bg-nola-ui-muted px-4 py-3 text-left text-sm text-nola-ui-foreground has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*="size-"])]:size-4',
    variant === 'accent' && 'border-nola-ui-primary/25 bg-nola-ui-primary/10 text-nola-ui-primary',
    variant === 'danger' && 'border-nola-ui-destructive/25 bg-nola-ui-destructive/10 text-nola-ui-destructive',
    variant === 'warning' && 'border-nola-ui-warning/25 bg-nola-ui-warning/10 text-nola-ui-warning',
    variant === 'success' && 'border-nola-ui-success/25 bg-nola-ui-success/10 text-nola-ui-success',
    className,
  ].filter(Boolean).join(' '))} {...props} />
}
export function AlertTitle({ className, ...props }: AlertTitleProps) {
  return <h3 data-slot="alert-title" className={cn('font-medium text-nola-ui-foreground group-has-[>svg]/alert:col-start-2', className)} {...props} />
}
export function AlertDescription({ className, ...props }: AlertDescriptionProps) {
  return <div data-slot="alert-description" className={cn('text-sm text-nola-ui-muted-foreground group-has-[>svg]/alert:col-start-2 [&_p:not(:last-child)]:mb-4', className)} {...props} />
}
