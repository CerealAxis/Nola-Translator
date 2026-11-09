import type { ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useI18n, type UiLanguage } from '@/i18n'
import { useRoute } from '@/routes'
import poster from '@/assets/home-poster.png'
import { HomeFeatures } from './HomeFeatures'
import { HomeReleaseAnnouncements } from './HomeReleaseAnnouncements'
import { RecentMeetings } from './RecentMeetings'
import './home-page.css'

const posterCopy = {
  'zh-CN': { title: '电脑声音，实时翻译', action: '查看同传' },
  'zh-TW': { title: '電腦聲音，即時翻譯', action: '查看同步口譯' },
  'zh-HK': { title: '電腦聲音，即時翻譯', action: '查看即時傳譯' },
  ja: { title: 'PC の音声をリアルタイムで翻訳', action: '同時通訳を見る' },
  ko: { title: '컴퓨터 소리를 실시간으로 번역', action: '동시통역 보기' },
  en: { title: 'Translate computer audio in real time', action: 'Explore live translation' },
} satisfies Record<UiLanguage, { title: string; action: string }>

export function HomePage(): ReactNode {
  const { language } = useI18n()
  const { path } = useRoute()
  const copy = posterCopy[language]

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-home nola-home--dashboard">
        <Card className="nola-home-poster">
          <img src={poster} alt="" className="nola-home-poster__image" />
          <div className="nola-home-poster__copy">
            <h1>{copy.title}</h1>
            <Button
              size="sm"
              aria-controls="home-feature-workspace"
              onClick={() => document.getElementById('home-feature-workspace')?.scrollIntoView({ block: 'start' })}
            >
              {copy.action}
              <ArrowDown data-icon="inline-end" aria-hidden="true" />
            </Button>
          </div>
        </Card>
        <HomeFeatures />
        <RecentMeetings />
        <HomeReleaseAnnouncements />
      </div>
    </ErrorBoundary>
  )
}
