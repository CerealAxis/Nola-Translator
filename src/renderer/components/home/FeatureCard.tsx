import type { ReactNode } from 'react'
import { Button } from '../ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { ArrowRight, ChevronRight } from 'lucide-react'

export interface FeatureCardProps {
  onboardingTarget?: string
  variant: 'primary' | 'secondary' | 'tertiary' | 'quaternary'
  icon: ReactNode
  title: string
  description: string
  buttonText: string
  onButtonClick: () => void
}
export function FeatureCard({ variant, icon, title, description, buttonText, onButtonClick, onboardingTarget }: FeatureCardProps): ReactNode {
  return (
    <Card className={['nola-entry', 'nola-entry--' + variant, 'flex flex-col'].filter(Boolean).join(' ')} data-onboarding={onboardingTarget}>
      <div className="nola-entry__top"><span className="nola-entry__icon">{icon}</span><ChevronRight aria-hidden="true" /></div>
      {/*
       * The home stylesheet styles the entry card through the shared `card__*`
       * class names, so those hooks ride along with the shadcn parts; `p-0`
       * keeps the parts from adding padding the entry card never had.
       */}
      <CardHeader className="card__header p-0">
        <CardTitle className="card__title">{title}</CardTitle>
        <CardDescription className="card__description">{description}</CardDescription>
      </CardHeader>
      <CardFooter className="card__footer border-0 bg-transparent p-0">
        <Button variant={variant === 'primary' ? 'default' : 'secondary'} onClick={onButtonClick} className="nola-entry__action">{buttonText}<ArrowRight aria-hidden="true" size={16} /></Button>
      </CardFooter>
      <div className="nola-entry__decoration" aria-hidden="true">{icon}</div>
    </Card>
  )
}

