import type { ReactNode } from 'react'
import { Button } from '../ui/button'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { ArrowRight } from 'lucide-react'

export interface FeatureCardProps {
  onboardingTarget?: string
  className?: string
  primary?: boolean
  icon: ReactNode
  title: string
  description?: string
  buttonText: string
  onButtonClick: () => void
}
export function FeatureCard({ primary, className, icon, title, description, buttonText, onButtonClick, onboardingTarget }: FeatureCardProps): ReactNode {
  return (
    <Card className={['nola-entry', className].filter(Boolean).join(' ')} data-onboarding={onboardingTarget}>
      <div className="nola-entry__decoration" aria-hidden="true">{icon}</div>
      <CardHeader className="p-0">
        <CardTitle>{title}</CardTitle>
        <CardAction className="nola-entry__icon">{icon}</CardAction>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardFooter className="border-0 bg-transparent p-0">
        <Button variant={primary ? 'default' : 'outline'} size="sm" onClick={onButtonClick} className="nola-entry__action">{buttonText}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
      </CardFooter>
    </Card>
  )
}

