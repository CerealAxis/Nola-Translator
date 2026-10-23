import type { ComponentProps } from 'react'

export interface CardProps extends ComponentProps<'div'> {
  size?: 'default' | 'sm'
}
export interface CardHeaderProps extends ComponentProps<'div'> {}
export interface CardTitleProps extends ComponentProps<'div'> {}
export interface CardDescriptionProps extends ComponentProps<'div'> {}
export interface CardActionProps extends ComponentProps<'div'> {}
export interface CardContentProps extends ComponentProps<'div'> {}
export interface CardFooterProps extends ComponentProps<'div'> {}

export function Card({ className, size = 'default', ...props }: CardProps) {
  return <div data-slot="card" data-size={size} className={['card group/card', className].filter(Boolean).join(' ')} {...props} />
}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div data-slot="card-header" className={['card__header', className].filter(Boolean).join(' ')} {...props} />
}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return <div data-slot="card-title" className={['card__title', className].filter(Boolean).join(' ')} {...props} />
}

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <div data-slot="card-description" className={['card__description', className].filter(Boolean).join(' ')} {...props} />
}

export function CardAction({ className, ...props }: CardActionProps) {
  return <div data-slot="card-action" className={['card__action', className].filter(Boolean).join(' ')} {...props} />
}

export function CardContent({ className, ...props }: CardContentProps) {
  return <div data-slot="card-content" className={['card__content', className].filter(Boolean).join(' ')} {...props} />
}

export function CardFooter({ className, ...props }: CardFooterProps) {
  return <div data-slot="card-footer" className={['card__footer', className].filter(Boolean).join(' ')} {...props} />
}
