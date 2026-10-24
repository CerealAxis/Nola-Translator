import type { ComponentProps } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Breadcrumb({ className, ...props }: ComponentProps<'nav'>) {
  return <nav className={cn(className)} {...props} />
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return <ol className={cn('flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground', className)} {...props} />
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('inline-flex items-center gap-1.5', className)} {...props} />
}

export function BreadcrumbSeparator({ className, ...props }: ComponentProps<'li'>) {
  return <li aria-hidden="true" role="presentation" className={cn('[&>svg]:size-3.5', className)} {...props}><ChevronRight /></li>
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-current="page" className={cn('font-normal text-foreground', className)} {...props} />
}
