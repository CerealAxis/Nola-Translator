import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps extends HTMLAttributes<HTMLDivElement> { children?: ReactNode }
export interface FieldGroupProps extends HTMLAttributes<HTMLDivElement> { children?: ReactNode }
export interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}
export interface FieldDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export function FieldGroup({ className, ...props }: FieldGroupProps) {
  return <div data-slot="field-group" className={cn('flex flex-col gap-4', className)} {...props} />
}

export function Field({ className, ...props }: FieldProps) {
  return <div data-slot="field" className={cn('flex min-w-0 flex-col gap-2', className)} {...props} />
}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return <label data-slot="field-label" className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

export function FieldDescription({ className, ...props }: FieldDescriptionProps) {
  return <p data-slot="field-description" className={cn('text-xs text-muted', className)} {...props} />
}

export function FieldError({ className, children, ...props }: FieldDescriptionProps) {
  if (!children) return null
  return <p data-slot="field-error" role="alert" className={cn('text-xs text-danger', className)} {...props}>{children}</p>
}
