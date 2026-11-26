import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  'nola-badge group/badge inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 type-small font-normal whitespace-nowrap transition-all    has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-nola-ui-destructive aria-invalid:ring-nola-ui-destructive/20 dark:aria-invalid:ring-nola-ui-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-nola-ui-primary text-nola-ui-primary-foreground [a]:hover:bg-[var(--primary-hover)]',
        secondary: 'bg-nola-ui-secondary text-nola-ui-secondary-foreground [a]:hover:bg-nola-ui-secondary/80',
        destructive: 'bg-danger-soft text-danger-soft-foreground focus-visible:ring-nola-ui-destructive/20',
        outline: 'border-nola-ui-border text-nola-ui-foreground [a]:hover:bg-nola-ui-muted',
        ghost: 'hover:bg-nola-ui-muted hover:text-nola-ui-muted-foreground',
        link: 'text-nola-ui-primary underline-offset-4 hover:underline',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        accent: 'bg-accent-soft text-accent-soft-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>
export interface BadgeProps extends useRender.ComponentProps<'span'> { variant?: BadgeVariant }

export function Badge({ variant = 'secondary', className, render, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: 'badge', variant },
  })
}
