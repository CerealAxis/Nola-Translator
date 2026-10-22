import type { ComponentProps, HTMLAttributes } from 'react'
import { Button } from './button'

export interface PaginationProps extends HTMLAttributes<HTMLElement> {}
export interface PaginationContentProps extends HTMLAttributes<HTMLUListElement> {}
export interface PaginationItemProps extends HTMLAttributes<HTMLLIElement> {}
export interface PaginationLinkProps extends ComponentProps<typeof Button> { isActive?: boolean }

export function Pagination({ className, ...props }: PaginationProps) {
  return <nav data-slot="pagination" className={['nola-pagination flex items-center', className].filter(Boolean).join(' ')} {...props} />
}
export function PaginationContent({ className, ...props }: PaginationContentProps) {
  return <ul data-slot="pagination-content" className={['nola-pagination-content m-0 flex list-none flex-row items-center gap-1 p-0', className].filter(Boolean).join(' ')} {...props} />
}
export function PaginationItem(props: PaginationItemProps) { return <li data-slot="pagination-item" {...props} /> }
export function PaginationLink({ isActive, ...props }: PaginationLinkProps) {
  return <Button size="sm" variant={isActive ? 'default' : 'secondary'} aria-current={isActive ? 'page' : undefined} {...props} />
}
