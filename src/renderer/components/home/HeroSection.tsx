import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'
import { Zap, Globe, Users, Video } from 'lucide-react'
import { useI18n } from '@/i18n'

export function HeroSection(): ReactNode {
  const { t } = useI18n()
  const features = [
    { icon: Zap, label: t('homeRecordsUi.speech') },
    { icon: Globe, label: t('homeRecordsUi.multilingual') },
    { icon: Users, label: t('homeRecordsUi.meetings') },
    { icon: Video, label: t('homeRecordsUi.live') },
  ]
  return (
    <Card className="nola-home-hero">
      <CardContent className="nola-home-hero__copy flex flex-1 flex-col gap-1">
        <h1><span>Nola</span> Translator</h1>
        <p>{t('homeRecordsUi.tagline')}</p>
        <div className="nola-home-hero__features">
          {features.map(({ icon: Icon, label }) => (
            <span key={label}><i><Icon aria-hidden="true" /></i>{label}</span>
          ))}
        </div>
      </CardContent>
      <img className="nola-home-hero__art" src={import.meta.env.BASE_URL + 'hero-globe.png'} alt="" aria-hidden="true" />
    </Card>
  )
}

