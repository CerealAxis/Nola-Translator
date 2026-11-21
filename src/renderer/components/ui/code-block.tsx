import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const codeBlockVariants = cva(
  'group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl text-sm has-[>[data-slot=code-block-content]:focus-visible]:ring-[3px] has-[>[data-slot=code-block-content]:focus-visible]:ring-ring/50 data-[size=sm]:rounded-lg data-[size=sm]:text-xs',
  {
    variants: {
      variant: {
        default: 'border border-input bg-card text-card-foreground has-[>[data-slot=code-block-content]:focus-visible]:border-ring',
        destructive: 'border border-destructive/30 text-destructive dark:border-destructive/40',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function CodeBlock({ className, variant = 'default', size = 'default', ...props }:
  ComponentProps<'div'> & VariantProps<typeof codeBlockVariants> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="code-block"
      data-variant={variant}
      data-size={size}
      className={cn(codeBlockVariants({ variant }), className)}
      {...props}
    />
  )
}

export function CodeBlockHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="code-block-header" className={cn(
      'flex min-w-0 shrink-0 items-center gap-2 px-4 pt-4 text-muted-foreground group-data-[size=sm]/code-block:px-3 group-data-[size=sm]/code-block:pt-3 group-data-[variant=destructive]/code-block:text-destructive *:has-[>[data-slot=code-block-title]]:min-w-0',
      className,
    )} {...props} />
  )
}

export function CodeBlockTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="code-block-title" className={cn(
      "min-w-0 truncate font-sans text-sm font-medium text-foreground group-data-[size=sm]/code-block:text-xs group-data-[variant=destructive]/code-block:text-destructive [&_svg]:pointer-events-none [&_svg]:inline-block [&_svg]:align-middle [&_svg:not([class*='size-'])]:size-4 group-data-[size=sm]/code-block:[&_svg:not([class*='size-'])]:size-3.5 *:[svg]:me-1.5",
      className,
    )} {...props} />
  )
}

export function CodeBlockActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-actions"
    className={cn('-my-1 ms-auto -me-1.5 flex shrink-0 items-center gap-1', className)} {...props} />
}
