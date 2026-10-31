import { Button } from '@/components/ui/button'
import { CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ArrowRight, X } from 'lucide-react'

export interface TourLessonProps {
  title: string
  description: string
  progress: string
  nextLabel: string
  exitLabel?: string
  busy: boolean
  onNext: () => void
  onExit: () => void
}

export function TourLesson({ title, description, progress, nextLabel, exitLabel, busy, onNext, onExit }: TourLessonProps) {
  return <>
    <CardHeader>
      <CardTitle id="onboarding-heading">{title}</CardTitle>
      <CardDescription id="onboarding-body">{description}</CardDescription>
      {exitLabel ? <CardAction><Button variant="secondary" size="icon" className="onboarding-tour__close" aria-label={exitLabel} onClick={onExit}><X aria-hidden="true" /></Button></CardAction> : null}
    </CardHeader>
    <CardFooter className="onboarding-tour__footer">
      <span className="onboarding-tour__progress">{progress}</span>
      <Button disabled={busy} aria-busy={busy} onClick={onNext}>{busy ? <Spinner /> : null}{nextLabel}<ArrowRight aria-hidden="true" /></Button>
    </CardFooter>
  </>
}
