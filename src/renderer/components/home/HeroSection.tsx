import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'

export function HeroSection(): ReactNode {
  return (
    <Card className="nola-home-hero">
      <CardContent className="nola-home-hero__copy flex flex-1 flex-col gap-1">
        <h1><span>Nola</span> Translator</h1>
      </CardContent>
      <img className="nola-home-hero__art" src={import.meta.env.BASE_URL + 'hero-globe.png'} alt="" aria-hidden="true" />
    </Card>
  )
}

