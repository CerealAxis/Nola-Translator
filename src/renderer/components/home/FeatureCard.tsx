import type { ReactNode } from 'react'
import { Button, Card } from '@heroui/react'
import { ArrowRight, ChevronRight } from 'lucide-react'

export interface FeatureCardProps {
  variant: 'primary' | 'secondary' | 'tertiary' | 'quaternary'
  icon: ReactNode
  title: string
  description: string
  buttonText: string
  onButtonClick: () => void
}
export function FeatureCard({ variant, icon, title, description, buttonText, onButtonClick }: FeatureCardProps): ReactNode {
  return (
    <Card className={'nola-entry nola-entry--' + variant}>
      <div className="nola-entry__top"><span className="nola-entry__icon">{icon}</span><ChevronRight aria-hidden="true" /></div>
      <Card.Header><Card.Title>{title}</Card.Title><Card.Description>{description}</Card.Description></Card.Header>
      <Card.Footer><Button variant={variant === 'primary' ? 'primary' : 'secondary'} onPress={onButtonClick} className="nola-entry__action">{buttonText}<ArrowRight aria-hidden="true" size={16} /></Button></Card.Footer>
      <div className="nola-entry__decoration" aria-hidden="true">{icon}</div>
    </Card>
  )
}

